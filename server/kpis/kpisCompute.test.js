import { describe, it, expect } from 'vitest';
import {
  classifyStage,
  computeTrend,
  vendasDoPeriodo,
  medianMinutes,
  buildFunnel,
  buildSources,
  buildPriceRanges,
  buildCards,
  buildCommercialComparison,
  buildOverview,
  nativeCardValues,
} from './kpisCompute.js';

// Objeto counts vazio — reutilizado nos testes legados de buildCards/buildOverview.
const COUNTS0 = { imoveisAtivos: 0, captacaoExclusiva: 0, captacaoSemExclusividade: 0, tamanhoEquipe: 0, vgv: 0, vgc: 0, vgvPrev: 0, vgcPrev: 0 };

describe('classifyStage — etapas mutuamente exclusivas', () => {
  it('classifica cada etapa na sua faixa canônica', () => {
    expect(classifyStage('Novos Leads')).toBe('Novos Leads');
    expect(classifyStage('Em Atendimento')).toBe('Em Atendimento');
    expect(classifyStage('Interação')).toBe('Em Atendimento');
    expect(classifyStage('Visita Agendada')).toBe('Visita Agendada');
    expect(classifyStage('Visita Realizada')).toBe('Visita Realizada');
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
    expect(classifyStage('Fechamento')).not.toBe('Visita Agendada');
    expect(classifyStage('Fechamento')).not.toBe('Visita Realizada');
  });

  // Decisão de 17/09: "Visitas" deixou de ser um contador só. A aba KPIs somava
  // as duas etapas sob o rótulo "Visita" enquanto o Funil as mostrava separadas
  // — era daí que vinha o "0 numa tela e 7 em outra". A `leads.visit_date`, que
  // seria a outra fonte, está vazia em 100% dos leads e não entra mais na conta.
  it('agendada e realizada são etapas distintas', () => {
    expect(classifyStage('Visita Agendada')).not.toBe(classifyStage('Visita Realizada'));
  });
});

describe('conversão para visita — o contador que quebra em silêncio', () => {
  // countVisitaOuAlem() casa o rótulo de classifyStage contra um Set literal.
  // Separar "Visita" em duas etapas sem ajustar esse Set faria a conversão cair
  // para zero sem erro nenhum. Este teste é a trava.
  const lead = (o) => ({ status: 'Novos Leads', source: 'Site', final_sale_value: 0, ...o });

  it('conta agendada e realizada como "chegou a visita ou além"', () => {
    const current = [lead({ status: 'Visita Agendada' }), lead({ status: 'Visita Realizada' })];
    expect(nativeCardValues(current, [], COUNTS0).conversaoVisita.rawValue).toBe(100);
  });

  it('não conta quem ainda não chegou lá', () => {
    const current = [lead({ status: 'Novos Leads' }), lead({ status: 'Visita Agendada' })];
    expect(nativeCardValues(current, [], COUNTS0).conversaoVisita.rawValue).toBe(50);
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

/**
 * Venda saiu de `leads.final_sale_value` em 18/09. Essa coluna está VAZIA em
 * produção — 0 preenchidas nos 1.685 leads da Lotus, que tem 36 propostas
 * assinadas somando R$ 14,4 milhões. A aba KPIs mostrava "Vendas: 0" e
 * "Valor em Vendas: R$ 0" ao lado de um card de VGV com milhões.
 */
describe('vendasDoPeriodo — mesma fonte do VGV', () => {
  it('usa a quantidade e o valor que vêm da view', () => {
    expect(vendasDoPeriodo({ qtd: 4, vgv: 800000 })).toEqual({ qtd: 4, valor: 800000 });
  });

  it('período sem venda é 0, que é uma medição', () => {
    expect(vendasDoPeriodo({ qtd: 0, vgv: 0 })).toEqual({ qtd: 0, valor: 0 });
  });

  // `null` é leitura falhada e vira "Sem dados"; `0` seria "não vendeu nada".
  it('leitura falhada é null, nao zero', () => {
    expect(vendasDoPeriodo(null)).toEqual({ qtd: null, valor: null });
    expect(vendasDoPeriodo({ qtd: null, vgv: null })).toEqual({ qtd: null, valor: null });
  });
});

describe('medianMinutes', () => {
  it('mediana de uma amostra ímpar', () => {
    expect(medianMinutes([30, 10, 20])).toBe(20);
  });

  it('mediana de uma amostra par é a média dos dois do meio', () => {
    expect(medianMinutes([10, 20, 30, 40])).toBe(25);
  });

  // A razão de ser mediana e não média: um único lead recontatado semanas
  // depois move a média em horas e não mexe na mediana. Foi essa cauda que
  // fazia o card da Lotus anunciar 12,9 dias de "tempo de resposta".
  it('uma cauda longa nao desloca a mediana', () => {
    expect(medianMinutes([1, 2, 3, 4, 100000])).toBe(3);
  });

  it('ignora negativos (lead contatado antes do proprio created_at)', () => {
    expect(medianMinutes([-60, 20])).toBe(20);
  });

  // `Number(null)` é 0: sem descartar antes do cast, um nulo entrava como
  // "respondeu em zero minuto" e puxava a mediana para baixo.
  it('nulo nao vira zero', () => {
    expect(medianMinutes([null, undefined, '', 10, 20, 30])).toBe(20);
  });

  it('ignora o que nao e numero', () => {
    expect(medianMinutes(['x', NaN, false, [], {}, 10, 20, 30])).toBe(20);
  });

  // PostgREST devolve coluna `numeric` como string.
  it('aceita numero em string, que e como o PostgREST devolve numeric', () => {
    expect(medianMinutes(['1.4', '0.3', '2.5'])).toBe(1.4);
  });

  // `null` e `0` são afirmações diferentes: "não dá para medir" contra
  // "medimos e deu zero". O card mostra "Sem dados" só no primeiro caso.
  it('sem amostra devolve null, nao 0', () => {
    expect(medianMinutes([])).toBeNull();
    expect(medianMinutes(null)).toBeNull();
    expect(medianMinutes([-5, -10])).toBeNull();
  });

  it('zero minuto e uma medicao valida, nao ausencia', () => {
    expect(medianMinutes([0, 0, 0])).toBe(0);
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

// Recebe VENDAS (de `vendas_assinadas`), não leads. Antes filtrava
// `leads.final_sale_value > 0`, coluna vazia em produção: o bloco aparecia
// vazio na aba KPIs enquanto a Lotus tinha 36 vendas assinadas.
describe('buildSources — agrupa por fonte canônica', () => {
  it('une variações de capitalização/espaço da mesma fonte', () => {
    const vendas = [
      { fonte: 'Zap', valor: 100 },
      { fonte: 'zap ', valor: 200 },
      { fonte: 'OLX', valor: 50 },
    ];
    const sources = buildSources(vendas);
    const zap = sources.find((s) => s.fonte.toLowerCase() === 'zap');
    expect(zap.quantidade).toBe(2);
    expect(zap.valor).toBe(300);
  });

  it('venda sem fonte cai em "Outros", nao some do bloco', () => {
    const sources = buildSources([{ fonte: null, valor: 100 }, { fonte: '  ', valor: 50 }]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual({ fonte: 'Outros', quantidade: 2, valor: 150 });
  });

  // Leitura falhada chega como `null` e não pode explodir a montagem do painel.
  it('sem vendas devolve lista vazia', () => {
    expect(buildSources(null)).toEqual([]);
    expect(buildSources([])).toEqual([]);
  });
});

describe('buildPriceRanges', () => {
  it('classifica vendas por faixa de preço', () => {
    const leads = [
      { valor: 400000 },
      { valor: 700000 },
      { valor: 1500000 },
      { valor: 0 }, // ignorado
    ];
    const ranges = buildPriceRanges(leads);
    expect(ranges.find((r) => r.faixa.includes('500 mil')).quantidade).toBeGreaterThanOrEqual(0);
    const total = ranges.reduce((acc, r) => acc + r.quantidade, 0);
    expect(total).toBe(3);
  });

  it('sem vendas devolve as tres faixas zeradas, nao quebra', () => {
    expect(buildPriceRanges(null).every((r) => r.quantidade === 0)).toBe(true);
  });
});

describe('buildCards', () => {
  // Período sem lead nenhum: a taxa não é 0%, é indefinida. Dizer "0,0%" ali
  // afirma que ninguém foi atendido, quando não havia ninguém para atender.
  it('taxa de atendimento sem leads diz "Sem dados", nao 0,0%', () => {
    const cards = buildCards([], [], COUNTS0);
    const taxa = cards.find((c) => c.key === 'taxaAtendimento');
    expect(taxa.displayValue).toBe('Sem dados');
    expect(taxa.rawValue).toBeNull();
  });

  it('taxa de atendimento = leads que a LIA contatou sobre o total', () => {
    const current = [{ created_at: '2026-06-01T10:00:00Z' }, { created_at: '2026-06-01T10:00:00Z' },
                     { created_at: '2026-06-01T10:00:00Z' }, { created_at: '2026-06-01T10:00:00Z' }];
    const cards = buildCards(current, [], { ...COUNTS0, interacaoLia: [1, 2, 3] });
    const taxa = cards.find((c) => c.key === 'taxaAtendimento');
    expect(taxa.displayValue).toBe('75.0%');
  });

  it('tempo de resposta usa lowerIsBetter na variação', () => {
    // A amostra vem das views agora, por `counts` — não mais de uma coluna do lead.
    const cards = buildCards([], [], {
      ...COUNTS0,
      interacaoLia: [10],      // mediana 10 min neste período
      interacaoLiaPrev: [30],  // 30 min no anterior
    });
    const tmr = cards.find((c) => c.key === 'tempoMedioResposta');
    // caiu de 30 para 10 → variação negativa, mas POSITIVA para o negócio
    expect(tmr.trend.positive).toBe(true);
  });

  it('sem amostra o card diz "Sem dados" e a variacao nao inventa queda', () => {
    const cards = buildCards([], [], { ...COUNTS0, interacaoLia: [], interacaoLiaPrev: [30] });
    const tmr = cards.find((c) => c.key === 'tempoMedioResposta');
    expect(tmr.displayValue).toBe('Sem dados');
    expect(tmr.rawValue).toBeNull();
    // sem esta guarda em computeTrend, isto apareceria como -100%
    expect(tmr.trend.percent).toBeNull();
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
    const cards = buildCards(current, [], COUNTS0, { kpis: NATIVE_CONFIG, targets: [], values: [] });
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
    const cards = buildCards([], [], COUNTS0, config);
    const nps = cards.find((c) => c.id === 'm1');
    expect(nps.rawValue).toBe(60);
    expect(nps.target).toBe(80);
    expect(nps.progressPercent).toBe(75);
  });

  it('oculta inativo/invisível', () => {
    const config = { kpis: [{ id: 'h', name: 'X', source: 'manual', metricKey: null, unit: 'count', status: 'inactive', isVisible: true, displayOrder: 0 }], targets: [], values: [] };
    expect(buildCards([], [], COUNTS0, config).length).toBe(0);
  });

  it('crm com metricKey inválido: não quebra (mostra 0) e avisa', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = {
      kpis: [{ id: 'x', name: 'KPI Bugado', source: 'crm', metricKey: 'inexistente', unit: 'count', status: 'active', isVisible: true, displayOrder: 0 }],
      targets: [], values: [],
    };
    const cards = buildCards([{ status: 'novo', final_sale_value: 0 }], [], COUNTS0, config);
    expect(cards[0].rawValue).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('buildOverview — shape completo', () => {
  it('monta o pacote alinhado ao contrato do front', () => {
    const overview = buildOverview({
      period: { startDate: '2026-06-01', endDate: '2026-06-30', label: 'Junho/2026' },
      // `final_sale_value` continua no lead de propósito: ele NÃO alimenta mais
      // nada. A fonte da venda (e da fonte do lead) é `vendas_assinadas`.
      currentLeads: [{ status: 'Proposta Assinada', final_sale_value: 500000, source: 'Zap' }],
      previousLeads: [],
      counts: { ...COUNTS0, imoveisAtivos: 12 },
      goals: [{ id: 'g1', name: 'VGV', realizadoDisplay: 'R$ 1', metaDisplay: 'R$ 2', percent: 50 }],
      commercialCurrent: { vgv: 1800000, vgc: 95000, qtd: 1, vendas: [{ valor: 1800000, fonte: 'Zap' }] },
      commercialPrevious: { vgv: 1200000, vgc: 60000, qtd: 1, vendas: [{ valor: 1200000, fonte: 'Zap' }] },
      previousLabel: 'Maio/2026',
    });
    expect(overview.period.label).toBe('Junho/2026');
    expect(overview.cards).toHaveLength(6);
    // 6 desde 17/09: visita agendada e realizada deixaram de somar num rótulo só.
    expect(overview.funnel.stages.map((s) => s.label)).toEqual([
      'Novos Leads', 'Em Atendimento', 'Visita Agendada', 'Visita Realizada', 'Proposta', 'Fechamento',
    ]);
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
      counts: COUNTS0,
      goals: [],
    });
    const vgv = overview.commercial.find((c) => c.key === 'vgv');
    expect(vgv.currentValue).toBe(0);
    expect(vgv.previousValue).toBe(0);
  });
});

// Helper local: um lead com status/fonte/valor configuráveis.
const lead = (over = {}) => ({
  status: 'Novos Leads', source: 'Site', final_sale_value: 0,
  created_at: '2026-06-01T10:00:00Z', first_response_at: null, ...over,
});

describe('nativeCardValues — novos metricKeys', () => {
  it('ticketMedio = valorVendas / vendas', () => {
    const native = nativeCardValues([lead()], [], { ...COUNTS0, vendasQtd: 2, vgv: 400000 });
    expect(native.ticketMedio.rawValue).toBe(200000);
  });

  // Sem venda no período o ticket não é R$ 0: não houve venda para tirar média.
  it('ticketMedio sem venda e "Sem dados", nao zero', () => {
    const native = nativeCardValues([lead()], [], { ...COUNTS0, vendasQtd: 0, vgv: 0 });
    expect(native.ticketMedio.rawValue).toBeNull();
    expect(native.ticketMedio.displayValue).toBe('Sem dados');
  });

  it('vendas e valorVendas saem da view, nao de leads.final_sale_value', () => {
    // O lead traz valor preenchido de propósito: ele NÃO pode entrar na conta.
    const native = nativeCardValues([lead({ final_sale_value: 999999 })], [], { ...COUNTS0, vendasQtd: 4, vgv: 800000 });
    expect(native.vendas.rawValue).toBe(4);
    expect(native.valorVendas.rawValue).toBe(800000);
  });

  it('valorVendas e vgv sao o mesmo numero, vindos da mesma fonte', () => {
    const native = nativeCardValues([lead()], [], { ...COUNTS0, vendasQtd: 4, vgv: 800000 });
    expect(native.valorVendas.rawValue).toBe(native.vgv.rawValue);
  });

  it('conversaoVisita = % de leads em Visita ou além', () => {
    const current = [lead({ status: 'Novos Leads' }), lead({ status: 'Visita Agendada' }), lead({ status: 'Proposta' }), lead({ status: 'Assinado' })];
    const native = nativeCardValues(current, [], COUNTS0);
    expect(native.conversaoVisita.rawValue).toBe(75); // 3 de 4 (Visita, Proposta, Fechamento)
  });

  it('vendasPorCorretor = vendas / tamanhoEquipe', () => {
    const native = nativeCardValues([lead()], [], { ...COUNTS0, vendasQtd: 3, vgv: 3, tamanhoEquipe: 2 });
    expect(native.vendasPorCorretor.rawValue).toBe(1.5);
  });

  it('vendasPorCorretor sem equipe e "Sem dados", nao zero', () => {
    const native = nativeCardValues([lead()], [], { ...COUNTS0, vendasQtd: 1, vgv: 1 });
    expect(native.vendasPorCorretor.rawValue).toBeNull();
  });

  it('captação, equipe, vgv e vgc vêm de counts', () => {
    const native = nativeCardValues([], [], { imoveisAtivos: 50, captacaoExclusiva: 7, captacaoSemExclusividade: 12, tamanhoEquipe: 9, vgv: 1000, vgc: 100, vgvPrev: 0, vgcPrev: 0 });
    expect(native.captacaoExclusiva.rawValue).toBe(7);
    expect(native.captacaoSemExclusividade.rawValue).toBe(12);
    expect(native.tamanhoEquipe.rawValue).toBe(9);
    expect(native.vgv.rawValue).toBe(1000);
    expect(native.vgc.rawValue).toBe(100);
  });
});

describe('buildCards — category e isFeatured', () => {
  it('propaga category/isFeatured do config para o card', () => {
    const config = {
      kpis: [{ id: 'k1', name: 'Total de Leads', categoryId: 'marketing', source: 'crm', metricKey: 'totalLeads', unit: 'count', status: 'active', isVisible: true, isFeatured: true, displayOrder: 0 }],
      targets: [], values: [],
    };
    const cards = buildCards([lead()], [], COUNTS0, config);
    expect(cards[0].category).toBe('marketing');
    expect(cards[0].isFeatured).toBe(true);
  });

  it('modo legado: category=geral, isFeatured=false, 6 cards', () => {
    const cards = buildCards([lead()], [], COUNTS0); // sem config → legado
    expect(cards.every((c) => c.category === 'geral')).toBe(true);
    expect(cards.every((c) => c.isFeatured === false)).toBe(true);
    expect(cards.length).toBe(6);
  });
});
