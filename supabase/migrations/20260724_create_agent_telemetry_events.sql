-- ============================================================
-- Telemetria de Agentes IA — eventos por execução / chamada LLM
-- Spec: docs/superpowers/specs/2026-07-24-telemetria-agentes-engenharia-reversa.md
--
-- Append-only e GENÉRICA (agent_slug é texto livre): agente novo = novos
-- valores, zero DDL. Captura SÓ o que não tem lugar hoje (tokens/modelo/
-- latência de LLM, execuções de chat, erros classificados). O que as tabelas
-- de fila/runs já registram NÃO é duplicado aqui.
--
-- Custo NÃO é coluna: derivado na leitura (tokens × tabela de preços em
-- código), para não congelar preço desatualizado no banco.
--
-- Privacidade: métricas apenas — NUNCA conteúdo de mensagem (mesma regra de
-- ouro do card IA·LIA). metadata é capada no ingest.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_telemetry_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_slug    text NOT NULL,
  source        text NOT NULL CHECK (source IN ('crm_server', 'crm_web', 'n8n')),
  event_type    text NOT NULL CHECK (event_type IN ('execution', 'llm_call', 'tool_call', 'handoff', 'error')),
  status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'timeout', 'empty_response', 'refused')),
  execution_id  text,
  model         text,
  provider      text,
  -- Tokens NULL = "não informado" (≠ 0). Só gravamos usage REAL do provedor.
  input_tokens  integer CHECK (input_tokens  >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  cached_tokens integer CHECK (cached_tokens >= 0),
  total_tokens  integer CHECK (total_tokens  >= 0),
  duration_ms   integer CHECK (duration_ms   >= 0),
  queue_ms      integer CHECK (queue_ms      >= 0),
  error_class   text,
  error_message text,
  tool_name     text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL,        -- relógio do emissor (clampado no ingest)
  received_at   timestamptz NOT NULL DEFAULT now()  -- relógio nosso (referência p/ skew)
);

-- Leituras do dashboard: sempre por tenant+janela; corte por agente; e a
-- família llm_call isolada (custos/tokens) sem varrer o resto.
CREATE INDEX IF NOT EXISTS idx_agent_telemetry_tenant_time
  ON public.agent_telemetry_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_telemetry_agent_time
  ON public.agent_telemetry_events (agent_slug, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_telemetry_llm
  ON public.agent_telemetry_events (tenant_id, occurred_at DESC)
  WHERE event_type = 'llm_call';

-- ------------------------------------------------------------
-- RLS: leitura por membro do tenant ou owner; escrita SÓ service_role.
-- Front e n8n escrevem via API do backend (ingest), nunca direto no PostgREST.
-- Mesmo padrão de agent_action_runs (20260620_create_agent_action_queue.sql).
-- ------------------------------------------------------------
ALTER TABLE public.agent_telemetry_events ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.agent_telemetry_events FROM anon, authenticated;

DROP POLICY IF EXISTS "agent_telemetry_events_select" ON public.agent_telemetry_events;
CREATE POLICY "agent_telemetry_events_select"
  ON public.agent_telemetry_events FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

COMMENT ON TABLE public.agent_telemetry_events
  IS 'Telemetria de agentes IA (append-only): 1 linha por execução/chamada LLM/tool/handoff. Escrita exclusiva do service_role via ingest. Custo é derivado na leitura (tokens × preços em código).';
COMMENT ON COLUMN public.agent_telemetry_events.agent_slug
  IS 'Identificador livre do agente (lia, elaine, caio, disparador, estudo-mercado, ...). Sem enum: dezenas de agentes futuros sem DDL.';
COMMENT ON COLUMN public.agent_telemetry_events.source
  IS 'Quem emitiu: crm_server (workers/rotas), crm_web (browser) ou n8n (fluxos externos via ingest com token de serviço).';
COMMENT ON COLUMN public.agent_telemetry_events.occurred_at
  IS 'Quando o fato ocorreu segundo o emissor; received_at é o relógio do backend (par usado p/ detectar skew).';
