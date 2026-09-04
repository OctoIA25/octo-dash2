/**
 * Regressão: a Home mostrava 1.001 leads enquanto "Meus Leads" mostrava 1.300.
 *
 * As listagens do Kanban já paginavam (ver leadsService.pagination.test.ts), mas a
 * query de `leads` em fetchLeadsForMetrics — a fonte dos KPIs da Home — não tinha
 * `.range()`. O PostgREST corta em 1000 linhas SEM erro, então a Home somava
 * 1000 (CRM truncado) + 1 (kenlo) e ninguém sabia que faltava dado.
 *
 * Mesmo fake do outro teste: honra `.range()` e RECUSA query sem ele.
 */
import { describe, it, expect, vi } from 'vitest';

const TOTAL_LEADS = 1300;
const TENANT = 'tenant-1';

const base = Array.from({ length: TOTAL_LEADS }, (_, i) => ({
  id: `lead-${String(i).padStart(4, '0')}`,
  tenant_id: TENANT,
  name: `Lead ${i}`,
  created_at: new Date(Date.UTC(2026, 0, 1) - i * 86400000).toISOString(),
  status: 'Novos Leads',
  lead_type: 1,
}));

function builder(tabela: string) {
  let range: { from: number; to: number } | null = null;
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'ilike', 'order', 'not', 'in']) {
    chain[m] = () => chain;
  }
  chain.range = (from: number, to: number) => { range = { from, to }; return chain; };
  chain.then = (resolve: (r: unknown) => unknown) => {
    if (tabela !== 'leads') return Promise.resolve({ data: [], error: null }).then(resolve);
    if (!range) {
      return Promise.resolve({
        data: null,
        error: { message: 'listagem de leads sem .range(): truncaria em 1000 linhas' },
      }).then(resolve);
    }
    return Promise.resolve({ data: base.slice(range.from, range.to + 1), error: null }).then(resolve);
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

describe('métricas da Home paginam além das 1000 linhas do PostgREST', () => {
  it('fetchLeadsForMetrics traz TODOS os leads do tenant', async () => {
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');
    const leads = await fetchLeadsForMetrics(TENANT, null, 1);

    expect(leads.length).toBe(TOTAL_LEADS);
    expect(leads.length).toBeGreaterThan(1000); // o corte que travava a Home em 1001
  });

  it('o lead MAIS ANTIGO entra na contagem da Home', async () => {
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');
    const leads = await fetchLeadsForMetrics(TENANT, null, 1);

    expect(leads.some((l) => l.id === base[base.length - 1].id)).toBe(true);
  });
});
