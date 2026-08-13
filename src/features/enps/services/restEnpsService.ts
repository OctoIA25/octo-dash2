/**
 * Cliente REST do eNPS. Usa `authedFetch` (não `fetch` cru): em 401 ele faz UM
 * refresh da sessão e re-tenta. Sem isso o painel quebrava de forma intermitente
 * com "Não foi possível carregar o eNPS" — o retry do React Query repete a chamada
 * com o MESMO token expirado, então os dois tentos batem 401.
 */
import { authedFetch } from '@/features/comunicacao/services/authedFetch';
import type { EnpsService, EnpsResponderContext, EnpsSubmitInput, EnpsOverview, EnpsPending } from '../types';

const REQUEST_TIMEOUT_MS = 20_000;

export const restEnpsService: EnpsService = {
  async getOverview({ tenantId, period, leader, corretor, team }): Promise<EnpsOverview> {
    const params = new URLSearchParams({ period: period.startDate });
    if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);
    if (leader) params.set('leader', leader);
    if (corretor) params.set('corretor', corretor);
    if (team) params.set('team', team);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await authedFetch(`/api/v1/enps?${params.toString()}`, { signal: controller.signal });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<EnpsOverview>;
      if (!res.ok || !json.ok || !json.geral) throw new Error(json.error || `HTTP ${res.status}`);
      return {
        period, geral: json.geral, evolucao: json.evolucao ?? [],
        participacao: json.participacao ?? { sent: 0, responded: 0, pending: 0, rate: 0 },
        ranking: json.ranking ?? [], distribuicao: json.distribuicao ?? { insufficient: true },
        comentarios: json.comentarios ?? { insufficient: true }, individual: json.individual,
        scope: json.scope ?? { locked: false, teamId: null, teamName: null, teams: [], corretores: [], corretorId: null },
      };
    } finally { clearTimeout(timeout); }
  },
  async getResponderContext(cycleId: string): Promise<EnpsResponderContext> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await authedFetch(`/api/v1/enps/cycle/${encodeURIComponent(cycleId)}`, { signal: controller.signal });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<EnpsResponderContext>;
      if (!res.ok || !json.ok || !json.cycle) throw new Error(json.error || `HTTP ${res.status}`);
      return { cycle: json.cycle, questions: json.questions ?? [], hasLeader: !!json.hasLeader, alreadyResponded: !!json.alreadyResponded };
    } finally { clearTimeout(timeout); }
  },
  async submitResponse(input: EnpsSubmitInput): Promise<{ ok: true }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await authedFetch('/api/v1/enps/responses', {
        method: 'POST', body: JSON.stringify(input), signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 409) throw new Error('Você já respondeu esta pesquisa.');
      if (res.status === 403) throw new Error('Este link não é válido para o seu usuário.');
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return { ok: true };
    } finally { clearTimeout(timeout); }
  },
  async getPending(): Promise<EnpsPending> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await authedFetch('/api/v1/enps/pending', { signal: controller.signal });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; cycleId?: string; periodStart?: string };
      // Banner é secundário: qualquer falha → trata como "sem pendência" (não quebra a dash).
      if (!res.ok || !json.ok || !json.pending || !json.cycleId) return { pending: false };
      return { pending: true, cycleId: json.cycleId, periodStart: json.periodStart ?? '' };
    } catch {
      return { pending: false };
    } finally { clearTimeout(timeout); }
  },
} as EnpsService;
