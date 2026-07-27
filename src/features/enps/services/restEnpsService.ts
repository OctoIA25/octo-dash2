import { supabase } from '@/lib/supabaseClient';
import type { EnpsService, EnpsResponderContext, EnpsSubmitInput, EnpsOverview } from '../types';

const REQUEST_TIMEOUT_MS = 20_000;

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export const restEnpsService: EnpsService = {
  async getOverview({ tenantId, period, leader, corretor }): Promise<EnpsOverview> {
    const params = new URLSearchParams({ period: period.startDate });
    if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);
    if (leader) params.set('leader', leader);
    if (corretor) params.set('corretor', corretor);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/v1/enps?${params.toString()}`, { headers: { ...(await authHeader()) }, signal: controller.signal });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<EnpsOverview>;
      if (!res.ok || !json.ok || !json.geral) throw new Error(json.error || `HTTP ${res.status}`);
      return {
        period, geral: json.geral, evolucao: json.evolucao ?? [],
        participacao: json.participacao ?? { sent: 0, responded: 0, pending: 0, rate: 0 },
        ranking: json.ranking ?? [], distribuicao: json.distribuicao ?? { insufficient: true },
        comentarios: json.comentarios ?? { insufficient: true }, individual: json.individual,
      };
    } finally { clearTimeout(timeout); }
  },
  async getResponderContext(cycleId: string): Promise<EnpsResponderContext> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/v1/enps/cycle/${encodeURIComponent(cycleId)}`, { headers: { ...(await authHeader()) }, signal: controller.signal });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<EnpsResponderContext>;
      if (!res.ok || !json.ok || !json.cycle) throw new Error(json.error || `HTTP ${res.status}`);
      return { cycle: json.cycle, questions: json.questions ?? [], hasLeader: !!json.hasLeader, alreadyResponded: !!json.alreadyResponded };
    } finally { clearTimeout(timeout); }
  },
  async submitResponse(input: EnpsSubmitInput): Promise<{ ok: true }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('/api/v1/enps/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(input), signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 409) throw new Error('Você já respondeu esta pesquisa.');
      if (res.status === 403) throw new Error('Este link não é válido para o seu usuário.');
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return { ok: true };
    } finally { clearTimeout(timeout); }
  },
} as EnpsService;
