import { describe, it, expect } from 'vitest';
import {
  classifyStage,
  computeTrend,
  countVendas,
  avgResponseMinutes,
  buildFunnel,
  buildSources,
  buildPriceRanges,
  buildCards,
  buildCommercialComparison,
  buildOverview,
} from './kpisCompute.js';

describe('classifyStage — etapas mutuamente exclusivas', () => {
  it('classifica cada etapa na sua faixa canônica', () => {
    expect(classifyStage('Novos Leads')).toBe('Novos Leads');
    expect(classifyStage('Em Atendimento')).toBe('Em Atendimento');
    expect(classifyStage('Interação')).toBe('Em Atendimento');
    expect(classifyStage('Visita Agendada')).toBe('Visita');
    expect(classifyStage('Proposta Enviada')).toBe('Proposta');
    expect(classifyStage('Negociação')).toBe('Proposta');
    expect(classifyStage('Proposta Assinada')).toBe('Fechamento');
    expect(classifyStage('Negócio Fechado')).toBe('Fechamento');
  });

  it('etapa vazia/desconhecida cai no topo (Novos Leads)', () => {
    expect(classifyStage('')).toBe('Novos Leads');
    expect(classifyStage(null)).toBe('Novos Leads');
    expect(classifyStage('etapa-inexistente')).toBe('Novos Leads');
  });

  it('um lead em Fechamento NÃO é classificado também como Visita', () => {
    // "Visita Realizada → Fechamento" não deve cair na faixa de Visita.
    expect(classifyStage('Fechamento')).not.toBe('Visita');
  });
});

describe('computeTrend — variação percentual', () => {
  it('retorna null quando não há baseline (evita +100% enganoso)', () => {
    expect(computeTrend(10, 0)).toEqual({ percent: null, positive: true });
  });

  it('null com positive=false quando lowerIsBetter e sem baseline', () => {
    expect(computeTrend(10, 0, true)).toEqual({ percent: null, positive: false });
  });

  it('calcula crescimento e queda corretamente', () => {
    expect(computeTrend(120, 100)).toEqual({ percent: 20, positive: true });
    expect(computeTrend(80, 100)).toEqual({ percent: -20, positive: false });
  });

  it('lowerIsBetter: queda é positiva (bom)', () => {
    expect(computeTrend(80, 100, true)).toEqual({ percent: -20, positive: true });
    expect(computeTrend(120, 100, true)).toEqual({ percent: 20, positive: false });
  });
});

describe('countVendas — definição única de venda (final_sale_value > 0)', () => {
  it('conta só leads com valor de venda positivo', () => {
    const leads = [
      { final_sale_value: 500000 },
      { final_sale_value: 0 },
      { final_sale_value: null },
      { final_sale_value: '300000' }, // string numérica
    ];
    expect(countVendas(leads)).toEqual({ qtd: 2, valor: 800000 });
  });

  it('zero vendas → {0, 0}', () => {
    expect(countVendas([{ final_sale_value: null }])).toEqual({ qtd: 0, valor: 0 });
    expect(countVendas([])).toEqual({ qtd: 0, valor: 0 });
  });
});

describe('avgResponseMinutes', () => {
  it('média dos tempos válidos', () => {
    const leads = [
      { created_at: '2026-06-01T10:00:00Z', first_response_at: '2026-06-01T10:30:00Z' }, // 30min
      { created_at: '2026-06-01T10:00:00Z', first_response_at: '2026-06-01T11:00:00Z' }, // 60min
    ];
    expect(avgResponseMinutes(leads)).toBe(45);
  });

  it('ignora tempos negativos (datas inconsistentes)', () => {
    const leads = [
      { created_at: '2026-06-01T11:00:00Z', first_response_at: '2026-06-01T10:00:00Z' }, // -60min → ignorado
      { created_at: '2026-06-01T10:00:00Z', first_response_at: '2026-06-01T10:20:00Z' }, // 20min
    ];
    expect(avgResponseMinutes(leads)).toBe(20);
  });

  it('sem respostas válidas → 0', () => {
    expect(avgResponseMinutes([{ created_at: '2026-06-01T10:00:00Z', first_response_at: null }])).toBe(0);
    expect(avgResponseMinutes([])).toBe(0);
  });
});

describe('buildFunnel — exclusivo + conversões', () => {
  it('cada lead conta em exatamente uma etapa; soma das etapas = total', () => {
    const leads = [
      { status: 'Novos Leads' },
      { status: 'Em Atendimento' },
      { status: 'Visita Agendada' },
      { status: 'Proposta Enviada' },
      { status: 'Proposta Assinada' },
    ];
    const funnel = buildFunnel(leads);
    const soma = funnel.stages.reduce((acc, s) => acc + s.count, 0);
    expect(soma).toBe(leads.length); // sem dupla contagem
  });

  it('topo NÃO é forçado a 100% do total (corrige o bug "Novos Leads = total")', () => {
    const leads = [{ status: 'Proposta Assinada' }, { status: 'Em Atendimento' }];
    const funnel = buildFunnel(leads);
    const novos = funnel.stages.find((s) => s.label === 'Novos Leads');
    expect(novos.count).toBe(0); // nenhum lead está em "Novos Leads"
  });

  it('conversão da primeira etapa é null; geral = base/topo', () => {
    const leads = [
      { status: 'Novos Leads' },
      { status: 'Novos Leads' },
      { status: 'Fechamento' },
    ];
    const funnel = buildFunnel(leads);
    expect(funnel.stages[0].conversionFromPrevious).toBeNull();
    // topo (Novos Leads)=2, base (Fechamento)=1 → 50%
    expect(funnel.overallConversion).toBe(50);
  });

  it('funil vazio não quebra (sem divisão por zero)', () => {
    const funnel = buildFunnel([]);
    expect(funnel.overallConversion).toBe(0);
    expect(funnel.stages.every((s) => s.percentOfTotal === 0)).toBe(true);
  });
});

describe('buildSources — agrupa por fonte canônica', () => {
  it('une variações de capitalização/espaço da mesma fonte', () => {
    const leads = [
      { source: 'Zap', final_sale_value: 100 },
      { source: 'zap ', final_sale_value: 200 },
      { source: 'OLX', final_sale_value: 50 },
      { source: 'Indicação', final_sale_value: 0 }, // sem venda → ignorado
    ];
    const sources = buildSources(leads);
    const zap = sources.find((s) => s.fonte.toLowerCase() === 'zap');
    expect(zap.quantidade).toBe(2);
    expect(zap.valor).toBe(300);
    expect(sources.find((s) => s.fonte === 'Indicação')).toBeUndefined();
  });
});

describe('buildPriceRanges', () => {
  it('classifica vendas por faixa de preço', () => {
    const leads = [
      { final_sale_value: 400000 },
      { final_sale_value: 700000 },
      { final_sale_value: 1500000 },
      { final_sale_value: 0 }, // ignorado
    ];
    const ranges = buildPriceRanges(leads);
    expect(ranges.find((r) => r.faixa.includes('500 mil')).quantidade).toBeGreaterThanOrEqual(0);
    const total = ranges.reduce((acc, r) => acc + r.quantidade, 0);
    expect(total).toBe(3);
  });
});

describe('buildCards', () => {
  it('taxa de atendimento sem leads não divide por zero', () => {
    const cards = buildCards([], [], 0);
    const taxa = cards.find((c) => c.key === 'taxaAtendimento');
    expect(taxa.displayValue).toBe('0.0%');
  });

  it('tempo de resposta usa lowerIsBetter na variação', () => {
    const current = [{ created_at: '2026-06-01T10:00:00Z', first_response_at: '2026-06-01T10:10:00Z' }]; // 10min
    const previous = [{ created_at: '2026-05-01T10:00:00Z', first_response_at: '2026-05-01T10:30:00Z' }]; // 30min
    const cards = buildCards(current, previous, 0);
    const tmr = cards.find((c) => c.key === 'tempoMedioResposta');
    // caiu de 30 para 10 → variação negativa, mas POSITIVA para o negócio
    expect(tmr.trend.positive).toBe(true);
  });
});

describe('buildCommercialComparison — VGV/VGC mês a mês', () => {
  it('monta VGV e VGC com anterior/atual, displays e variação', () => {
    const result = buildCommercialComparison({
      current: { vgv: 1800000, vgc: 95000 },
      previous: { vgv: 1200000, vgc: 60000 },
      currentLabel: 'Junho/2026',
      previousLabel: 'Maio/2026',
    });
    expect(result).toHaveLength(2);

    const vgv = result.find((r) => r.key === 'vgv');
    expect(vgv.label).toBe('VGV');
    expect(vgv.previousValue).toBe(1200000);
    expect(vgv.currentValue).toBe(1800000);
    expect(vgv.currentLabel).toBe('Junho/2026');
    expect(vgv.previousLabel).toBe('Maio/2026');
    expect(vgv.trend.percent).toBe(50); // 1.2M → 1.8M
    expect(vgv.trend.positive).toBe(true);

    const vgc = result.find((r) => r.key === 'vgc');
    expect(vgc.currentValue).toBe(95000);
    expect(vgc.previousValue).toBe(60000);
  });

  it('sem baseline (mês anterior zerado) → trend.percent null', () => {
    const result = buildCommercialComparison({
      current: { vgv: 500000, vgc: 20000 },
      previous: { vgv: 0, vgc: 0 },
      currentLabel: 'Junho/2026',
      previousLabel: 'Maio/2026',
    });
    expect(result.find((r) => r.key === 'vgv').trend.percent).toBeNull();
  });

  it('valores ausentes/nulos viram 0 (sem NaN)', () => {
    const result = buildCommercialComparison({
      current: { vgv: null },
      previous: {},
      currentLabel: 'A',
      previousLabel: 'B',
    });
    const vgc = result.find((r) => r.key === 'vgc');
    expect(vgc.currentValue).toBe(0);
    expect(vgc.previousValue).toBe(0);
  });
});

describe('buildCards — modo configurável (com config)', () => {
  const NATIVE_CONFIG = [
    { id: 'k1', name: 'Total de Leads', source: 'crm', metricKey: 'totalLeads', unit: 'count', status: 'active', isVisible: true, displayOrder: 0 },
    { id: 'k2', name: 'Vendas', source: 'crm', metricKey: 'vendas', unit: 'count', status: 'active', isVisible: true, displayOrder: 1 },
  ];

  it('nativos por metric_key, com id e ordem', () => {
    const current = [{ status: 'novo', final_sale_value: 0 }, { status: 'novo', final_sale_value: 500000 }];
    const cards = buildCards(current, [], 0, { kpis: NATIVE_CONFIG, targets: [], values: [] });
    const leads = cards.find((c) => c.metricKey === 'totalLeads');
    expect(leads.id).toBe('k1');
    expect(leads.rawValue).toBe(2);
    expect(leads.target).toBe(null);
    expect(cards[0].displayOrder <= cards[1].displayOrder).toBe(true);
  });

  it('card manual usa kpi_values e calcula progresso', () => {
    const config = {
      kpis: [{ id: 'm1', name: 'NPS', source: 'manual', metricKey: null, unit: 'count', status: 'active', isVisible: true, displayOrder: 5 }],
      targets: [{ kpiId: 'm1', targetValue: 80 }],
      values: [{ kpiId: 'm1', value: 60 }],
    };
    const cards = buildCards([], [], 0, config);
    const nps = cards.find((c) => c.id === 'm1');
    expect(nps.rawValue).toBe(60);
    expect(nps.target).toBe(80);
    expect(nps.progressPercent).toBe(75);
  });

  it('oculta inativo/invisível', () => {
    const config = { kpis: [{ id: 'h', name: 'X', source: 'manual', metricKey: null, unit: 'count', status: 'inactive', isVisible: true, displayOrder: 0 }], targets: [], values: [] };
    expect(buildCards([], [], 0, config).length).toBe(0);
  });

  it('crm com metricKey inválido: não quebra (mostra 0) e avisa', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = {
      kpis: [{ id: 'x', name: 'KPI Bugado', source: 'crm', metricKey: 'inexistente', unit: 'count', status: 'active', isVisible: true, displayOrder: 0 }],
      targets: [], values: [],
    };
    const cards = buildCards([{ status: 'novo', final_sale_value: 0 }], [], 0, config);
    expect(cards[0].rawValue).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('buildOverview — shape completo', () => {
  it('monta o pacote alinhado ao contrato do front', () => {
    const overview = buildOverview({
      period: { startDate: '2026-06-01', endDate: '2026-06-30', label: 'Junho/2026' },
      currentLeads: [{ status: 'Proposta Assinada', final_sale_value: 500000, source: 'Zap' }],
      previousLeads: [],
      imoveisAtivos: 12,
      goals: [{ id: 'g1', name: 'VGV', realizadoDisplay: 'R$ 1', metaDisplay: 'R$ 2', percent: 50 }],
      commercialCurrent: { vgv: 1800000, vgc: 95000 },
      commercialPrevious: { vgv: 1200000, vgc: 60000 },
      previousLabel: 'Maio/2026',
    });
    expect(overview.period.label).toBe('Junho/2026');
    expect(overview.cards).toHaveLength(6);
    expect(overview.funnel.stages).toHaveLength(5);
    expect(overview.sources[0].fonte).toBe('Zap');
    expect(overview.goals).toHaveLength(1);
    expect(overview.commercial).toHaveLength(2);
    expect(overview.commercial.find((c) => c.key === 'vgv').currentValue).toBe(1800000);
  });

  it('commercial cai para zeros quando os totais não são informados', () => {
    const overview = buildOverview({
      period: { startDate: '2026-06-01', endDate: '2026-06-30', label: 'Junho/2026' },
      currentLeads: [],
      previousLeads: [],
      imoveisAtivos: 0,
      goals: [],
    });
    const vgv = overview.commercial.find((c) => c.key === 'vgv');
    expect(vgv.currentValue).toBe(0);
    expect(vgv.previousValue).toBe(0);
  });
});
