/**
 * 📊 Regras de cálculo dos KPIs — funções PURAS (sem Supabase, sem rede).
 *
 * Este módulo é a ÚNICA fonte de verdade das definições de negócio dos KPIs
 * (o que é uma "venda", como o funil é segmentado, como a variação é medida).
 * Sendo puro, é 100% testável isoladamente — os testes travam as regras.
 *
 * O shape retornado por `buildOverview` espelha o contrato `KpisOverview` do
 * front (src/features/kpis/types.ts). Mantê-los alinhados é o que permite ao
 * front trocar a fonte Supabase por este endpoint sem mudar a UI.
 *
 * Decisões de corretude (alinhadas à auditoria de KPIs):
 *  - "Venda" = lead com final_sale_value > 0 (definição única).
 *  - Funil com etapas MUTUAMENTE EXCLUSIVAS (cada lead em uma só etapa).
 *  - Variação % retorna null quando não há baseline (evita "+100%" enganoso).
 *  - Tempo de resposta ignora valores negativos (datas inconsistentes).
 */

const round1 = (n) => Math.round(n * 10) / 10;

/** Etapas canônicas do funil, do topo à base. A ordem é significativa. */
const FUNNEL_ORDER = [
  { label: 'Novos Leads', matches: (e) => e === '' || e.includes('novo') },
  { label: 'Em Atendimento', matches: (e) => e.includes('atendimento') || e.includes('interaç') || e.includes('interac') },
  { label: 'Visita', matches: (e) => e.includes('visita') },
  { label: 'Proposta', matches: (e) => e.includes('proposta') || e.includes('negocia') },
  { label: 'Fechamento', matches: (e) => e.includes('assinad') || e.includes('fecha') || e.includes('finaliz') },
];

/** Classifica um lead em EXATAMENTE uma etapa (da base ao topo; primeira que casa). */
export function classifyStage(stageRaw) {
  const stage = String(stageRaw || '').toLowerCase().trim();
  for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) {
    if (FUNNEL_ORDER[i].matches(stage)) return FUNNEL_ORDER[i].label;
  }
  return FUNNEL_ORDER[0].label;
}

/**
 * Estágio do funil de um lead. Na tabela `leads`, o estágio é a coluna
 * `status`. Centralizado aqui para a regra de funil não depender do nome da
 * coluna espalhado pelo código.
 */
export function leadStage(lead) {
  return lead.status;
}

/** Variação percentual. `null` quando não há baseline. `lowerIsBetter` inverte o "positivo". */
export function computeTrend(atual, anterior, lowerIsBetter = false) {
  if (!anterior || anterior === 0) {
    return { percent: null, positive: !lowerIsBetter };
  }
  const percent = round1(((atual - anterior) / anterior) * 100);
  const positive = lowerIsBetter ? percent <= 0 : percent >= 0;
  return { percent, positive };
}

/** Soma de vendas: quantidade e valor (final_sale_value > 0). */
export function countVendas(leads) {
  let qtd = 0;
  let valor = 0;
  for (const lead of leads) {
    const v = Number(lead.final_sale_value) || 0;
    if (v > 0) {
      qtd += 1;
      valor += v;
    }
  }
  return { qtd, valor };
}

/** Tempo médio de resposta (min) dos leads com primeira resposta válida (>= 0). */
export function avgResponseMinutes(leads) {
  let total = 0;
  let count = 0;
  for (const lead of leads) {
    if (!lead.created_at || !lead.first_response_at) continue;
    const created = new Date(lead.created_at).getTime();
    const responded = new Date(lead.first_response_at).getTime();
    if (!created || !responded || Number.isNaN(created) || Number.isNaN(responded)) continue;
    const diff = (responded - created) / 60000;
    if (diff < 0) continue;
    total += diff;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

/** Funil com etapas exclusivas + conversão etapa-a-etapa e geral. */
export function buildFunnel(leads) {
  const total = leads.length;
  const counts = new Map(FUNNEL_ORDER.map((s) => [s.label, 0]));
  for (const lead of leads) {
    const stage = classifyStage(leadStage(lead));
    counts.set(stage, (counts.get(stage) || 0) + 1);
  }

  const stages = FUNNEL_ORDER.map((s, idx) => {
    const count = counts.get(s.label) || 0;
    const prevCount = idx > 0 ? counts.get(FUNNEL_ORDER[idx - 1].label) || 0 : 0;
    return {
      label: s.label,
      count,
      percentOfTotal: total > 0 ? round1((count / total) * 100) : 0,
      conversionFromPrevious: idx > 0 && prevCount > 0 ? round1((count / prevCount) * 100) : null,
    };
  });

  const topo = stages[0] ? stages[0].count : 0;
  const base = stages.length ? stages[stages.length - 1].count : 0;
  return {
    stages,
    overallConversion: topo > 0 ? round1((base / topo) * 100) : 0,
  };
}

/**
 * Negócios fechados por fonte (apenas leads com venda). Canonicaliza a fonte
 * por casefold/trim para não dividir "Zap" e "zap " em duas fatias.
 */
export function buildSources(leads) {
  const vendaLeads = leads.filter((l) => (Number(l.final_sale_value) || 0) > 0);
  const byCanonical = new Map(); // canonical -> { fonte, quantidade, valor }
  for (const lead of vendaLeads) {
    const original = String(lead.source || 'Outros').trim() || 'Outros';
    const canonical = original.toLowerCase();
    const entry = byCanonical.get(canonical) || { fonte: original, quantidade: 0, valor: 0 };
    entry.quantidade += 1;
    entry.valor += Number(lead.final_sale_value) || 0;
    byCanonical.set(canonical, entry);
  }
  return Array.from(byCanonical.values()).sort((a, b) => b.valor - a.valor);
}

/** Distribuição de vendas por faixa de preço. */
export function buildPriceRanges(leads) {
  let ate500 = 0;
  let de500a1m = 0;
  let acima1m = 0;
  for (const lead of leads) {
    const v = Number(lead.final_sale_value) || 0;
    if (v <= 0) continue;
    if (v < 500000) ate500 += 1;
    else if (v < 1000000) de500a1m += 1;
    else acima1m += 1;
  }
  return [
    { faixa: 'Até R$ 500 mil', quantidade: ate500 },
    { faixa: 'R$ 500 mil – 1 mi', quantidade: de500a1m },
    { faixa: 'Acima de R$ 1 mi', quantidade: acima1m },
  ];
}

const BRL = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function formatMinutes(min) {
  if (!min || min <= 0) return 'Sem dados';
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Calcula os 6 valores nativos de KPI e os indexa por metricKey. */
function nativeCardValues(current, previous, imoveisAtivos) {
  const totalLeads = current.length, totalLeadsPrev = previous.length;
  const vendas = countVendas(current), vendasPrev = countVendas(previous);
  const respMin = avgResponseMinutes(current), respMinPrev = avgResponseMinutes(previous);
  const atendidos = current.filter((l) => !!l.first_response_at).length;
  const taxaAtend = totalLeads > 0 ? round1((atendidos / totalLeads) * 100) : 0;
  const atendidosPrev = previous.filter((l) => !!l.first_response_at).length;
  const taxaAtendPrev = totalLeadsPrev > 0 ? round1((atendidosPrev / totalLeadsPrev) * 100) : 0;
  return {
    totalLeads:        { rawValue: totalLeads, displayValue: totalLeads.toLocaleString('pt-BR'), trend: computeTrend(totalLeads, totalLeadsPrev) },
    vendas:            { rawValue: vendas.qtd, displayValue: vendas.qtd.toLocaleString('pt-BR'), trend: computeTrend(vendas.qtd, vendasPrev.qtd) },
    valorVendas:       { rawValue: vendas.valor, displayValue: BRL(vendas.valor), trend: computeTrend(vendas.valor, vendasPrev.valor) },
    imoveisAtivos:     { rawValue: imoveisAtivos, displayValue: Number(imoveisAtivos || 0).toLocaleString('pt-BR'), trend: null },
    tempoMedioResposta:{ rawValue: respMin, displayValue: formatMinutes(respMin), trend: computeTrend(respMin, respMinPrev, true) },
    taxaAtendimento:   { rawValue: taxaAtend, displayValue: `${taxaAtend.toFixed(1)}%`, trend: computeTrend(taxaAtend, taxaAtendPrev) },
  };
}

const LEGACY_LABELS = {
  totalLeads: 'Total de Leads', vendas: 'Vendas', valorVendas: 'Valor em Vendas',
  imoveisAtivos: 'Imóveis Ativos', tempoMedioResposta: 'Tempo Médio de Resposta', taxaAtendimento: 'Taxa de Atendimento',
};

function clampPercent(target, realized) {
  if (!target || target <= 0 || realized == null) return null;
  return Math.max(0, Math.min(100, round1((realized / target) * 100)));
}

function formatByUnit(value, unit) {
  if (unit === 'currency') return BRL(value);
  if (unit === 'percent') return `${Number(value).toFixed(1)}%`;
  return Number(value || 0).toLocaleString('pt-BR');
}

/**
 * Cards principais a partir dos leads do período atual e do anterior.
 * Quando `config` ({ kpis, targets, values }) é fornecida, usa o modo
 * configurável: `crm` resolve via metricKey; `manual`/`planilha` usam
 * kpi_values; aplica metas e visibilidade. Sem `config`, preserva o
 * comportamento legado 100% idêntico ao original.
 */
export function buildCards(current, previous, imoveisAtivos, config) {
  const native = nativeCardValues(current, previous, imoveisAtivos);

  // Modo legado (sem config ou lista de KPIs vazia): preserva 100% o comportamento atual.
  // Inclui `id`/`metricKey`/`target`/`progressPercent` para uniformidade de shape,
  // mantendo `key` para não quebrar consumidores legados.
  if (!config || !Array.isArray(config.kpis) || config.kpis.length === 0) {
    return Object.keys(LEGACY_LABELS).map((key, i) => ({
      key, id: key, metricKey: key, source: 'crm', unit: 'count',
      label: LEGACY_LABELS[key], displayOrder: i,
      ...native[key],
      target: null, progressPercent: null,
    }));
  }

  // Modo configurável.
  const targetByKpi = new Map((config.targets || []).map((t) => [t.kpiId, t.targetValue]));
  const valueByKpi = new Map((config.values || []).map((v) => [v.kpiId, v.value]));

  return config.kpis
    .filter((k) => k.status === 'active' && k.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((k) => {
      const target = targetByKpi.has(k.id) ? targetByKpi.get(k.id) : null;
      let rawValue, displayValue, trend;
      if (k.source === 'crm' && native[k.metricKey]) {
        ({ rawValue, displayValue, trend } = native[k.metricKey]);
      } else {
        // KPI 'crm' com metricKey que não resolve = configuração inválida. Não
        // quebramos (mostra 0), mas logamos para a má-configuração não ficar muda.
        if (k.source === 'crm') {
          console.warn(`[kpis] KPI '${k.name}' (id=${k.id}) é 'crm' mas metricKey '${k.metricKey}' não existe no catálogo nativo; exibindo 0.`);
        }
        rawValue = valueByKpi.has(k.id) ? valueByKpi.get(k.id) : 0;
        displayValue = formatByUnit(rawValue, k.unit);
        trend = null;
      }
      return {
        id: k.id, metricKey: k.metricKey, source: k.source, unit: k.unit, label: k.name,
        displayOrder: k.displayOrder, rawValue, displayValue,
        target, progressPercent: clampPercent(target, rawValue), trend,
      };
    });
}

/**
 * Comparação VGV/VGC: mês atual vs mês anterior, pronta para gráfico de barras.
 *
 * Cada métrica vira um objeto com os dois valores (anterior/atual), os rótulos
 * dos meses (para o eixo X) e a variação % (computeTrend). O front só desenha.
 *
 * @param {object} input
 * @param {{vgv:number, vgc:number}} input.current   totais do mês atual
 * @param {{vgv:number, vgc:number}} input.previous  totais do mês anterior
 * @param {string} input.currentLabel    rótulo do mês atual (ex.: 'Junho/2026')
 * @param {string} input.previousLabel   rótulo do mês anterior
 */
export function buildCommercialComparison({ current, previous, currentLabel, previousLabel }) {
  const safe = (v) => Number(v) || 0;
  const make = (key, label, prevVal, curVal) => ({
    key,
    label,
    previousLabel,
    currentLabel,
    previousValue: safe(prevVal),
    currentValue: safe(curVal),
    previousDisplay: BRL(safe(prevVal)),
    currentDisplay: BRL(safe(curVal)),
    trend: computeTrend(safe(curVal), safe(prevVal)),
  });

  return [
    make('vgv', 'VGV', previous?.vgv, current?.vgv),
    make('vgc', 'VGC', previous?.vgc, current?.vgc),
  ];
}

/**
 * Monta o pacote completo de KPIs (espelha KpisOverview do front).
 * Recebe dados já lidos do banco — mantém a pureza (testável sem rede).
 *
 * @param {object} input
 * @param {object} input.period            { startDate, endDate, label }
 * @param {Array}  input.currentLeads      leads do período
 * @param {Array}  input.previousLeads     leads do período anterior (comparação)
 * @param {number} input.imoveisAtivos     contagem agregada no banco
 * @param {Array}  input.goals             metas já formatadas (id,name,realizadoDisplay,metaDisplay,percent)
 * @param {object} input.commercialCurrent   { vgv, vgc } do mês atual
 * @param {object} input.commercialPrevious  { vgv, vgc } do mês anterior
 * @param {string} input.previousLabel       rótulo do mês anterior
 */
export function buildOverview({
  period,
  currentLeads,
  previousLeads,
  imoveisAtivos,
  goals,
  commercialCurrent,
  commercialPrevious,
  previousLabel,
  config, // opcional — quando presente, ativa modo configurável nos cards
}) {
  return {
    period,
    cards: buildCards(currentLeads, previousLeads, imoveisAtivos, config),
    funnel: buildFunnel(currentLeads),
    sources: buildSources(currentLeads),
    priceRanges: buildPriceRanges(currentLeads),
    goals: Array.isArray(goals) ? goals : [],
    commercial: buildCommercialComparison({
      current: commercialCurrent || { vgv: 0, vgc: 0 },
      previous: commercialPrevious || { vgv: 0, vgc: 0 },
      currentLabel: period.label,
      previousLabel: previousLabel || '',
    }),
  };
}
