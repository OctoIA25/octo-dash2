-- ============================================================
-- `count_leads_mensal` só responde a quem é da casa.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/count_leads_mensal.test.sql
--
-- Nasceu de uma porta aberta medida em produção em 23/09/2026: o papel `anon`,
-- sem login nenhum, recebeu 379 — a contagem de leads da Lotus no mês.
--
-- O caso 4 é o que sustenta este arquivo. Os outros três podem passar com o
-- buraco aberto; ele não.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := '2ccc1111-0000-4000-a000-000000000001';
  vizinha uuid := '2ccc1111-0000-4000-a000-000000000002';
  dono    uuid := '2ccc2222-0000-4000-a000-000000000001';
  de_fora uuid := '2ccc2222-0000-4000-a000-000000000002';
  n int;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES
    (casa,    'teste-cnt-a', 'Casa'),
    (vizinha, 'teste-cnt-b', 'Vizinha')
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (id, email) VALUES
    (dono,    'dono.casa@teste.local'),
    (de_fora, 'dono.vizinha@teste.local')
  ON CONFLICT DO NOTHING;

  -- Três leads da casa NESTE mês, e um do mês passado que não pode contar.
  INSERT INTO leads (tenant_id, name, created_at) VALUES
    (casa, 'Lead 1', date_trunc('month', CURRENT_DATE) + interval '1 hour'),
    (casa, 'Lead 2', date_trunc('month', CURRENT_DATE) + interval '2 hour'),
    (casa, 'Lead 3', date_trunc('month', CURRENT_DATE) + interval '3 hour'),
    (casa, 'Antigo', date_trunc('month', CURRENT_DATE) - interval '2 day');

  -- ----------------------------------------------------------
  -- 1. SEM JWT (o servidor falando direto) CONTA NORMAL
  --
  -- Se esta cair, uma rotina de servidor passa a receber 0 em silêncio.
  -- ----------------------------------------------------------
  n := public.count_leads_mensal(casa);
  IF n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU 1: o servidor contou % (esperava 3)', n;
  END IF;
  RAISE NOTICE 'OK 1: sem JWT conta normal, e o mês passado fica de fora';

  -- ----------------------------------------------------------
  -- 2. O MEMBRO DA CASA CONTA
  -- ----------------------------------------------------------
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (casa, dono, 'admin') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', dono, 'role', 'authenticated')::text, true);
  n := public.count_leads_mensal(casa);
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU 2: o membro da casa contou % (esperava 3)', n;
  END IF;
  RAISE NOTICE 'OK 2: quem é da casa continua contando';

  -- ----------------------------------------------------------
  -- 3. O LOGADO DE OUTRA CASA NÃO CONTA
  -- ----------------------------------------------------------
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (vizinha, de_fora, 'admin') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', de_fora, 'role', 'authenticated')::text, true);
  n := public.count_leads_mensal(casa);
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU 3: a vizinha leu % leads desta casa', n;
  END IF;
  RAISE NOTICE 'OK 3: a vizinha recebe zero, não o número';
END $$;

-- ============================================================
-- 4. O ANÔNIMO NÃO EXECUTA — E ESTE É O CASO QUE IMPORTA
--
-- Era assim em produção: `set role anon` e a função devolvia 379. A chave
-- anônima está no bundle do navegador; não havia porta a arrombar.
--
-- O teste é de PERMISSÃO, não de resultado. Checar "devolveu 0" passaria
-- também com a função aberta e a casa sem lead nenhum — mediria a ausência de
-- dado, e não a presença de tranca. Aqui o que se exige é `permission denied`.
--
-- Fora do DO porque `SET ROLE` é comando de sessão.
-- ============================================================
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  BEGIN
    n := public.count_leads_mensal('2ccc1111-0000-4000-a000-000000000001'::uuid);
    RAISE EXCEPTION 'FALHOU 4: o anônimo executou a função e recebeu %', n;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK 4: o anônimo leva permission denied';
  END;
END $$;
RESET ROLE;

-- ============================================================
-- 5. E A PERMISSÃO NÃO PODE VOLTAR PELO PUBLIC
--
-- Este caso existe porque o `REVOKE ... FROM anon` de 18/06 não revogou nada:
-- a permissão vinha de PUBLIC. Um `GRANT` descuidado numa migração futura, ou
-- um DROP + CREATE da função, devolve o padrão e reabre a porta em silêncio.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'count_leads_mensal'
       AND (p.proacl IS NULL OR p.proacl::text ~ '[{,]=X/')
  ) THEN
    RAISE EXCEPTION 'FALHOU 5: a função voltou a conceder EXECUTE ao PUBLIC';
  END IF;
  RAISE NOTICE 'OK 5: PUBLIC não tem EXECUTE';
END $$;

ROLLBACK;
