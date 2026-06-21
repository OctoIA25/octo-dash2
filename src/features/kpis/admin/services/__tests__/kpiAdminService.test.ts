import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock encadeável do supabase. Cada chamada de query devolve `this` até um
 * terminador (maybeSingle/single/then) resolver com o valor configurado.
 * `queue` define a resposta de cada operação terminal, na ordem em que ocorrem.
 */
const state: { responses: Array<{ data?: unknown; error?: unknown }>; calls: string[] } = {
  responses: [],
  calls: [],
};

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete']) {
    builder[m] = vi.fn(chain);
  }
  // Terminadores: consomem a próxima resposta da fila.
  const resolve = () => Promise.resolve(state.responses.shift() ?? { data: null, error: null });
  builder.maybeSingle = vi.fn(resolve);
  builder.single = vi.fn(resolve);
  // `update().eq().eq()` (reorder) é "thenável": Promise.all aguarda o builder.
  (builder as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    resolve().then(onFulfilled);
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      state.calls.push(table);
      return makeBuilder();
    },
  },
}));

import { mapRowToKpi, assertDeletable, deleteKpi, reorderKpis } from '../kpiAdminService';

beforeEach(() => {
  state.responses = [];
  state.calls = [];
});

describe('mapRowToKpi', () => {
  it('traduz snake_case → camelCase e coage números', () => {
    const kpi = mapRowToKpi({
      id: 'k1', tenant_id: 't1', name: 'Total de Leads', description: '',
      category_id: 'comercial', unit: 'count', source: 'crm', metric_key: 'totalLeads',
      status: 'active', is_visible: true, is_featured: false, display_order: '0',
      is_system: true, config: {}, created_at: 'a', updated_at: 'b',
    });
    expect(kpi.tenantId).toBe('t1');
    expect(kpi.metricKey).toBe('totalLeads');
    expect(kpi.displayOrder).toBe(0);
    expect(kpi.isSystem).toBe(true);
  });
});

describe('assertDeletable', () => {
  it('recusa KPI de sistema', () => {
    expect(() => assertDeletable({ isSystem: true })).toThrow('KPIs nativos não podem ser excluídos.');
  });
  it('permite KPI normal', () => {
    expect(() => assertDeletable({ isSystem: false })).not.toThrow();
  });
});

describe('deleteKpi — guard is_system fail-closed', () => {
  it('recusa excluir KPI de sistema (não chega ao DELETE)', async () => {
    state.responses = [{ data: { is_system: true }, error: null }];
    await expect(deleteKpi('k1', 't1')).rejects.toThrow('KPIs nativos não podem ser excluídos.');
  });

  it('FAIL-CLOSED: se a leitura falhar, aborta antes do DELETE', async () => {
    state.responses = [{ data: null, error: { message: 'network' } }];
    await expect(deleteKpi('k1', 't1')).rejects.toThrow('Não foi possível verificar o KPI antes de excluir.');
  });

  it('exclui KPI normal (leitura ok, não-sistema)', async () => {
    state.responses = [
      { data: { is_system: false }, error: null }, // SELECT
      { data: null, error: null },                 // DELETE
    ];
    await expect(deleteKpi('k1', 't1')).resolves.toBeUndefined();
  });
});

describe('reorderKpis — não falha em silêncio', () => {
  it('lança se qualquer update falhar', async () => {
    state.responses = [
      { data: null, error: null },
      { data: null, error: { message: 'falhou' } }, // 2º update falha
      { data: null, error: null },
    ];
    await expect(reorderKpis(['a', 'b', 'c'], 't1')).rejects.toThrow('Não foi possível reordenar os KPIs.');
  });

  it('resolve quando todos os updates ok', async () => {
    state.responses = [
      { data: null, error: null },
      { data: null, error: null },
    ];
    await expect(reorderKpis(['a', 'b'], 't1')).resolves.toBeUndefined();
  });
});
