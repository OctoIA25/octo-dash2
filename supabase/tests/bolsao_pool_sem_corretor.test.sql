-- Testes de 20260916_bolsao_pool_sem_corretor.sql: corretor gravado na fonte
-- (leads / kenlo_leads) chega na `bolsao` e tira o lead do pool.
--
-- Roda numa transação e DESFAZ tudo (ROLLBACK no fim), então pode rodar contra o
-- banco real depois da migration:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bolsao_pool_sem_corretor.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = NOTICE final.
--
-- Fora daqui: o fallback de expire_bolsao_leads() limpando a fonte. A função
-- percorre os leads 'novo' de TODOS os tenants e trava roleta_participantes
-- (FOR UPDATE SKIP LOCKED) até o ROLLBACK — rodá-la no banco real faria o cron
-- de produção achar a roleta vazia e jogar leads de verdade no pool.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', p_caso;
  END IF;
END $$;

-- "Está no pool" = mesmo filtro de fetchBolsaoLeads (bolsaoService.ts).
CREATE FUNCTION pg_temp.no_pool(p_bolsao_id integer) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.bolsao
                  WHERE id = p_bolsao_id AND status = 'bolsao'
                    AND atendido IS NOT TRUE AND corretor_responsavel IS NULL)
$$;

-- ----------------------------------------------------------------------------
-- Fixtures. created_at/lead_timestamp antigos: fora da janela do webhook
-- lead.created. Sem telefone: não cria conversa de WhatsApp. Tenant sem
-- roleta_participantes: o trigger de roleta do INSERT não atribui ninguém.
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (id, code, name)
VALUES ('0b0150a0-0000-4000-a000-00000000000a', 'teste-bolsao-pool', 'Teste Bolsão Pool');

INSERT INTO public.leads (id, tenant_id, name, created_at) VALUES
  ('0b0150a0-0000-4000-a000-000000000001', '0b0150a0-0000-4000-a000-00000000000a', 'Lead Lia',       now() - interval '10 days'),
  ('0b0150a0-0000-4000-a000-000000000002', '0b0150a0-0000-4000-a000-00000000000a', 'Lead Assumido',  now() - interval '10 days'),
  ('0b0150a0-0000-4000-a000-000000000003', '0b0150a0-0000-4000-a000-00000000000a', 'Lead Repassado', now() - interval '10 days');

INSERT INTO public.kenlo_leads (id, tenant_id, external_id, client_name, created_at, lead_timestamp) VALUES
  ('0b0150a0-0000-4000-a000-000000000004', '0b0150a0-0000-4000-a000-00000000000a', 'teste-bolsao-pool-1', 'Lead Kenlo',
   now() - interval '10 days', now() - interval '10 days');

-- O espelho do INSERT criou as linhas da bolsao; põe as três primeiras no pool
-- como expire_bolsao_leads() deixa.
UPDATE public.bolsao
   SET status = 'bolsao', atendido = false, corretor_responsavel = NULL,
       numero_corretor_responsavel = NULL, data_expiracao = now() - interval '1 day'
 WHERE tenant_id = '0b0150a0-0000-4000-a000-00000000000a'
   AND source_lead_id IS DISTINCT FROM '0b0150a0-0000-4000-a000-000000000003';

UPDATE public.bolsao
   SET status = 'novo', corretor_responsavel = 'Corretor A', numero_corretor_responsavel = '11911111111'
 WHERE source_lead_id = '0b0150a0-0000-4000-a000-000000000003';

CREATE TEMP TABLE ids ON COMMIT DROP AS
SELECT (SELECT id FROM public.bolsao WHERE source_lead_id  = '0b0150a0-0000-4000-a000-000000000001') AS lia,
       (SELECT id FROM public.bolsao WHERE source_lead_id  = '0b0150a0-0000-4000-a000-000000000002') AS assumido,
       (SELECT id FROM public.bolsao WHERE source_lead_id  = '0b0150a0-0000-4000-a000-000000000003') AS repassado,
       (SELECT id FROM public.bolsao WHERE source_kenlo_id = '0b0150a0-0000-4000-a000-000000000004') AS kenlo;

SELECT pg_temp.checa((SELECT lia IS NOT NULL AND assumido IS NOT NULL AND repassado IS NOT NULL AND kenlo IS NOT NULL FROM ids),
  'fixture: espelho criou as 4 linhas na bolsao');
SELECT pg_temp.checa((SELECT pg_temp.no_pool(lia) AND pg_temp.no_pool(assumido) AND pg_temp.no_pool(kenlo) FROM ids),
  'fixture: 3 leads no pool');

-- ----------------------------------------------------------------------------
-- Casos
-- ----------------------------------------------------------------------------

-- Lia/n8n (ou lote) grava o corretor direto em leads.
UPDATE public.leads SET assigned_agent_name = 'Corretora Lia'
 WHERE id = '0b0150a0-0000-4000-a000-000000000001';
SELECT pg_temp.checa((SELECT NOT pg_temp.no_pool(lia) FROM ids),
  'lead do pool que ganha corretor em leads sai do pool');
SELECT pg_temp.checa((SELECT corretor_responsavel = 'Corretora Lia' AND status = 'bolsao' AND data_atribuicao IS NOT NULL
                        FROM public.bolsao WHERE id = (SELECT lia FROM ids)),
  'bolsao recebe o corretor e mantém o status (a expiração não o pega de volta)');

-- Tirar o corretor da fonte não mexe na bolsao.
UPDATE public.leads SET assigned_agent_name = NULL
 WHERE id = '0b0150a0-0000-4000-a000-000000000001';
SELECT pg_temp.checa((SELECT corretor_responsavel = 'Corretora Lia' FROM public.bolsao WHERE id = (SELECT lia FROM ids)),
  'limpar o corretor da fonte não altera a bolsao');

-- "Assumir" do Bolsão: grava a bolsao (com telefone) e depois leads.
UPDATE public.bolsao
   SET corretor_responsavel = 'Corretor Assume', numero_corretor_responsavel = '11922222222',
       status = 'assumido', atendido = true
 WHERE id = (SELECT assumido FROM ids);
UPDATE public.leads SET assigned_agent_name = 'Corretor Assume'
 WHERE id = '0b0150a0-0000-4000-a000-000000000002';
SELECT pg_temp.checa((SELECT numero_corretor_responsavel = '11922222222' AND status = 'assumido'
                        FROM public.bolsao WHERE id = (SELECT assumido FROM ids)),
  'Assumir: mesmo corretor na fonte não apaga o telefone nem o status');

-- Troca de corretor fora do pool: o telefone do anterior não fica.
UPDATE public.leads SET assigned_agent_name = 'Corretor B'
 WHERE id = '0b0150a0-0000-4000-a000-000000000003';
SELECT pg_temp.checa((SELECT corretor_responsavel = 'Corretor B' AND numero_corretor_responsavel IS NULL AND status = 'novo'
                        FROM public.bolsao WHERE id = (SELECT repassado FROM ids)),
  'troca de corretor: bolsao acompanha, sem o telefone do anterior');

-- Kenlo: atribuição é o nome.
UPDATE public.kenlo_leads SET attended_by_name = 'Corretor Kenlo'
 WHERE id = '0b0150a0-0000-4000-a000-000000000004';
SELECT pg_temp.checa((SELECT NOT pg_temp.no_pool(kenlo) FROM ids),
  'lead Kenlo do pool que ganha attended_by_name sai do pool');

DO $$ BEGIN RAISE NOTICE 'bolsao_pool_sem_corretor: todos os casos passaram'; END $$;

ROLLBACK;
