-- ============================================================
-- Quantos passaram por cada etapa — contado no banco.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/passaram_por_etapa.test.sql
--
-- Este arquivo existe por causa de um defeito real, de 24/09. A conta era
-- feita em JavaScript sobre os eventos baixados, pedindo 50 mil linhas. O
-- PostgREST corta a resposta em MIL, sem erro e sem aviso — e como vinham em
-- ordem de data, as mil eram todas da primeira etapa. A tela mostrou:
--
--     passaram: [1000, 0, 0, 0, 0, 0, 0, 0]
--
-- Um funil que despenca, plausível, e falso. O aviso de truncagem que existia
-- para isso não disparou, porque comparava com o teto de 50 mil.
--
-- O caso 4 é o que sustenta o arquivo: com MAIS DE MIL leads, a contagem tem
-- de ser exata. É a única asserção que teria pego o defeito.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := '6f100000-0000-4000-a000-000000000001';
  vizinha uuid := '6f100000-0000-4000-a000-000000000002';
  u_admin uuid := '6f101111-0000-4000-a000-000000000001';
  u_fora  uuid := '6f101111-0000-4000-a000-000000000002';
  n bigint;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES
    (casa,'teste-passaram','Casa'), (vizinha,'teste-passaram-viz','Vizinha')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES
    (u_admin,'admin@pass.local'), (u_fora,'fora@pass.local')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, u_admin, 'admin'), (vizinha, u_fora, 'admin');

  -- ----------------------------------------------------------
  -- 1. CONTA LEAD DISTINTO, E NÃO EVENTO
  --
  -- Um lead que volta para a mesma etapa passou por ela UMA vez. Contando
  -- evento, quem vai e volta vale por dois — e a taxa de conversão da etapa
  -- fica maior do que a realidade.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, created_at) VALUES
    (casa, 'L1', 'leads', 'lead.stage_changed', 'Interação',       'usuario', '2026-09-10T10:00:00Z'),
    (casa, 'L1', 'leads', 'lead.stage_changed', 'Interação',       'usuario', '2026-09-11T10:00:00Z'),
    (casa, 'L2', 'leads', 'lead.stage_changed', 'Interação',       'usuario', '2026-09-12T10:00:00Z'),
    (casa, 'L3', 'leads', 'lead.stage_changed', 'Visita Agendada', 'usuario', '2026-09-13T10:00:00Z');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);

  SELECT passaram INTO n FROM public.funil_passaram_por_etapa(casa) WHERE etapa = 'Interação';
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 1: esperava 2 leads distintos em Interacao e veio %', n;
  END IF;
  RAISE NOTICE 'OK 1: conta lead distinto, nao evento';

  -- ----------------------------------------------------------
  -- 2. ETAPA SEM NINGUÉM NÃO APARECE — e quem chama transforma em zero
  --
  -- A função devolve só o que tem evento. É a rota que preenche com zero as
  -- etapas pedidas que não vieram, na ordem pedida. Devolver zeros aqui faria
  -- a função ter de saber a lista de etapas de cada funil, que é da tela.
  -- ----------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.funil_passaram_por_etapa(casa) WHERE etapa = 'Proposta Assinada') THEN
    RAISE EXCEPTION 'FALHOU 2: etapa sem evento nao deveria vir na resposta';
  END IF;
  RAISE NOTICE 'OK 2: so vem etapa que tem evento';

  -- ----------------------------------------------------------
  -- 3. O RECORTE POR IMOBILIÁRIA NÃO É OPCIONAL
  --
  -- É a planilha de quem está vendendo. Sem o filtro, uma casa contaria o
  -- funil da outra — e o número continuaria plausível.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, created_at)
  VALUES (vizinha, 'V1', 'leads', 'lead.stage_changed', 'Interação', 'usuario', '2026-09-10T10:00:00Z');

  SELECT passaram INTO n FROM public.funil_passaram_por_etapa(casa) WHERE etapa = 'Interação';
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 3: o lead da vizinha entrou na conta (veio %)', n;
  END IF;

  -- E quem não é da casa não lê nada.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_fora, 'role','authenticated')::text, true);
  IF EXISTS (SELECT 1 FROM public.funil_passaram_por_etapa(casa)) THEN
    RAISE EXCEPTION 'FALHOU 3b: quem nao e da casa leu o funil dela';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);
  RAISE NOTICE 'OK 3: cada casa conta a sua, e so a sua';

  -- ----------------------------------------------------------
  -- 4. MAIS DE MIL LEADS — O CASO QUE SUSTENTA O ARQUIVO
  --
  -- É exatamente aqui que a versão anterior quebrava: o PostgREST devolvia
  -- mil linhas, e como a ordem era por data, todas da primeira etapa. Com a
  -- conta no banco não há teto — o que volta é uma linha por etapa.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, created_at)
  SELECT casa, 'B' || i::text, 'leads', 'lead.stage_changed',
         CASE WHEN i <= 1500 THEN 'Novos Leads' ELSE 'Negociação' END,
         'usuario', '2026-09-14T10:00:00Z'::timestamptz + (i * interval '1 second')
    FROM generate_series(1, 2500) i;

  SELECT passaram INTO n FROM public.funil_passaram_por_etapa(casa) WHERE etapa = 'Novos Leads';
  IF n IS DISTINCT FROM 1500 THEN
    RAISE EXCEPTION 'FALHOU 4: esperava 1500 em Novos Leads e veio % — o teto de mil linhas voltou', n;
  END IF;
  SELECT passaram INTO n FROM public.funil_passaram_por_etapa(casa) WHERE etapa = 'Negociação';
  IF n IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'FALHOU 4b: esperava 1000 em Negociacao e veio % — as etapas do fim sumiram', n;
  END IF;
  RAISE NOTICE 'OK 4: 2.500 eventos contados certo, sem teto de mil linhas';

  -- ----------------------------------------------------------
  -- 5. O PERÍODO RECORTA OS DOIS LADOS
  -- ----------------------------------------------------------
  SELECT passaram INTO n
    FROM public.funil_passaram_por_etapa(casa, '2026-09-12T00:00:00Z', '2026-09-13T23:59:59Z')
   WHERE etapa = 'Interação';
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 5: o periodo nao recortou (esperava 1, veio %)', n;
  END IF;
  RAISE NOTICE 'OK 5: o periodo recorta';

  -- ----------------------------------------------------------
  -- 6. A DATA DE INÍCIO É A DO PRIMEIRO EVENTO, E NULA SEM EVENTO
  --
  -- A tela escreve esta data ao lado dos números. Devolver "hoje" quando não
  -- há evento faria o funil afirmar que o registro começou agora — e as
  -- etapas vazias pareceriam perda em vez de histórico curto.
  -- ----------------------------------------------------------
  IF public.funil_inicio_do_historico(casa) IS DISTINCT FROM '2026-09-10T10:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'FALHOU 6: a data de inicio nao e a do primeiro evento';
  END IF;
  IF public.funil_inicio_do_historico(casa, '2027-01-01T00:00:00Z') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 6b: sem evento no periodo, a data deveria ser nula';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 6: a data e a do primeiro evento, e nula quando nao ha';
END $$;

ROLLBACK;
