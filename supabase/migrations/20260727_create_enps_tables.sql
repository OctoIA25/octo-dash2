-- ⚠️ ORDEM DE DEPLOY: rodar ANTES do deploy do código novo (prod E dev).
-- Sem as tabelas, o runner/endpoint do eNPS quebram com 42P01 (relation does not exist).
--
-- eNPS de Corretores — survey engine mínimo, data-driven.
-- Spec: docs/superpowers/specs/2026-07-26-enps-corretores-design.md (v2, §4/§5).
--
-- 4 tabelas tenant-scoped e ADITIVAS. Nada destrutivo.
--   surveys            — definição (eNPS é 1 linha semente; tenant_id NULL = template global)
--   survey_cycles      — 1 ciclo por (tenant, survey, período)
--   survey_dispatches  — IDENTIFICADO: idempotência de envio + lembrete + participação. NUNCA contém notas.
--   survey_responses   — ANÔNIMO por padrão (respondent_user_id só com opt-in). SEM created_at (§5).
--
-- Privacidade (§5): RLS RESTRITIVA — dispatches self-row-only; responses SEM leitura
-- de membro (só endpoint service_role, que aplica o N-mínimo). Escrita SÓ service_role
-- em tudo (REVOKE anon/authenticated). Mesmo padrão de agent_action_queue / job_heartbeats.
--
-- FK assimétrica de propósito (§4): dispatches.cycle_id CASCADE (bookkeeping) vs
-- responses.cycle_id RESTRICT (dado coletado não some por delete acidental de ciclo).
-- respondent_user_id / subject_leader_user_id SEM FK (não estreitar o conjunto de anonimato).
-- ============================================================

-- ------------------------------------------------------------
-- 1) surveys — definição da pesquisa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surveys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid REFERENCES public.tenants(id) ON DELETE CASCADE,  -- NULL = template global
  kind                text NOT NULL,                 -- 'enps' | 'clima' | 'onboarding' ...
  title               text NOT NULL,
  questions           jsonb NOT NULL,                -- [{key,type,label,required}]; type ∈ 'nps_0_10'|'open_text'
  reminder_every_days int  NOT NULL DEFAULT 3,
  cycle_closes_day    int  NOT NULL DEFAULT 15,
  channels            text[] NOT NULL DEFAULT '{email}',
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (reminder_every_days > 0),
  CHECK (cycle_closes_day BETWEEN 1 AND 28)          -- 28 p/ funcionar em fevereiro
);

-- Um só template global ATIVO por kind (evita fork de definição em re-run da migration).
CREATE UNIQUE INDEX IF NOT EXISTS surveys_one_global_per_kind
  ON public.surveys (kind) WHERE tenant_id IS NULL AND active;

-- ------------------------------------------------------------
-- 2) survey_cycles — 1 ciclo por (tenant, survey, período)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.survey_cycles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  survey_id    uuid NOT NULL REFERENCES public.surveys(id) ON DELETE RESTRICT,  -- não deletar survey com ciclos
  period_start date NOT NULL,                        -- 1º dia do mês
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at    timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz,
  UNIQUE (tenant_id, survey_id, period_start)
);

-- No MÁXIMO um ciclo ABERTO por tenant/survey; serve de índice p/ o scan status='open'.
CREATE UNIQUE INDEX IF NOT EXISTS survey_cycles_one_open
  ON public.survey_cycles (tenant_id, survey_id) WHERE status = 'open';

-- ------------------------------------------------------------
-- 3) survey_dispatches — IDENTIFICADO. Idempotência + lembrete + participação. Sem notas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.survey_dispatches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id           uuid NOT NULL REFERENCES public.survey_cycles(id) ON DELETE CASCADE,
  respondent_user_id uuid NOT NULL,                  -- corretor (auth.users.id) — SEM FK de propósito
  channel            text NOT NULL,
  recipient          text,                           -- snapshot point-in-time de p/ onde foi (audit)
  status             text NOT NULL CHECK (status IN ('pending','sent','failed','skipped_no_contact')),
  sends_count        int  NOT NULL DEFAULT 0 CHECK (sends_count >= 0),
  last_sent_at       timestamptz,
  has_responded      boolean NOT NULL DEFAULT false, -- BOOLEAN, não instante: instante fino era oráculo de de-anon
  error              text,
  UNIQUE (cycle_id, respondent_user_id)              -- 1 trilha/corretor/ciclo; TAMBÉM é a reserva do claim-before-send (§6)
);

-- Hot-path do lembrete devido (senão seq scan ilimitado por tick).
CREATE INDEX IF NOT EXISTS survey_dispatches_due
  ON public.survey_dispatches (cycle_id, last_sent_at)
  WHERE has_responded = false AND status = 'sent';

-- ------------------------------------------------------------
-- 4) survey_responses — ANÔNIMO por padrão. SEM timestamp de criação (§5).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- uuid v4: não vaza ordem de inserção
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cycle_id               uuid NOT NULL REFERENCES public.survey_cycles(id) ON DELETE RESTRICT,  -- dado coletado
  answers                jsonb NOT NULL,             -- {q_empresa, q_gestor, q_comentario}
  enps_empresa smallint GENERATED ALWAYS AS ((answers->>'q_empresa')::smallint) STORED,
  enps_gestor  smallint GENERATED ALWAYS AS ((answers->>'q_gestor')::smallint)  STORED,
  subject_leader_user_id uuid,                        -- gestor avaliado na Q2 (chave de ranking; SEM FK)
  respondent_user_id     uuid,                        -- NULL = anônimo; setado só com opt-in; SEM FK
  CHECK (enps_empresa BETWEEN 0 AND 10),
  CHECK (enps_gestor IS NULL OR enps_gestor BETWEEN 0 AND 10)
);

-- Integridade da métrica-título SEM ferir anonimato: linhas anônimas (NULL) isentas do UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_one_per_optin
  ON public.survey_responses (cycle_id, respondent_user_id)
  WHERE respondent_user_id IS NOT NULL;

-- ============================================================
-- RLS RESTRITIVA (§5). Escrita SÓ service_role em todas (REVOKE anon/authenticated).
-- ============================================================
ALTER TABLE public.surveys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_cycles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_dispatches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses   ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.surveys           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.survey_cycles     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.survey_dispatches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.survey_responses  FROM anon, authenticated;

-- surveys: definição de pergunta (labels/tipos) — sem dado de tenant.
-- Template global (tenant_id NULL) é legível por todos; linhas de tenant só por membro/owner.
DROP POLICY IF EXISTS "surveys_select" ON public.surveys;
CREATE POLICY "surveys_select"
  ON public.surveys FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- survey_cycles: metadado do ciclo (sem notas) — membro do tenant ou owner pode ver.
DROP POLICY IF EXISTS "survey_cycles_select" ON public.survey_cycles;
CREATE POLICY "survey_cycles_select"
  ON public.survey_cycles FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- survey_dispatches: SELF-ROW ONLY (§5). Ninguém lê a linha identificada de outro corretor.
-- Participação (contagens) vem SÓ do endpoint service_role, nunca linhas por-usuário.
DROP POLICY IF EXISTS "survey_dispatches_select_self" ON public.survey_dispatches;
CREATE POLICY "survey_dispatches_select_self"
  ON public.survey_dispatches FOR SELECT
  USING (respondent_user_id = auth.uid());

-- survey_responses: SEM policy de SELECT de propósito → RLS ligado + zero policy =
-- inacessível a anon/authenticated (mesmo padrão de job_heartbeats). Toda leitura passa
-- pelo endpoint service_role, que aplica o N-mínimo ANTES de devolver qualquer coisa.
-- (Não criar policy aqui é a garantia de anonimato — ver §5.)

-- ------------------------------------------------------------
-- COMMENTs
-- ------------------------------------------------------------
COMMENT ON TABLE  public.surveys                          IS 'Definição de pesquisa (data-driven). eNPS é 1 linha semente (tenant_id NULL = template global). questions[].type ∈ nps_0_10|open_text.';
COMMENT ON TABLE  public.survey_cycles                    IS '1 ciclo por (tenant, survey, período mensal). No máximo um ABERTO por tenant/survey (partial-unique).';
COMMENT ON TABLE  public.survey_dispatches                IS 'IDENTIFICADO: idempotência de envio (claim via UNIQUE) + lembrete + participação. NUNCA contém notas. RLS self-row-only (anonimato §5). Escrita só service_role.';
COMMENT ON TABLE  public.survey_responses                 IS 'ANÔNIMO por padrão (respondent_user_id só com opt-in). SEM created_at (período vem do ciclo). SEM leitura de membro: só endpoint service_role com N-mínimo (§5).';
COMMENT ON COLUMN public.survey_dispatches.has_responded  IS 'BOOLEAN (não instante). Lembrete só precisa respondeu? sim/não. Instante fino seria oráculo de de-anonimização (§5).';
COMMENT ON COLUMN public.survey_dispatches.status         IS 'pending (reservado/claim) → sent (transporte OK) → failed | skipped_no_contact. Só sent significa enviado (§6).';
COMMENT ON COLUMN public.survey_responses.enps_empresa    IS 'Coluna gerada de answers->>q_empresa (smallint, CHECK 0–10). Mata rename-silencioso de chave; indexável sem cast por linha.';
COMMENT ON COLUMN public.survey_responses.respondent_user_id IS 'NULL = anônimo. Setado só com opt-in self-only. SEM FK: não estreitar o conjunto de anonimato nem acoplar retenção ao ciclo de vida da conta (§4).';

-- ============================================================
-- SEMENTE: eNPS global (tenant_id NULL). Idempotente via surveys_one_global_per_kind.
-- ============================================================
INSERT INTO public.surveys (tenant_id, kind, title, questions, channels)
SELECT NULL, 'enps', 'eNPS de Corretores',
  '[
    {"key":"q_empresa","type":"nps_0_10","label":"O quanto você recomendaria esta imobiliária para outro corretor trabalhar?"},
    {"key":"q_gestor","type":"nps_0_10","label":"O quanto você recomendaria seu gestor imediato?"},
    {"key":"q_comentario","type":"open_text","required":false,"label":"Gostaria de deixar alguma sugestão, melhoria ou comentário?"}
  ]'::jsonb,
  '{email}'
WHERE NOT EXISTS (
  SELECT 1 FROM public.surveys WHERE kind = 'enps' AND tenant_id IS NULL AND active
);

-- ============================================================
-- RPC do lembrete (claim atômico). `sends_count = sends_count + 1` NÃO é
-- expressável no .update() do PostgREST → encapsula-se o UPDATE...RETURNING numa
-- função SQL (mesma razão do 20260725_agent_telemetry_aggregations). O runner
-- (Task 5) chama supabase.rpc('enps_claim_reminder', ...). Devolve a linha SÓ se
-- venceu o claim (não respondido, 'sent', e a janela de reminder venceu).
-- service_role-only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enps_claim_reminder(p_dispatch_id uuid, p_reminder_days int, p_now timestamptz)
RETURNS SETOF public.survey_dispatches
LANGUAGE sql
AS $$
  UPDATE public.survey_dispatches
     SET last_sent_at = p_now, sends_count = sends_count + 1
   WHERE id = p_dispatch_id
     AND has_responded = false
     AND status = 'sent'
     AND (last_sent_at IS NULL OR last_sent_at <= p_now - make_interval(days => p_reminder_days))
  RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.enps_claim_reminder(uuid, int, timestamptz) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enps_claim_reminder(uuid, int, timestamptz) TO service_role;

-- ROLLBACK (se necessário):
--   DROP FUNCTION IF EXISTS public.enps_claim_reminder(uuid, int, timestamptz);
--   DROP TABLE IF EXISTS public.survey_responses;
--   DROP TABLE IF EXISTS public.survey_dispatches;
--   DROP TABLE IF EXISTS public.survey_cycles;
--   DROP TABLE IF EXISTS public.surveys;

-- ============================================================
-- VERIFICAÇÃO (Steps 2-3 do brief): NÃO executados neste ambiente — sem
-- DATABASE_URL/psql/CLI linkada disponíveis aqui. Rodar manualmente após o
-- `supabase db push` (ou psql -f) em prod/dev, NESTA ORDEM:
--
-- (a) Semente existe, exatamente um eNPS global
--     SELECT count(*) FROM public.surveys WHERE kind='enps' AND tenant_id IS NULL AND active;
--     -- expected: 1
--
-- (b) CHECK 0–10 na coluna gerada: nota fora do domínio é barrada.
--     INSERT INTO public.survey_responses (tenant_id, cycle_id, answers)
--     VALUES ('<tenant-uuid>', '<cycle-uuid>', '{"q_empresa":47}'::jsonb);
--     -- expected: ERROR: new row ... violates check constraint (enps_empresa BETWEEN 0 AND 10)
--
-- (c) CHECK cadência: reminder_every_days=0 é barrado.
--     INSERT INTO public.surveys (kind,title,questions,reminder_every_days)
--     VALUES ('enps','x','[]'::jsonb,0);
--     -- expected: ERROR: violates check constraint (reminder_every_days > 0)
--
-- (d) Partial-unique: 2º ciclo ABERTO p/ mesmo tenant/survey é barrado.
--     INSERT INTO public.survey_cycles (tenant_id, survey_id, period_start)
--     VALUES ('<tenant-uuid>','<survey-uuid>','2026-08-01');
--     INSERT INTO public.survey_cycles (tenant_id, survey_id, period_start)
--     VALUES ('<tenant-uuid>','<survey-uuid>','2026-09-01');   -- ambos status='open'
--     -- expected: 2º INSERT ERROR: duplicate key value violates unique index "survey_cycles_one_open"
--
-- (e) Claim UNIQUE: 2º dispatch p/ mesmo (cycle, respondent) é barrado (o que faz o claim funcionar).
--     Rode dois INSERTs iguais em (cycle_id, respondent_user_id) → o 2º viola o UNIQUE.
--
-- Prova de RLS (rodar como anon/authenticated, NÃO service_role — via anon client
-- do app ou `SET ROLE anon;` no psql):
--
--   SET ROLE anon;
--   -- (f) responses: leitura direta de membro DEVE falhar/retornar vazio (RLS sem policy).
--   SELECT * FROM public.survey_responses LIMIT 1;
--   -- expected: 0 rows (RLS nega SELECT — nenhuma policy concede) OU permission denied
--
--   -- (g) dispatches: self-row-only — sem auth.uid() casando, 0 linhas de outro corretor.
--   SELECT respondent_user_id, has_responded FROM public.survey_dispatches LIMIT 1;
--   -- expected: 0 rows
--
--   -- (h) escrita direta de membro DEVE falhar (REVOKE).
--   INSERT INTO public.survey_responses (tenant_id, cycle_id, answers)
--   VALUES ('<tenant-uuid>','<cycle-uuid>','{"q_empresa":9}'::jsonb);
--   -- expected: ERROR: permission denied for table survey_responses
--   RESET ROLE;
--
-- Se todos os blocos baterem, schema + RLS estão corretos.
-- ============================================================
