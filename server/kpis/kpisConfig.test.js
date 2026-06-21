import { describe, it, expect } from 'vitest';
import { fetchDashboardKpis } from './kpisConfig.js';

describe('fetchDashboardKpis', () => {
  it('mapeia snake→camel e filtra por tenant', async () => {
    const calls = {};
    const supabase = { from: () => ({ select: () => ({ eq: (col, val) => { calls[col] = val; return { order: () => ({ data: [
      { id: 'k1', name: 'A', description: '', category_id: 'g', source: 'crm', metric_key: 'vendas', unit: 'count', status: 'active', is_visible: true, is_featured: false, display_order: '0', is_system: true },
    ], error: null }) }; } }) }) };
    const out = await fetchDashboardKpis(supabase, { tenantId: 't1' });
    expect(calls.tenant_id).toBe('t1');
    expect(out[0].metricKey).toBe('vendas');
    expect(out[0].displayOrder).toBe(0);
  });
});
