/**
 * Regressão: a aba Cliente Proprietário mostrava "1 Vendedor" num tenant sem
 * nenhum lead de proprietário. `kenlo_leads` não tem coluna lead_type — o
 * adapter carimba todos como Interessado — mas a busca do funil de Proprietário
 * anexava a tabela inteira sem filtrar.
 *
 * Mesmo estilo de fake dos outros testes deste serviço: honra `.range()`.
 */
import { describe, it, expect, vi } from 'vitest';

const TENANT = 'tenant-1';

const CRM_PROPRIETARIO = [
  { id: 'crm-1', tenant_id: TENANT, name: 'Dona do imóvel', status: 'Novos Proprietários', lead_type: 2, created_at: '2026-08-01T00:00:00Z' },
];
const KENLO = [
  { id: 'kenlo-1', tenant_id: TENANT, client_name: 'Lead de portal', stage: 'contacted', created_at: '2026-08-02T00:00:00Z' },
];

const tabelasConsultadas: string[] = [];

function builder(tabela: string) {
  let range: { from: number; to: number } | null = null;
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'ilike', 'order', 'not', 'in']) {
    chain[m] = () => chain;
  }
  chain.range = (from: number, to: number) => { range = { from, to }; return chain; };
  chain.then = (resolve: (r: unknown) => unknown) => {
    tabelasConsultadas.push(tabela);
    const fonte = tabela === 'leads' ? CRM_PROPRIETARIO : tabela === 'kenlo_leads' ? KENLO : [];
    const slice = range ? fonte.slice(range.from, range.to + 1) : fonte;
    return Promise.resolve({ data: slice, error: null }).then(resolve);
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

describe('funil de Proprietário não mistura leads de portal', () => {
  it('não consulta kenlo_leads quando o tipo pedido é Proprietário', async () => {
    tabelasConsultadas.length = 0;
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');

    const leads = await fetchLeadsForMetrics(TENANT, null, 2);

    expect(tabelasConsultadas).not.toContain('kenlo_leads');
    expect(leads).toHaveLength(1);
    expect(leads[0].id).toBe('crm-1');
  });

  it('continua trazendo kenlo_leads no funil de Interessado', async () => {
    tabelasConsultadas.length = 0;
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');

    await fetchLeadsForMetrics(TENANT, null, 1);

    expect(tabelasConsultadas).toContain('kenlo_leads');
  });
});
