-- Testes de 20260918_view_primeira_interacao.sql.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/primeira_interacao.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Devolve TRUE se ler a relação estourar falta de privilégio (42501).
CREATE FUNCTION pg_temp.leitura_negada(p_rel text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SELECT 1 FROM %s LIMIT 1', p_rel);
  RETURN false;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN true;
END $$;

CREATE FUNCTION pg_temp.como(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

-- ----------------------------------------------------------------------------
-- Fixtures: dois tenants com um gestor cada. Os leads do tenant A cobrem cada
-- decisão da view; o tenant B existe só para provar o isolamento.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('b1a50000-0000-4000-a000-000000000001', 'gestor-a@teste-interacao.dev'),
  ('b1a50000-0000-4000-a000-000000000002', 'gestor-b@teste-interacao.dev'),
  ('b1a50000-0000-4000-a000-0000000000c1', 'corretor@teste-interacao.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('b1a50000-0000-4000-a000-00000000000a', 'teste-interacao-a', 'Teste Interacao A'),
  ('b1a50000-0000-4000-a000-00000000000b', 'teste-interacao-b', 'Teste Interacao B');

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions) VALUES
  ('b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-000000000001', 'admin', '{}'),
  ('b1a50000-0000-4000-a000-00000000000b', 'b1a50000-0000-4000-a000-000000000002', 'admin', '{}'),
  -- O corretor precisa ser membro: tr_leads_zz_assignee_guard anula em silêncio
  -- um assigned_agent_id que não pertença ao tenant.
  ('b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000c1', 'corretor', '{}');

-- Todos os leads nascem no mesmo instante para a conta de minutos ficar óbvia.
INSERT INTO public.leads (id, tenant_id, name, created_at) VALUES
  ('b1a50000-0000-4000-a000-0000000000e1', 'b1a50000-0000-4000-a000-00000000000a', 'Duas saidas',      '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000e2', 'b1a50000-0000-4000-a000-00000000000a', 'So entrada',       '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000e3', 'b1a50000-0000-4000-a000-00000000000a', 'So corretor',      '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000e4', 'b1a50000-0000-4000-a000-00000000000a', 'Contato negativo', '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000e5', 'b1a50000-0000-4000-a000-00000000000a', 'Sem contato',      '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000e6', 'b1a50000-0000-4000-a000-00000000000a', 'Corretor antes',   '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000e7', 'b1a50000-0000-4000-a000-00000000000a', 'So toque',         '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000e8', 'b1a50000-0000-4000-a000-00000000000a', 'Toque e whatsapp', '2026-09-01T10:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000f1', 'b1a50000-0000-4000-a000-00000000000b', 'Lead do tenant B', '2026-09-01T10:00:00Z');

-- Toques de cadência: e7 só ligação (45 min); e8 tem toque às 11h e mensagem
-- com autor às 10h40 — o corretor falou às 10h40, então vale 40, não 60.
INSERT INTO public.lead_toques (tenant_id, lead_id, lead_source, canal, resultado, executado_em, executado_por) VALUES
  ('b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e7', 'leads', 'ligacao', 'respondeu', '2026-09-01T10:45:00Z', 'b1a50000-0000-4000-a000-0000000000c1'),
  ('b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e8', 'leads', 'ligacao', 'respondeu', '2026-09-01T11:00:00Z', 'b1a50000-0000-4000-a000-0000000000c1');

INSERT INTO public.whatsapp_conversations (id, tenant_id, lead_id, contact_phone) VALUES
  ('b1a50000-0000-4000-a000-0000000000d1', 'b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e1', '5511900000001'),
  ('b1a50000-0000-4000-a000-0000000000d2', 'b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e2', '5511900000002'),
  ('b1a50000-0000-4000-a000-0000000000d3', 'b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e3', '5511900000003'),
  ('b1a50000-0000-4000-a000-0000000000d4', 'b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e4', '5511900000004'),
  ('b1a50000-0000-4000-a000-0000000000d6', 'b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e6', '5511900000006'),
  ('b1a50000-0000-4000-a000-0000000000d8', 'b1a50000-0000-4000-a000-00000000000a', 'b1a50000-0000-4000-a000-0000000000e8', '5511900000008'),
  ('b1a50000-0000-4000-a000-0000000000f2', 'b1a50000-0000-4000-a000-00000000000b', 'b1a50000-0000-4000-a000-0000000000f1', '5511900000009');

INSERT INTO public.whatsapp_messages (conversation_id, tenant_id, direction, sent_by_user_id, wa_timestamp) VALUES
  -- e1: duas saídas da LIA. A view tem de pegar a de 10h30 (30 min), não a de 12h.
  ('b1a50000-0000-4000-a000-0000000000d1', 'b1a50000-0000-4000-a000-00000000000a', 'outbound', NULL, '2026-09-01T12:00:00Z'),
  ('b1a50000-0000-4000-a000-0000000000d1', 'b1a50000-0000-4000-a000-00000000000a', 'outbound', NULL, '2026-09-01T10:30:00Z'),
  -- e2: só o lead escreveu. Entrada não é interação nossa.
  ('b1a50000-0000-4000-a000-0000000000d2', 'b1a50000-0000-4000-a000-00000000000a', 'inbound',  NULL, '2026-09-01T10:05:00Z'),
  -- e3: só o corretor falou (saída COM autor). Não é a LIA.
  ('b1a50000-0000-4000-a000-0000000000d3', 'b1a50000-0000-4000-a000-00000000000a', 'outbound', 'b1a50000-0000-4000-a000-0000000000c1', '2026-09-01T10:10:00Z'),
  -- e4: contato ANTES de o lead existir (importação). Medida inválida.
  ('b1a50000-0000-4000-a000-0000000000d4', 'b1a50000-0000-4000-a000-00000000000a', 'outbound', NULL, '2026-08-25T10:00:00Z'),
  -- e6: corretor às 10h05, LIA às 10h20. A mensagem do corretor não pode
  -- "adiantar" o relógio da LIA — o valor certo é 20 min, não 5.
  ('b1a50000-0000-4000-a000-0000000000d6', 'b1a50000-0000-4000-a000-00000000000a', 'outbound', 'b1a50000-0000-4000-a000-0000000000c1', '2026-09-01T10:05:00Z'),
  ('b1a50000-0000-4000-a000-0000000000d6', 'b1a50000-0000-4000-a000-00000000000a', 'outbound', NULL, '2026-09-01T10:20:00Z'),
  -- e8: corretor escreveu pelo painel às 10h40, antes do toque de 11h.
  ('b1a50000-0000-4000-a000-0000000000d8', 'b1a50000-0000-4000-a000-00000000000a', 'outbound', 'b1a50000-0000-4000-a000-0000000000c1', '2026-09-01T10:40:00Z'),
  -- tenant B, para o teste de isolamento.
  ('b1a50000-0000-4000-a000-0000000000f2', 'b1a50000-0000-4000-a000-00000000000b', 'outbound', NULL, '2026-09-01T10:15:00Z');

-- ----------------------------------------------------------------------------
-- Casos
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  (SELECT minutos_ate_primeiro_contato FROM public.primeira_interacao
    WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e1') = 30,
  'pega a PRIMEIRA saida da LIA (30 min), nao a ultima');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.primeira_interacao
               WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e2'),
  'mensagem de ENTRADA nao conta como interacao nossa');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.primeira_interacao
               WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e3'),
  'saida COM autor e corretor, nao LIA: fica fora desta view');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.primeira_interacao
               WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e4'),
  'contato anterior ao created_at (negativo) fica fora');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.primeira_interacao
               WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e5'),
  'lead sem contato nenhum nao vira linha');

SELECT pg_temp.checa(
  (SELECT minutos_ate_primeiro_contato FROM public.primeira_interacao
    WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e6') = 20,
  'mensagem do corretor nao adianta o relogio da LIA (20 min, nao 5)');

-- As colunas de recorte. A view EXPÕE `archived_at` e `assigned_agent_id`, não
-- filtra por eles: quem consome recorta igual recorta `leads`. Se elas sumirem,
-- a taxa de atendimento passa de 100% e a tela do corretor mostra o tenant.
UPDATE public.leads SET archived_at = '2026-09-02T10:00:00Z', assigned_agent_id = 'b1a50000-0000-4000-a000-0000000000c1'
 WHERE id = 'b1a50000-0000-4000-a000-0000000000e1';

SELECT pg_temp.checa(
  (SELECT archived_at IS NOT NULL AND assigned_agent_id = 'b1a50000-0000-4000-a000-0000000000c1'
     FROM public.primeira_interacao WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e1'),
  'view entrega archived_at e assigned_agent_id para quem consome recortar');

SELECT pg_temp.checa(
  EXISTS (SELECT 1 FROM public.primeira_interacao WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e1'),
  'lead arquivado continua na view (quem filtra e o consumidor, nao ela)');

UPDATE public.leads SET archived_at = NULL, assigned_agent_id = NULL
 WHERE id = 'b1a50000-0000-4000-a000-0000000000e1';

-- ----------------------------------------------------------------------------
-- O outro lado: primeira_interacao_corretor
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  (SELECT minutos_ate_primeiro_contato FROM public.primeira_interacao_corretor
    WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e3') = 10,
  'corretor: saida COM autor conta (10 min)');

SELECT pg_temp.checa(
  (SELECT minutos_ate_primeiro_contato FROM public.primeira_interacao_corretor
    WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e7') = 45,
  'corretor: toque de cadencia sozinho conta (45 min)');

SELECT pg_temp.checa(
  (SELECT minutos_ate_primeiro_contato FROM public.primeira_interacao_corretor
    WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e8') = 40,
  'corretor: vale o MAIS CEDO entre toque e whatsapp (40, nao 60)');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.primeira_interacao_corretor
               WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e1'),
  'corretor: lead falado so pela LIA nao entra na view do corretor');

SELECT pg_temp.checa(
  (SELECT minutos_ate_primeiro_contato FROM public.primeira_interacao_corretor
    WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000e6') = 5,
  'corretor: no lead que os dois falaram, cada view marca o seu (5 e 20)');

-- ----------------------------------------------------------------------------
-- Isolamento. Estes dois casos são o motivo de a view ser security_invoker: se
-- ela rodasse com os privilégios de quem a criou, o gestor A leria o tempo de
-- resposta do tenant B — foi assim que commercial_sales_team_leader_summary
-- vazou, na auditoria de 16/09.
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('b1a50000-0000-4000-a000-000000000001', 'gestor-a@teste-interacao.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.primeira_interacao) = 2,
  'gestor do tenant A enxerga apenas os 2 leads contatados do PROPRIO tenant');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.primeira_interacao
               WHERE lead_id = 'b1a50000-0000-4000-a000-0000000000f1'),
  'gestor do tenant A NAO enxerga lead do tenant B');

-- O risco concreto desta view: `lead_toques` e `lead_events` têm RLS sem policy
-- e sem GRANT, então tocá-las aqui daria 42501 para todo usuário logado. Este
-- caso prova que a leitura passa limpa como `authenticated`.
SELECT pg_temp.checa(
  (SELECT count(*) >= 0 FROM public.primeira_interacao),
  'authenticated consegue LER a view (nao estoura 42501)');

-- E o contrário, que é a decisão de segurança desta fatia: `lead_toques` é
-- server-only, então a view do corretor não chega a quem loga.
--
-- São DUAS proteções e o teste cobre as duas separadamente, porque uma esconde
-- a outra: como a view é security_invoker, a RLS sem policy de `lead_toques`
-- já barra a leitura mesmo que o GRANT seja dado por engano. Conferido só pela
-- leitura, um GRANT indevido passava batido — foi o que aconteceu ao sabotar
-- este arquivo. Por isso o GRANT é verificado direto no catálogo.
SELECT pg_temp.checa(
  pg_temp.leitura_negada('public.primeira_interacao_corretor'),
  'authenticated NAO consegue ler a view do corretor');

RESET ROLE;

SELECT pg_temp.checa(
  has_table_privilege('authenticated', 'public.primeira_interacao_corretor', 'SELECT') IS FALSE,
  'view do corretor NAO tem GRANT para authenticated');

SELECT pg_temp.checa(
  has_table_privilege('anon', 'public.primeira_interacao_corretor', 'SELECT') IS FALSE,
  'view do corretor NAO tem GRANT para anon');

-- A view da LIA tampouco pode cair na mão de `anon`: a chave anônima viaja no
-- bundle do browser e leria dado de lead de qualquer imobiliária que a RLS
-- deixasse passar. Sem o REVOKE da migration, o pg_default_acl do Supabase
-- concede tudo a anon automaticamente — esta asserção é o que prende isso.
SELECT pg_temp.checa(
  has_table_privilege('anon', 'public.primeira_interacao', 'SELECT') IS FALSE,
  'view da LIA NAO tem GRANT para anon');

-- O espelho: a view da LIA PRECISA estar legível por quem loga, senão a tela
-- fica sem dado. Um REVOKE largo demais quebra aqui.
SELECT pg_temp.checa(
  has_table_privilege('authenticated', 'public.primeira_interacao', 'SELECT') IS TRUE,
  'view da LIA TEM GRANT para authenticated');

SELECT pg_temp.checa(
  has_table_privilege('service_role', 'public.primeira_interacao_corretor', 'SELECT') IS TRUE,
  'view do corretor TEM GRANT para service_role (o servidor le dela)');

ROLLBACK;

\echo 'OK: primeira_interacao — 22 casos passaram.'
