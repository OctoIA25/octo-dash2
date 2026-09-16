-- Testes de 20260916_whatsapp_conversa_segue_corretor_do_lead.sql,
-- 20260916_whatsapp_conversa_completa_vinculo_do_lead.sql,
-- 20260916_whatsapp_gestor_ve_lead_sem_classificacao.sql (+ braço de equipe da
-- 20260830): quem vê a conversa de um lead.
--
-- Roda numa transação e DESFAZ tudo (ROLLBACK no fim), então pode rodar contra o
-- banco real depois das migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/whatsapp_conversa_segue_corretor_do_lead.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = NOTICE final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.como(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.como_sessao() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'none', true);
END $$;

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', p_caso;
  END IF;
END $$;

-- Quantas conversas do telefone de teste o usuário enxerga pela RLS.
CREATE FUNCTION pg_temp.ve(p_uid uuid, p_phone text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  PERFORM pg_temp.como(p_uid);
  SELECT count(*) INTO n FROM public.whatsapp_conversations WHERE contact_phone = p_phone;
  PERFORM pg_temp.como_sessao();
  RETURN n > 0;
END $$;

CREATE FUNCTION pg_temp.dono(p_phone text) RETURNS uuid LANGUAGE sql AS $$
  SELECT assigned_user_id FROM public.whatsapp_conversations
   WHERE tenant_id = '0a5e0000-0000-4000-a000-00000000000a' AND contact_phone = p_phone;
$$;

-- ----------------------------------------------------------------------------
-- Fixtures: gestora de prontos com equipe (corretora 1 = ...002), corretora 2
-- (...003) fora dela. Os leads dos casos de equipe são marcados 'lancamento' (fora
-- da atuação) para que só o braço de equipe os mostre à gestora.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('0a5e0000-0000-4000-a000-000000000001', 'gestora@teste-wa.dev'),
  ('0a5e0000-0000-4000-a000-000000000002', 'corretora1@teste-wa.dev'),
  ('0a5e0000-0000-4000-a000-000000000003', 'corretora2@teste-wa.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('0a5e0000-0000-4000-a000-00000000000a', 'teste-wa', 'Teste WA');

INSERT INTO public.teams (id, tenant_id, name, leader_user_ids) VALUES
  ('0a5e0000-0000-4000-a000-0000000000e1', '0a5e0000-0000-4000-a000-00000000000a', 'Prontos',
   ARRAY['0a5e0000-0000-4000-a000-000000000001'::uuid]);

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions, team_id) VALUES
  ('0a5e0000-0000-4000-a000-00000000000a', '0a5e0000-0000-4000-a000-000000000001', 'team_leader', '{"atuacao": ["prontos"]}', NULL),
  ('0a5e0000-0000-4000-a000-00000000000a', '0a5e0000-0000-4000-a000-000000000002', 'corretor', '{}', '0a5e0000-0000-4000-a000-0000000000e1'),
  ('0a5e0000-0000-4000-a000-00000000000a', '0a5e0000-0000-4000-a000-000000000003', 'corretor', '{}', NULL);

-- ----------------------------------------------------------------------------
-- 1. Lead entra já distribuído → conversa nasce com o dono do lead
-- ----------------------------------------------------------------------------
INSERT INTO public.leads (id, tenant_id, name, phone, assigned_agent_id) VALUES
  ('0a5e0000-0000-4000-a000-0000000000f1', '0a5e0000-0000-4000-a000-00000000000a',
   'Lead Teste', '(11) 90000-0001', '0a5e0000-0000-4000-a000-000000000002');
-- A classificação da entrada é automática (tr_leads_classificar); fixar depois.
UPDATE public.leads SET classification = '{lancamento}' WHERE id = '0a5e0000-0000-4000-a000-0000000000f1';

SELECT pg_temp.checa(pg_temp.dono('5511900000001') = '0a5e0000-0000-4000-a000-000000000002',
  'lead inserido com corretor: conversa ganha o dono');
SELECT pg_temp.checa(pg_temp.ve('0a5e0000-0000-4000-a000-000000000002', '5511900000001'),
  'corretora vê a conversa do próprio lead');
SELECT pg_temp.checa(pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '5511900000001'),
  'gestora vê a conversa do lead da corretora da equipe');
SELECT pg_temp.checa(NOT pg_temp.ve('0a5e0000-0000-4000-a000-000000000003', '5511900000001'),
  'corretora de fora não vê');

-- ----------------------------------------------------------------------------
-- 2. Edição que não mexe no corretor não sobrescreve atribuição manual (/assign)
-- ----------------------------------------------------------------------------
UPDATE public.whatsapp_conversations SET assigned_user_id = '0a5e0000-0000-4000-a000-000000000003'
 WHERE contact_phone = '5511900000001';
UPDATE public.leads SET comments = 'anotação' WHERE id = '0a5e0000-0000-4000-a000-0000000000f1';
SELECT pg_temp.checa(pg_temp.dono('5511900000001') = '0a5e0000-0000-4000-a000-000000000003',
  'update sem troca de corretor não mexe no dono');

-- ----------------------------------------------------------------------------
-- 3. Transferência do lead → conversa acompanha
-- ----------------------------------------------------------------------------
-- Lead com a corretora 1 e conversa com a 2 (manual): lead 1 → 2 → 1.
UPDATE public.leads SET assigned_agent_id = '0a5e0000-0000-4000-a000-000000000003'
 WHERE id = '0a5e0000-0000-4000-a000-0000000000f1';
UPDATE public.leads SET assigned_agent_id = '0a5e0000-0000-4000-a000-000000000002'
 WHERE id = '0a5e0000-0000-4000-a000-0000000000f1';
SELECT pg_temp.checa(pg_temp.dono('5511900000001') = '0a5e0000-0000-4000-a000-000000000002',
  'transferência: conversa muda de dono');
SELECT pg_temp.checa(NOT pg_temp.ve('0a5e0000-0000-4000-a000-000000000003', '5511900000001'),
  'transferência: corretora anterior perde acesso');
SELECT pg_temp.checa(pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '5511900000001'),
  'transferência para dentro da equipe: gestora volta a ver');

UPDATE public.leads SET assigned_agent_id = '0a5e0000-0000-4000-a000-000000000003'
 WHERE id = '0a5e0000-0000-4000-a000-0000000000f1';
SELECT pg_temp.checa(NOT pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '5511900000001'),
  'transferência para fora da equipe: gestora deixa de ver');

-- ----------------------------------------------------------------------------
-- 4. Lead volta a ficar sem corretor → conversa sem dono
-- ----------------------------------------------------------------------------
UPDATE public.leads SET assigned_agent_id = NULL WHERE id = '0a5e0000-0000-4000-a000-0000000000f1';
SELECT pg_temp.checa(pg_temp.dono('5511900000001') IS NULL, 'lead sem corretor: conversa sem dono');
SELECT pg_temp.checa(NOT pg_temp.ve('0a5e0000-0000-4000-a000-000000000003', '5511900000001'),
  'lead sem corretor: ex-dona não vê');

-- ----------------------------------------------------------------------------
-- 5. Lead sem corretor não apaga dono de conversa que já existia
-- ----------------------------------------------------------------------------
INSERT INTO public.whatsapp_conversations (tenant_id, contact_phone, assigned_user_id) VALUES
  ('0a5e0000-0000-4000-a000-00000000000a', '5511900000002', '0a5e0000-0000-4000-a000-000000000002');
INSERT INTO public.leads (tenant_id, name, phone) VALUES
  ('0a5e0000-0000-4000-a000-00000000000a', 'Lead Sem Corretor', '11900000002');
SELECT pg_temp.checa(pg_temp.dono('5511900000002') = '0a5e0000-0000-4000-a000-000000000002',
  'lead novo sem corretor preserva o dono da conversa existente');

-- ----------------------------------------------------------------------------
-- 6. Conversa criada DEPOIS do lead, por fora (como a Lia faz): lead_id sem
--    lead_source_table e sem dono → completa a origem e herda o corretor
-- ----------------------------------------------------------------------------
INSERT INTO public.leads (id, tenant_id, name, phone, assigned_agent_id) VALUES
  ('0a5e0000-0000-4000-a000-0000000000f3', '0a5e0000-0000-4000-a000-00000000000a',
   'Lead da Lia', '+5511900000003', '0a5e0000-0000-4000-a000-000000000002');
UPDATE public.leads SET classification = '{lancamento}' WHERE id = '0a5e0000-0000-4000-a000-0000000000f3';
-- wa_id da Meta sem o 9º dígito: vira uma segunda conversa, a que recebe as mensagens.
INSERT INTO public.whatsapp_conversations (tenant_id, contact_phone, lead_id, last_message_at) VALUES
  ('0a5e0000-0000-4000-a000-00000000000a', '551100000003', '0a5e0000-0000-4000-a000-0000000000f3', now());
SELECT pg_temp.checa(
  (SELECT lead_source_table = 'leads' AND assigned_user_id = '0a5e0000-0000-4000-a000-000000000002'
     FROM public.whatsapp_conversations WHERE contact_phone = '551100000003'),
  'conversa criada por fora com lead_id: completa origem e dono');
SELECT pg_temp.checa(pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '551100000003'),
  'gestora vê a conversa criada pela Lia do lead da equipe');

UPDATE public.leads SET assigned_agent_id = '0a5e0000-0000-4000-a000-000000000003'
 WHERE id = '0a5e0000-0000-4000-a000-0000000000f3';
SELECT pg_temp.checa(pg_temp.dono('551100000003') = '0a5e0000-0000-4000-a000-000000000003',
  'transferência também move a conversa criada pela Lia');

-- ----------------------------------------------------------------------------
-- 7. Lead sem corretor: gestora vê o sem classificação (como no Kanban), não o
--    de fora da atuação; corretor não vê; lead apagado não vaza
-- ----------------------------------------------------------------------------
INSERT INTO public.leads (id, tenant_id, name, phone) VALUES
  ('0a5e0000-0000-4000-a000-0000000000f4', '0a5e0000-0000-4000-a000-00000000000a', 'Sem Classificação', '11900000004'),
  ('0a5e0000-0000-4000-a000-0000000000f5', '0a5e0000-0000-4000-a000-00000000000a', 'Lançamento', '11900000005');
UPDATE public.leads SET classification = '{indefinido}' WHERE id = '0a5e0000-0000-4000-a000-0000000000f4';
UPDATE public.leads SET classification = '{lancamento}' WHERE id = '0a5e0000-0000-4000-a000-0000000000f5';
SELECT pg_temp.checa(pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '5511900000004'),
  'gestora vê a conversa do lead sem classificação');
SELECT pg_temp.checa(NOT pg_temp.ve('0a5e0000-0000-4000-a000-000000000003', '5511900000004'),
  'corretor não vê a conversa do lead sem classificação de outro');
SELECT pg_temp.checa(NOT pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '5511900000005'),
  'gestora de prontos não vê lead de lançamento sem corretor');

UPDATE public.leads SET classification = NULL WHERE id = '0a5e0000-0000-4000-a000-0000000000f4';
SELECT pg_temp.checa(pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '5511900000004'),
  'gestora vê a conversa do lead com classificação nula');

INSERT INTO public.whatsapp_conversations (tenant_id, contact_phone, lead_id) VALUES
  ('0a5e0000-0000-4000-a000-00000000000a', '5511900000006', '0a5e0000-0000-4000-a000-0000000000ff');
SELECT pg_temp.checa(NOT pg_temp.ve('0a5e0000-0000-4000-a000-000000000001', '5511900000006'),
  'conversa apontando para lead inexistente continua invisível para a gestora');

DO $$ BEGIN RAISE NOTICE 'OK: whatsapp_conversa_segue_corretor_do_lead — todos os casos passaram'; END $$;

ROLLBACK;
