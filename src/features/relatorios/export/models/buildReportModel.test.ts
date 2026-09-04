/**
 * O `reportSource` é montado a cada render, inclusive antes dos KPIs chegarem
 * (`kpisGerais` nasce null e volta a null em erro). Sem o guard, a página
 * quebrava com "Cannot read properties of null (reading 'totalLeadsRecebidos')".
 */
import { describe, it, expect } from 'vitest';
import { buildReportModel } from './buildReportModel';
import type { ChartInput } from './source';

const chart: ChartInput = { chartType: 'bar', labels: [], series: [] };

describe('buildReportModel — marketing', () => {
  it('não quebra com kpis null e mostra os cards vazios', () => {
    const model = buildReportModel('marketing', {
      subtitle: 'Período: 2026-09-01 a 2026-09-04',
      marketing: {
        kpis: null,
        charts: {
          canal: chart, origem: chart, origemTotal: chart,
          convOrigem: chart, convCanal: chart, motivos: chart,
        },
      },
    });

    const kpis = model.sections.find((s) => s.id === 'mkt-kpis');
    expect(kpis?.kind).toBe('metrics');
    expect(kpis && 'items' in kpis ? kpis.items.map((i) => i.value) : []).toEqual([
      '0', '0', '0', '—', '0',
    ]);
  });
});
