-- ============================================================
-- Telemetria de Agentes IA — RPCs de agregação (T4)
-- Spec: docs/superpowers/specs/2026-07-24-telemetria-agentes-engenharia-reversa.md §6.4
--
-- Agregação no banco (1 scan indexado por janela) em vez de trafegar linhas:
-- "custo total" é all-time e os percentis (percentile_cont) não existem no
-- PostgREST. Chamadas SEMPRE via service_role (endpoints do backend fazem a
-- auth/escopo de tenant); EXECUTE revogado de anon/authenticated.
--
-- p_tenant_id NULL = visão cross-tenant (o endpoint só permite para
-- owner/serviço — ver resolveReadScope em server/agent-telemetry/routes.js).
--
-- CONTRATO: as chaves do jsonb do summary (events, errors, by_status, tokens,
-- latency, by_agent, by_model, by_tenant) são lidas por nome em
-- server/agent-telemetry/routes.js + pricing.js. Renomear/remover chave aqui
-- SEM atualizar o par vira resposta vazia silenciosa (classe do incidente
-- get_tenant_members/CRECI) — evoluir os dois arquivos JUNTOS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.agent_telemetry_summary(
  p_tenant_id  uuid        DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_agent_slug text        DEFAULT NULL,
  p_model      text        DEFAULT NULL,
  p_status     text        DEFAULT NULL,
  p_event_type text        DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
WITH filtered AS (
  SELECT agent_slug, source, event_type, status, model,
         input_tokens, output_tokens, cached_tokens, total_tokens,
         duration_ms, tenant_id
  FROM public.agent_telemetry_events
  WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND (p_from IS NULL OR occurred_at >= p_from)
    AND (p_to   IS NULL OR occurred_at <  p_to)
    AND (p_agent_slug IS NULL OR agent_slug = p_agent_slug)
    AND (p_model      IS NULL OR model = p_model)
    AND (p_status     IS NULL OR status = p_status)
    AND (p_event_type IS NULL OR event_type = p_event_type)
)
SELECT jsonb_build_object(
  'events',      (SELECT count(*) FROM filtered),
  'errors',      (SELECT count(*) FROM filtered WHERE status IN ('error', 'timeout')),
  'by_status',   COALESCE((
    SELECT jsonb_object_agg(status, n)
    FROM (SELECT status, count(*) AS n FROM filtered GROUP BY status) s
  ), '{}'::jsonb),
  'tokens', (
    SELECT jsonb_build_object(
      'input',  COALESCE(sum(input_tokens),  0),
      'output', COALESCE(sum(output_tokens), 0),
      'cached', COALESCE(sum(cached_tokens), 0),
      'total',  COALESCE(sum(total_tokens),  0),
      -- eventos com usage real (denominador honesto p/ médias de tokens)
      'events_with_usage', count(*) FILTER (WHERE total_tokens IS NOT NULL),
      'p50', percentile_cont(0.5)  WITHIN GROUP (ORDER BY total_tokens),
      'p95', percentile_cont(0.95) WITHIN GROUP (ORDER BY total_tokens),
      'p99', percentile_cont(0.99) WITHIN GROUP (ORDER BY total_tokens),
      'avg', avg(total_tokens)
    ) FROM filtered WHERE total_tokens IS NOT NULL
  ),
  'latency', (
    SELECT jsonb_build_object(
      'events_with_duration', count(*),
      'avg', avg(duration_ms),
      'min', min(duration_ms),
      'max', max(duration_ms),
      'p50', percentile_cont(0.5)  WITHIN GROUP (ORDER BY duration_ms),
      'p95', percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms),
      'p99', percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)
    ) FROM filtered WHERE duration_ms IS NOT NULL
  ),
  'by_agent', COALESCE((
    SELECT jsonb_agg(row_to_json(a)) FROM (
      SELECT agent_slug,
             count(*) AS events,
             count(*) FILTER (WHERE status IN ('error', 'timeout')) AS errors,
             COALESCE(sum(total_tokens), 0) AS total_tokens,
             avg(duration_ms) AS avg_duration_ms
      FROM filtered GROUP BY agent_slug ORDER BY events DESC
    ) a
  ), '[]'::jsonb),
  'by_model', COALESCE((
    SELECT jsonb_agg(row_to_json(m)) FROM (
      SELECT model,
             count(*) AS events,
             count(*) FILTER (WHERE status IN ('error', 'timeout')) AS errors,
             COALESCE(sum(input_tokens),  0) AS input_tokens,
             COALESCE(sum(output_tokens), 0) AS output_tokens,
             COALESCE(sum(cached_tokens), 0) AS cached_tokens,
             COALESCE(sum(total_tokens),  0) AS total_tokens,
             avg(duration_ms) AS avg_duration_ms
      FROM filtered WHERE model IS NOT NULL
      GROUP BY model ORDER BY events DESC
    ) m
  ), '[]'::jsonb),
  'by_tenant', CASE WHEN p_tenant_id IS NULL THEN COALESCE((
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT tenant_id,
             count(*) AS events,
             COALESCE(sum(total_tokens), 0) AS total_tokens
      FROM filtered GROUP BY tenant_id ORDER BY events DESC
    ) t
  ), '[]'::jsonb) ELSE NULL END
)
$$;

CREATE OR REPLACE FUNCTION public.agent_telemetry_timeseries(
  p_tenant_id  uuid        DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_bucket     text        DEFAULT 'day',   -- 'hour' | 'day' (qualquer outro vira 'day')
  p_agent_slug text        DEFAULT NULL,
  p_event_type text        DEFAULT NULL
) RETURNS TABLE (
  bucket          timestamptz,
  events          bigint,
  errors          bigint,
  input_tokens    bigint,
  output_tokens   bigint,
  total_tokens    bigint,
  avg_duration_ms numeric,
  p95_duration_ms double precision
)
LANGUAGE sql STABLE
AS $$
  SELECT date_trunc(CASE WHEN p_bucket = 'hour' THEN 'hour' ELSE 'day' END, occurred_at) AS bucket,
         count(*) AS events,
         count(*) FILTER (WHERE status IN ('error', 'timeout')) AS errors,
         COALESCE(sum(input_tokens),  0) AS input_tokens,
         COALESCE(sum(output_tokens), 0) AS output_tokens,
         COALESCE(sum(total_tokens),  0) AS total_tokens,
         avg(duration_ms) AS avg_duration_ms,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_duration_ms
  FROM public.agent_telemetry_events
  WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND (p_from IS NULL OR occurred_at >= p_from)
    AND (p_to   IS NULL OR occurred_at <  p_to)
    AND (p_agent_slug IS NULL OR agent_slug = p_agent_slug)
    AND (p_event_type IS NULL OR event_type = p_event_type)
  GROUP BY 1
  ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.agent_telemetry_errors(
  p_tenant_id  uuid        DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_agent_slug text        DEFAULT NULL,
  p_limit      integer     DEFAULT 20
) RETURNS TABLE (
  error_class    text,
  agent_slug     text,
  occurrences    bigint,
  last_seen      timestamptz,
  sample_message text
)
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(error_class, status) AS error_class,
         agent_slug,
         count(*) AS occurrences,
         max(occurred_at) AS last_seen,
         -- amostra mais recente da mensagem (sem conteúdo de usuário por construção)
         (array_agg(error_message ORDER BY occurred_at DESC)
            FILTER (WHERE error_message IS NOT NULL))[1] AS sample_message
  FROM public.agent_telemetry_events
  WHERE status IN ('error', 'timeout')
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND (p_from IS NULL OR occurred_at >= p_from)
    AND (p_to   IS NULL OR occurred_at <  p_to)
    AND (p_agent_slug IS NULL OR agent_slug = p_agent_slug)
  GROUP BY 1, 2
  ORDER BY occurrences DESC, last_seen DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
$$;

-- Execução SÓ pelo backend (service_role). PostgREST expõe RPC a
-- anon/authenticated por default — revogar fecha esse caminho.
REVOKE EXECUTE ON FUNCTION public.agent_telemetry_summary(uuid, timestamptz, timestamptz, text, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_telemetry_timeseries(uuid, timestamptz, timestamptz, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_telemetry_errors(uuid, timestamptz, timestamptz, text, integer) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.agent_telemetry_summary(uuid, timestamptz, timestamptz, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_telemetry_timeseries(uuid, timestamptz, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_telemetry_errors(uuid, timestamptz, timestamptz, text, integer) TO service_role;

COMMENT ON FUNCTION public.agent_telemetry_summary(uuid, timestamptz, timestamptz, text, text, text, text)
  IS 'Totais, percentis (tokens/latência) e quebras por agente/modelo/status da telemetria de agentes. p_tenant_id NULL = cross-tenant (owner). Custo NÃO é calculado aqui: tokens × pricing.js na leitura.';
COMMENT ON FUNCTION public.agent_telemetry_timeseries(uuid, timestamptz, timestamptz, text, text, text)
  IS 'Série temporal (hour|day) de eventos/erros/tokens/latência da telemetria de agentes.';
COMMENT ON FUNCTION public.agent_telemetry_errors(uuid, timestamptz, timestamptz, text, integer)
  IS 'Ranking de erros por classe+agente com última ocorrência e mensagem-amostra.';
