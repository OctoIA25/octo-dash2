-- ============================================================
-- Cadência da LIA no card do lead — colunas, índices e contrato de escrita
--
-- CONTEXTO
-- A LIA registra as tentativas de follow-up com o lead em `lia_followups`.
-- A tabela NÃO nasceu neste repositório: foi criada e é escrita pelo app da
-- LIA (hospedado fora), e por isso nunca teve migration. O CRM só a contava
-- de forma agregada (server/observability/tenantHealthRoutes.js,
-- server/agent-telemetry/routes.js) — nenhuma tela mostra a cadência de UM
-- lead, que é o que o corretor precisa antes de ligar para alguém que a IA
-- já cutucou três vezes.
--
-- Esta migration NÃO cria a tabela em produção (o CREATE é IF NOT EXISTS e
-- vira no-op lá). Ela existe para: (1) versionar o schema para ambientes
-- novos, (2) acrescentar as colunas que faltam para a leitura ser honesta, e
-- (3) criar o índice único que torna a nova rota de ingest idempotente.
--
-- O QUE FOI MEDIDO (introspecção REST com service_role, 10/set/2026)
--   - 2.527 linhas. 2.523 do tenant Japi (33bf7e62…), 4 do Lotus (65c69875…).
--   - lead_id aponta SEMPRE para public.leads: 50 ids distintos amostrados,
--     50/50 presentes em `leads`, 0/50 em `kenlo_leads`. Daí o índice por
--     (tenant_id, lead_id); o casamento por telefone fica como fallback para
--     lead de origem Kenlo.
--   - 84% das linhas têm sent_at NULL (a LIA agenda e nem sempre confirma o
--     envio) e 100% têm topic e reference_code NULL — essas duas seguem
--     ignoradas na leitura, não vale mexer nelas.
--   - status: cancelled 795 / sent 155 / pending 46 / expired 4 (por 1.000).
--     cancelled_reason='lead_returned' em 793 delas — é hoje o MELHOR sinal
--     de "o lead respondeu": a cadência foi cancelada justamente por isso.
--
-- POR QUE NÃO UMA TABELA NOVA
-- Uma `lead_cadence_events` nossa nasceria vazia e criaria duas verdades
-- sobre o mesmo fato até o app da LIA migrar. Evoluir a tabela existente põe
-- o histórico real na tela no dia 1, sem backfill.
--
-- POR QUE NÃO FOREIGN KEY em lead_id
-- Quem escreve é um app externo. Uma FK transformaria corrida (follow-up
-- gravado antes do lead existir) e lead apagado em erro de escrita do lado
-- da LIA. O join é feito na leitura, que tolera órfão.
--
-- ORDEM DE DEPLOY
--   1. Esta migration.
--   2. Deploy do servidor (rotas GET /leads/:id/cadencia e POST /lia/cadencias).
--   3. Deploy do front (seção no modal do lead).
-- Inverter 1 e 2 não quebra nada: as colunas novas são opcionais na leitura.
--
-- APLICAR NO SUPABASE ANTES DO DEPLOY.
-- Rodar UM BLOCO POR EXECUÇÃO no SQL Editor: a aba inteira roda em uma
-- transação e DDL multi-tabela já deadlockou (40P01) contra os syncs aqui.
-- ============================================================

SET lock_timeout = '10s';

-- ------------------------------------------------------------
-- BLOCO 1 — schema base (no-op em produção; serve a ambiente novo)
--
-- Tipos inferidos por introspecção REST, já que a tabela foi criada fora do
-- repositório. Se um dia divergirem do banco real, o banco real é que vale:
-- este CREATE nunca roda onde a tabela existe.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lia_followups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id           uuid,                 -- public.leads.id (sem FK: ver cabeçalho)
  lead_phone        text,
  scheduled_at      timestamptz,          -- quando a cadência DEVE sair
  sent_at           timestamptz,          -- quando de fato saiu (NULL = não saiu/não informado)
  status            text NOT NULL DEFAULT 'pending',
  tag               text,                 -- pos_apresentacao, silencio_quente, ...
  topic             text,                 -- 100% NULL hoje; leitura ignora
  reference_code    text,                 -- 100% NULL hoje; leitura ignora
  motivo            text,                 -- "ASSUNTO: o apartamento de 2 dormitórios..."
  attempt_number    integer,              -- 1..3
  cancelled_at      timestamptz,
  cancelled_reason  text,                 -- 'lead_returned' = o lead respondeu
  last_lead_msg_at  timestamptz,
  message_sent      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- BLOCO 2 — colunas novas
--
-- Todas NULLABLE e sem DEFAULT de propósito: as 2.527 linhas existentes não
-- carregam essas informações e um DEFAULT ('whatsapp', por exemplo) faria o
-- passado parecer declarado quando ele é apenas desconhecido. NULL aqui
-- significa "não informado", e a tela diz isso.
-- Sem DEFAULT também não há reescrita da tabela — ADD COLUMN é instantâneo.
-- ------------------------------------------------------------
ALTER TABLE public.lia_followups
  ADD COLUMN IF NOT EXISTS channel          text,
  ADD COLUMN IF NOT EXISTS replied_at       timestamptz,
  ADD COLUMN IF NOT EXISTS outcome          text,
  ADD COLUMN IF NOT EXISTS template_name    text,
  ADD COLUMN IF NOT EXISTS idempotency_key  text,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

-- CHECKs como NOT VALID: as linhas antigas têm NULL nessas colunas e passariam,
-- mas NOT VALID deixa explícito que a garantia vale da migration em diante e
-- evita varredura completa caso alguém acrescente valores antes de validar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lia_followups_channel_check') THEN
    ALTER TABLE public.lia_followups
      ADD CONSTRAINT lia_followups_channel_check
      CHECK (channel IS NULL OR channel IN ('whatsapp', 'email', 'ligacao', 'sms')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lia_followups_outcome_check') THEN
    ALTER TABLE public.lia_followups
      ADD CONSTRAINT lia_followups_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('respondido', 'sem_resposta', 'visita_agendada', 'escalado', 'opt_out')) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.lia_followups.channel IS
  'Canal do follow-up. NULL = não informado (todas as linhas anteriores a set/2026 são WhatsApp, mas nenhuma declara).';
COMMENT ON COLUMN public.lia_followups.replied_at IS
  'Quando o lead respondeu ESTA cadência. Opcional: para WhatsApp o CRM deriva da primeira mensagem inbound em whatsapp_messages posterior a sent_at. Preencher só em canal que não passa pelo WhatsApp.';
COMMENT ON COLUMN public.lia_followups.outcome IS
  'Desfecho declarado pela LIA. NULL = derivar na leitura a partir de status/cancelled_reason/replied_at.';
COMMENT ON COLUMN public.lia_followups.idempotency_key IS
  'Chave do emissor, única por tenant. Formato sugerido: lia:<lead_id>:<tag>:<attempt_number>. É o que permite ao app reenviar a MESMA cadência nos três momentos (agendou, enviou, encerrou) sem duplicar linha.';
COMMENT ON COLUMN public.lia_followups.updated_at IS
  'Última alteração. NULL nas linhas anteriores a esta migration — o DEFAULT só vale para linha nova.';

-- ------------------------------------------------------------
-- BLOCO 3 — índices
-- ------------------------------------------------------------

-- O índice que sustenta o upsert do POST /api/v1/lia/cadencias. Parcial porque
-- as 2.527 linhas existentes têm idempotency_key NULL e, sem o WHERE, um único
-- índice único não aceitaria mais de uma delas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_lia_followups_idem
  ON public.lia_followups (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Leitura do card: cadências de UM lead, mais recente primeiro.
CREATE INDEX IF NOT EXISTS idx_lia_followups_lead
  ON public.lia_followups (tenant_id, lead_id, created_at DESC);

-- Fallback por telefone (lead de origem kenlo_leads, cujo id a LIA não usa).
CREATE INDEX IF NOT EXISTS idx_lia_followups_phone
  ON public.lia_followups (tenant_id, lead_phone);

-- ------------------------------------------------------------
-- BLOCO 4 — segurança
--
-- A tabela já está com RLS ligada e SEM policy. É o padrão de webhook_events /
-- recovery_queue — tabela 100% server-side, acessada só pelo service_role.
-- Mantemos assim de propósito: `motivo` e `message_sent` carregam texto de
-- conversa com o cliente, e a RLS de `leads` neste banco já está frouxa demais
-- para confiar em uma policy nova aqui.
--
-- O REVOKE É SEGURO — medido, não suposto (10/set/2026). A dúvida era se o app
-- da LIA escreve com a anon key; nesse caso o REVOKE mataria a cadência em
-- silêncio. Sonda: INSERT via PostgREST com tenant_id inexistente (nenhuma
-- linha é criada em qualquer desfecho), uma vez com a anon key e outra com JWT
-- de usuário real. Ambas voltaram 42501 "new row violates row-level security
-- policy", e o SELECT com o mesmo JWT voltou []. Ou seja: anon e authenticated
-- já não escrevem NEM leem nada aqui. Como o app gravou 2.527 linhas, ele usa
-- service_role (ou conexão Postgres direta) — que o REVOKE não toca.
--
-- Então por que revogar, se a RLS já nega? Defesa em profundidade: o GRANT de
-- tabela continua existindo, e no dia em que alguém criar uma policy
-- permissiva por engano, anon ganha acesso na hora. Sem o GRANT, não ganha.
-- Nunca revogar de service_role: é a chave do servidor.
-- ------------------------------------------------------------
ALTER TABLE public.lia_followups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lia_followups FROM anon, authenticated;

COMMENT ON TABLE public.lia_followups IS
  'Cadência de follow-up da LIA com o lead (1 linha por tentativa). Escrita pelo app da LIA e pela rota POST /api/v1/lia/cadencias; leitura do CRM só via servidor (service_role) — RLS ligada sem policy de propósito.';

-- ------------------------------------------------------------
-- BLOCO 5 — prova
--
-- Sem INSERT de mentira: a tabela é lida por dashboards agregados e uma linha
-- fake apareceria como cadência real na tela de telemetria.
-- ------------------------------------------------------------
DO $$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(c, ', ') INTO faltando
  FROM unnest(ARRAY['channel','replied_at','outcome','template_name','idempotency_key','updated_at']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lia_followups' AND column_name = c
  );
  ASSERT faltando IS NULL, format('colunas não criadas: %s', faltando);

  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'ux_lia_followups_idem'),
         'índice único de idempotência não existe';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'idx_lia_followups_lead'),
         'índice por lead não existe';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lia_followups'::regclass),
         'RLS não está habilitada';
  ASSERT NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
            WHERE table_schema = 'public' AND table_name = 'lia_followups'
              AND grantee IN ('anon', 'authenticated')
         ), 'anon/authenticated ainda têm grant na tabela';

  RAISE NOTICE 'OK — lia_followups pronta para a cadência (% linhas preservadas)',
    (SELECT count(*) FROM public.lia_followups);
END $$;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.lia_followups TO anon, authenticated;
-- DROP INDEX IF EXISTS public.ux_lia_followups_idem;
-- DROP INDEX IF EXISTS public.idx_lia_followups_lead;
-- DROP INDEX IF EXISTS public.idx_lia_followups_phone;
-- ALTER TABLE public.lia_followups DROP CONSTRAINT IF EXISTS lia_followups_channel_check;
-- ALTER TABLE public.lia_followups DROP CONSTRAINT IF EXISTS lia_followups_outcome_check;
-- ALTER TABLE public.lia_followups
--   DROP COLUMN IF EXISTS channel,
--   DROP COLUMN IF EXISTS replied_at,
--   DROP COLUMN IF EXISTS outcome,
--   DROP COLUMN IF EXISTS template_name,
--   DROP COLUMN IF EXISTS idempotency_key,
--   DROP COLUMN IF EXISTS updated_at;
