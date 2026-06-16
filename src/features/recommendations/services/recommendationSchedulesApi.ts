/**
 * 🌐 Cliente dos agendamentos de recomendação (Fase 2).
 * O conteúdo é um snapshot enviado na criação; o worker server-side reenvia.
 */

import { supabase } from '@/lib/supabaseClient';
import type {
  RecommendationChannel,
  SendRecommendationLead,
  SendRecommendationProperty,
} from './recommendationsApi';

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export interface CreateScheduleRequest {
  tenantId: string;
  lead: SendRecommendationLead;
  channels: RecommendationChannel[];
  content: {
    subject?: string;
    message?: string;
    html?: string;
    text?: string;
    whatsappBody?: string;
  };
  properties: SendRecommendationProperty[];
  interestWindowDays?: number;
}

export interface RecommendationSchedule {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  channels: RecommendationChannel[];
  active: boolean;
  frequency: string;
  interest_window_days: number;
  next_run_at: string;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
}

export async function createSchedule(
  payload: CreateScheduleRequest,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const response = await fetch('/api/v1/recommendations/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: json.error || `HTTP ${response.status}` };
  return json;
}

export async function listSchedules(
  tenantId: string,
  leadId?: string,
): Promise<RecommendationSchedule[]> {
  const params = new URLSearchParams({ tenantId });
  if (leadId) params.set('leadId', leadId);
  const response = await fetch(`/api/v1/recommendations/schedules?${params.toString()}`, {
    headers: { ...(await authHeader()) },
  });
  if (!response.ok) return [];
  const json = await response.json().catch(() => ({ items: [] }));
  return (json.items || []) as RecommendationSchedule[];
}

export async function cancelSchedule(tenantId: string, id: string): Promise<boolean> {
  const response = await fetch('/api/v1/recommendations/schedules/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ tenantId, id }),
  });
  return response.ok;
}
