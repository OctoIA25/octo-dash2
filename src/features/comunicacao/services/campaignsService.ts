/** Serviço de Campanhas (C1). Reusa o authedFetch central (JWT + refresh/retry em 401). */
import { authedFetch } from './authedFetch';
import type { VarMapping } from '../variableMapping';

export interface Campaign {
  id: string;
  name: string;
  template_id: string;
  audience_id: string;
  max_recipients: number | null;
  send_window: Record<string, number>;
  throttle_per_min: number | null;
  avoid_resend: boolean;
  variable_mapping: VarMapping;
  internal_note: string | null;
  notify_on_complete: boolean;
  schedule: { mode: string; [k: string]: unknown };
  status: 'draft' | 'active' | 'archived';
  scheduled_at: string | null;
  schedule_status: 'none' | 'scheduled' | 'dispatched' | 'error' | 'canceled';
  schedule_error: string | null;
  recurrence: { frequency: 'daily' | 'weekly'; day_of_week?: number; time: string } | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignWithStats extends Campaign {
  runs_count: number;
  total_sent: number;
  total_failed: number;
  last_dispatched_at: string | null;
}

export interface CampaignInput {
  name: string;
  templateId: string;
  audienceId: string;
  maxRecipients?: number | null;
  sendWindow?: Record<string, number>;
  throttlePerMin?: number | null;
  avoidResend?: boolean;
  variableMapping?: VarMapping;
  internalNote?: string | null;
  notifyOnComplete?: boolean;
  scheduledAt?: string | null;
  recurrence?: { frequency: 'daily' | 'weekly'; day_of_week?: number; time: string } | null;
}

export interface CampaignRun {
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

const BASE = '/api/v1/communication/dispatch/campaigns';

export async function listCampaigns(tenantId: string): Promise<{ ok: boolean; campaigns: CampaignWithStats[] }> {
  const res = await authedFetch(`${BASE}?tenantId=${encodeURIComponent(tenantId)}`);
  return res.json();
}
export async function createCampaign(tenantId: string, input: CampaignInput): Promise<{ ok: boolean; campaign?: Campaign; error?: string }> {
  const res = await authedFetch(BASE, { method: 'POST', body: JSON.stringify({ tenantId, ...input }) });
  return res.json();
}
export async function updateCampaign(tenantId: string, id: string, patch: Partial<CampaignInput>): Promise<{ ok: boolean; campaign?: Campaign; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ tenantId, ...patch }) });
  return res.json();
}
export async function deleteCampaign(tenantId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE' });
  return res.json();
}
export async function dispatchCampaign(tenantId: string, id: string): Promise<{ ok: boolean; runId?: string; enqueued?: number; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}/dispatch`, { method: 'POST', body: JSON.stringify({ tenantId }) });
  return res.json();
}
export async function listCampaignRuns(tenantId: string, id: string): Promise<{ ok: boolean; runs: CampaignRun[] }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}/runs?tenantId=${encodeURIComponent(tenantId)}`);
  return res.json();
}
export async function cancelSchedule(tenantId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}/cancel-schedule`, { method: 'POST', body: JSON.stringify({ tenantId }) });
  return res.json();
}
