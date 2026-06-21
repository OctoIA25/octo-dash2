import { describe, it, expect } from 'vitest';
import { buildOverview } from './kpisCompute.js';

// Conjunto de leads determinístico (cobre venda, funil, resposta, atendimento).
const FIXED_LEADS = [
  { status: 'novo',      source: 'Instagram', final_sale_value: 0,       created_at: '2026-06-01T10:00:00Z', first_response_at: '2026-06-01T10:30:00Z' },
  { status: 'proposta',  source: 'Facebook',  final_sale_value: 0,       created_at: '2026-06-02T10:00:00Z', first_response_at: null },
  { status: 'assinado',  source: 'Indicação', final_sale_value: 650000,  created_at: '2026-06-03T10:00:00Z', first_response_at: '2026-06-03T11:00:00Z' },
  { status: 'visita',    source: 'Instagram', final_sale_value: 0,       created_at: '2026-06-04T10:00:00Z', first_response_at: '2026-06-04T10:05:00Z' },
];
const PERIOD = { startDate: '2026-06-01', endDate: '2026-06-30', label: 'Junho/2026' };

describe('buildOverview — regressão do modo legado (sem config)', () => {
  it('snapshot dos números nativos + asserts explícitos', () => {
    const overview = buildOverview({
      period: PERIOD, currentLeads: FIXED_LEADS, previousLeads: [], imoveisAtivos: 7,
      goals: [], commercialCurrent: { vgv: 1000, vgc: 30 }, commercialPrevious: { vgv: 800, vgc: 24 },
      previousLabel: 'Maio/2026',
      // SEM config → caminho legado, que deve permanecer idêntico ao de hoje.
    });
    // Trava o shape e os valores derivados (cards/funnel/sources/priceRanges/commercial).
    expect(overview).toMatchSnapshot();
    // Asserts explícitos de regressão (além do snapshot), nos pontos mais sensíveis:
    const totalLeads = overview.cards.find((c) => c.metricKey === 'totalLeads');
    expect(totalLeads.rawValue).toBe(4);
    expect(totalLeads.target).toBe(null); // legado não tem meta
    const vendas = overview.cards.find((c) => c.metricKey === 'vendas');
    expect(vendas.rawValue).toBe(1);
  });
});
