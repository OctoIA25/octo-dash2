/**
 * Telemetria de Agentes — leitura dos endpoints da T4 (dashboard).
 * Spec: docs/superpowers/specs/2026-07-24-telemetria-agentes-engenharia-reversa.md
 *
 * Os shapes espelham o contrato jsonb das RPCs (migration
 * 20260725_agent_telemetry_aggregations.sql) + o custo derivado no backend
 * (pricing.js). Janela: '30d' é o default do servidor (não manda from);
 * '7d'/'90d' viram `from` explícito; 'all' vira `window=all` (custo total).
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';

export type TelemetryWindowKey = '7d' | '30d' | '90d' | 'all';

export interface TelemetryFilters {
  tenantId: string;
  window: TelemetryWindowKey;
  agent?: string | null;
  model?: string | null;
  /** Enum fechado do evento (ok/error/timeout/empty_response/refused) — só o summary aceita. */
  status?: string | null;
}

export interface TelemetryTokens {
  input: number;
  output: number;
  cached: number;
  total: number;
  events_with_usage: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avg: number | null;
}

export interface TelemetryLatency {
  events_with_duration: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface TelemetryAgentRow {
  agent_slug: string;
  events: number;
  errors: number;
  total_tokens: number;
  avg_duration_ms: number | null;
}

export interface TelemetryModelRow {
  model: string;
  events: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  avg_duration_ms: number | null;
  cost_usd: number | null;
}

export interface TelemetrySummary {
  events: number;
  errors: number;
  by_status: Record<string, number>;
  tokens: TelemetryTokens | null;   // null quando nenhum evento tem usage
  latency: TelemetryLatency | null; // null quando nenhum evento tem duração
  by_agent: TelemetryAgentRow[];
  by_model: TelemetryModelRow[];
  cost: { total_usd: number | null; unknown_models: string[] };
}

export interface TelemetryTimeseriesPoint {
  bucket: string;
  events: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
}

export interface TelemetryErrorRow {
  error_class: string;
  agent_slug: string;
  occurrences: number;
  last_seen: string;
  sample_message: string | null;
}

export interface TelemetryOverview {
  disparador: { runs: { done: number; failed: number; pending: number; running: number } } | null;
  delivery: { pending: number; delivered: number; failed: number } | null;
  chat: { conversations: number; messages: number } | null;
  lia: {
    mensagens: { total: number; ia: number; corretor: number };
    perguntas: { pendentes: number; respondidas: number };
    followups: { enviados: number; pendentes: number; cancelados: number; expirados: number };
    visitas: { total: number; confirmadas: number };
  } | null;
  recovery: { pending: number; processing: number; done: number; failed: number; skipped: number } | null;
}

const WINDOW_DAYS: Record<Exclude<TelemetryWindowKey, 'all' | '30d'>, number> = {
  '7d': 7,
  '90d': 90,
};

function windowParams(window: TelemetryWindowKey): Record<string, string> {
  if (window === 'all') return { window: 'all' };
  if (window === '30d') return {}; // default do servidor
  const days = WINDOW_DAYS[window];
  return { from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() };
}

function buildQuery(filters: TelemetryFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    tenantId: filters.tenantId,
    ...windowParams(filters.window),
    ...extra,
  });
  if (filters.agent) params.set('agent', filters.agent);
  if (filters.model) params.set('model', filters.model);
  if (filters.status) params.set('status', filters.status);
  return params.toString();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await authedFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchTelemetrySummary(filters: TelemetryFilters): Promise<TelemetrySummary> {
  const { summary } = await getJson<{ summary: TelemetrySummary }>(
    `/api/v1/agent-telemetry/summary?${buildQuery(filters)}`,
  );
  return summary;
}

export async function fetchTelemetryTimeseries(
  filters: TelemetryFilters,
  bucket: 'hour' | 'day',
): Promise<TelemetryTimeseriesPoint[]> {
  const { points } = await getJson<{ points: TelemetryTimeseriesPoint[] }>(
    `/api/v1/agent-telemetry/timeseries?${buildQuery(filters, { bucket })}`,
  );
  return points;
}

export async function fetchTelemetryErrors(filters: TelemetryFilters): Promise<TelemetryErrorRow[]> {
  const { errors } = await getJson<{ errors: TelemetryErrorRow[] }>(
    `/api/v1/agent-telemetry/errors?${buildQuery(filters)}`,
  );
  return errors;
}

export async function fetchTelemetryOverview(tenantId: string): Promise<TelemetryOverview> {
  return getJson<TelemetryOverview>(
    `/api/v1/agent-telemetry/overview?${new URLSearchParams({ tenantId }).toString()}`,
  );
}

// ---------------------------------------------------------------- formatação

/** USD compacto: null → '—' (custo não-afirmável, nunca zero fingido). */
export function fmtUsd(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value > 0 && value < 0.01) return '< US$ 0,01';
  return `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Tokens compactos (1.2k / 3.4M); null → '—'. */
export function fmtTokens(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString('pt-BR');
}

/** Milissegundos legíveis (850 ms / 2,4 s); null → '—'. */
export function fmtMs(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
  return `${Math.round(value)} ms`;
}

/** Percentual de a sobre b; b=0 → '—' (sem divisão fingida). */
export function fmtRate(a: number, b: number): string {
  if (!b) return '—';
  return `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
