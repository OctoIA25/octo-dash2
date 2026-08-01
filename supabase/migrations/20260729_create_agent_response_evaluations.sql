-- ============================================================
-- Avaliação de qualidade de respostas de agentes IA (D2 / Fatia C).
--
-- NÃO existe detecção automática de alucinação confiável (sem ground truth).
-- Em vez de inventar uma taxa, registramos AVALIAÇÕES explícitas: um humano
-- (gestor/owner) marca uma resposta como correta ou incorreta. O dashboard
-- mostra confirmed_correct / confirmed_wrong / not_evaluated — e NUNCA trata
-- não-avaliado como correto.
--
-- Ligação com o evento avaliado: (agent_slug, execution_id) — o mesmo par que a
-- telemetria já emite (execution_id = conversationId nos chats). Sem FK para
-- agent_telemetry_events: a avaliação pode existir antes/depois do evento e não
-- deve sumir por limpeza de telemetria.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_response_evaluations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_slug       text NOT NULL,
  execution_id     text,                 -- conversationId/runId do evento avaliado
  verdict          text NOT NULL CHECK (verdict IN ('correct', 'incorrect')),
  note             text,                 -- observação curta do avaliador (opcional)
  evaluator_user_id uuid NOT NULL,       -- quem avaliou (auth.users.id)
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Uma avaliação por (evento, avaliador): re-avaliar faz UPSERT, não duplica.
  UNIQUE (tenant_id, agent_slug, execution_id, evaluator_user_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_response_eval_tenant_time
  ON public.agent_response_evaluations (tenant_id, created_at DESC);

-- ------------------------------------------------------------
-- RLS: leitura por membro do tenant ou owner; escrita SÓ service_role (o
-- endpoint valida o avaliador). Mesmo padrão de agent_telemetry_events.
-- ------------------------------------------------------------
ALTER TABLE public.agent_response_evaluations ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.agent_response_evaluations FROM anon, authenticated;

DROP POLICY IF EXISTS "agent_response_eval_select" ON public.agent_response_evaluations;
CREATE POLICY "agent_response_eval_select"
  ON public.agent_response_evaluations FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

COMMENT ON TABLE public.agent_response_evaluations
  IS 'Avaliações humanas de qualidade de respostas de agentes (correct/incorrect). Base da métrica de qualidade SEM inventar taxa de alucinação. Escrita só service_role; não-avaliado NUNCA é tratado como correto.';

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.agent_response_evaluations;
