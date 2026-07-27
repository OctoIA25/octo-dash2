import { supabase } from '@/lib/supabaseClient';
import type { EnpsService, EnpsResponderContext, EnpsSubmitInput } from '../types';

const REQUEST_TIMEOUT_MS = 20_000;

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export const restEnpsService: EnpsService = {
  // getOverview é adicionado na Task 11 (mesmo objeto).
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
