/**
 * Serviço do Histórico de disparos (frontend). Lê os runs do tenant e o
 * progresso ao vivo dos que estão em andamento. Reusa o authedFetch central
 * (JWT Supabase + refresh/retry em 401).
 */
import { authedFetch } from './authedFetch';

export interface RunSummary {
  id: string;
  command_text: string | null;
  status: string;
  found_count: number;
  eligible_count: number;
  sent_count: number;
  failed_count: number;
  deduplicated_count: number;
  requested_by_email: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RunProgress {
  ok: boolean;
  status: string;
  done: number;
  failed: number;
  pending: number;
  total: number;
}

export interface HistoricoFiltros {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listRuns(
  tenantId: string,
  f: HistoricoFiltros = {},
): Promise<{ ok: boolean; runs: RunSummary[]; limit: number; offset: number }> {
  const params = new URLSearchParams({ tenantId });
  if (f.status) params.set('status', f.status);
  if (f.q) params.set('q', f.q);
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  if (f.limit != null) params.set('limit', String(f.limit));
  if (f.offset != null) params.set('offset', String(f.offset));
  const res = await authedFetch(`/api/v1/communication/dispatch/runs?${params.toString()}`);
  return res.json();
}

export async function getRunProgress(tenantId: string, runId: string): Promise<RunProgress> {
  const res = await authedFetch(
    `/api/v1/communication/dispatch/runs/${encodeURIComponent(runId)}/progress?tenantId=${encodeURIComponent(tenantId)}`,
  );
  return res.json();
}
