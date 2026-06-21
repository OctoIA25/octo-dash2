/**
 * Implementação REST do `KpisService` — consome `GET /api/v1/kpis`.
 *
 * Esta é a fonte de verdade EM PRODUÇÃO: o cálculo dos KPIs vive no servidor
 * (server/kpis), que isola por tenant e agrega no banco. O front apenas envia
 * o JWT do usuário (o servidor deriva o tenant) e renderiza o `overview`.
 *
 * O servidor devolve exatamente o shape `KpisOverview`, então não há
 * transformação aqui — só transporte, autenticação e tratamento de erro.
 */

import { supabase } from '@/lib/supabaseClient';
import type { KpisOverview, KpisService } from '../types';

/** Espera, no máximo, este tempo pela resposta antes de abortar. */
const REQUEST_TIMEOUT_MS = 20_000;

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export const restKpisService: KpisService = {
  async getOverview({ tenantId, period, agentId }) {
    const params = new URLSearchParams({ month: period.startDate });
    if (agentId) params.set('agentId', agentId);
    // Owner impersonando um tenant precisa enviá-lo (o servidor exige tenantId
    // para owner). Para usuário comum o servidor deriva/valida pelo JWT — enviar
    // o tenant da sessão é seguro (o servidor confere a membership) e dispensável.
    if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/v1/kpis?${params.toString()}`, {
        headers: { ...(await authHeader()) },
        signal: controller.signal,
      });

      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        overview?: KpisOverview;
      };

      if (!response.ok || !json.ok || !json.overview) {
        throw new Error(json.error || `HTTP ${response.status}`);
      }
      return json.overview;
    } finally {
      clearTimeout(timeout);
    }
  },
};
