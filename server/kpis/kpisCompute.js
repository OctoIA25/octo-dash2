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
  // Agendada e realizada são etapas distintas desde 17/09: somar as duas sob
  // um rótulo só era a origem do "Visitas 0 numa tela e 7 em outra". A ordem
  // importa — o loop percorre de baixo para cima, então 'Visita Realizada'
  // precisa vir depois para ser testada primeiro.
  { label: 'Visita Agendada', matches: (e) => e.includes('visita') },
  { label: 'Visita Realizada', matches: (e) => e.includes('visita') && e.includes('realiz') },
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
  // `atual` nulo é "não dá para medir", não é queda: sem esta guarda, uma
  // métrica que fica sem amostra no período apareceria como -100%.
  if (atual == null) {
    return { percent: null, positive: !lowerIsBetter };
  }
  if (!anterior || anterior === 0) {
    return { percent: null, positive: !lowerIsBetter };
  }
  const percent = round1(((atual - anterior) / anterior) * 100);
  const positive = lowerIsBetter ? percent <= 0 : percent >= 0;
  return { percent, positive };
}

/** Soma de vendas: quantidade e valor (final_sale_value > 0). */
/**
 * Vendas do período: quantidade e valor.
 *
 * Sai de `vendas_assinadas` (proposta em `proposta-assinada`), a mesma fonte do
 * card VGV. Antes somava `leads.final_sale_value`, e essa coluna está VAZIA em
 * produção: na Lotus são 0 preenchidas em 1.685 leads, enquanto a imobiliária
 * tem 36 propostas assinadas somando R$ 14,4 milhões. O resultado era a aba
 * KPIs mostrando "Vendas: 0" e "Valor em Vendas: R$ 0" ao lado de um card de
 * VGV com milhões — dois números da mesma coisa se contradizendo na mesma tela.
 *
 * `null` quando a leitura falhou, para virar "Sem dados" em vez de zero.
 */
export function vendasDoPeriodo(comercial) {
  if (!comercial || comercial.qtd == null) return { qtd: null, valor: null };
  return { qtd: Number(comercial.qtd) || 0, valor: Number(comercial.vgv) || 0 };
}

/**
 * Mediana dos minutos até a primeira interação.
 *
 * MEDIANA, não média. Nos mesmos dados da Lotus a média dá 2.432 min e a
 * mediana dá 1,4 min: a média é dominada por uma cauda de leads recontatados
 * semanas depois, e era ela que fazia o card anunciar 12,9 dias de "tempo de
 * resposta". O plano do CEO também pede mediana.
 *
 * Devolve `null` quando não há amostra. `null` é "não dá para medir" e desce
 * como "Sem dados"; `0` seria "medimos e deu zero", que é outra afirmação.
 */
export function medianMinutes(minutos) {
  const v = (minutos || [])
    // O descarte vem ANTES do Number() de propósito: `Number(null)` é 0, e um
    // nulo virando zero afirmaria que a LIA respondeu instantaneamente. Vale
    // para '' , false e [] também. String entra porque o PostgREST devolve
    // coluna `numeric` como texto.
    .filter((n) => typeof n === 'number' || (typeof n === 'string' && n.trim() !== ''))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  if (v.length === 0) return null;

  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 0 ? (v[meio - 1] + v[meio]) / 2 : v[meio];
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
/**
 * Negócios fechados por fonte do lead.
 *
 * Recebe as VENDAS do período (de `vendas_assinadas`), não os leads. Antes
 * filtrava `leads.final_sale_value > 0`, e essa coluna está vazia em produção:
 * o bloco aparecia vazio na aba KPIs enquanto a imobiliária tinha 36 vendas.
 */
export function buildSources(vendas) {
  const byCanonical = new Map(); // canonical -> { fonte, quantidade, valor }
  for (const venda of vendas || []) {
    const original = String(venda.fonte || 'Outros').trim() || 'Outros';
    const canonical = original.toLowerCase();
    const entry = byCanonical.get(canonical) || { fonte: original, quantidade: 0, valor: 0 };
    entry.quantidade += 1;
    entry.valor += Number(venda.valor) || 0;
    byCanonical.set(canonical, entry);
  }
  return Array.from(byCanonical.values()).sort((a, b) => b.valor - a.valor);
}

/** Distribuição de vendas por faixa de preço. */
/** Faixas de preço das VENDAS do período. Mesma troca de fonte de buildSources. */
export function buildPriceRanges(vendas) {
  let ate500 = 0;
  let de500a1m = 0;
  let acima1m = 0;
  for (const venda of vendas || []) {
    const v = Number(venda.valor) || 0;
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

/**
 * "Sem dados" é o que o plano pede no lugar de número errado. Os três
 * formatadores abaixo tratam `null` como ausência de medição e `0` como
 * medição de zero — são afirmações diferentes, e trocar uma pela outra foi o
 * que manteve contadores zerados passando por corretos durante meses.
 */
const SEM_DADOS = 'Sem dados';

const BRL = (value) =>
  value == null
    ? SEM_DADOS
    : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const contagem = (value) =>
  value == null ? SEM_DADOS : Number(value).toLocaleString('pt-BR');

const percentual = (value) =>
  value == null ? SEM_DADOS : `${Number(value).toFixed(1)}%`;

function formatMinutes(min) {
  if (min == null || !Number.isFinite(min) || min < 0) return SEM_DADOS;
  if (min < 1) return 'menos de 1min';
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Conta leads que chegaram à visita ou além (agendada, realizada, proposta, fechamento). */
function countVisitaOuAlem(leads) {
  const ALEM = new Set(['Visita Agendada', 'Visita Realizada', 'Proposta', 'Fechamento']);
  let n = 0;
  for (const lead of leads) {
    if (ALEM.has(classifyStage(leadStage(lead)))) n += 1;
  }
  return n;
}

/** Calcula os valores nativos de KPI e os indexa por metricKey. */
// `export` para permitir teste direto (antes era interna).
export function nativeCardValues(current, previous, counts) {
  const c = counts || {};
  const totalLeads = current.length, totalLeadsPrev = previous.length;
  // Vendas saem da mesma fonte do VGV. Ver a nota em `vendasDoPeriodo`: a
  // coluna `leads.final_sale_value` que alimentava estes dois cards está vazia
  // em produção, e a Lotus exibia "Vendas: 0" com 36 propostas assinadas.
  const vendas = vendasDoPeriodo({ qtd: c.vendasQtd, vgv: c.vgv });
  const vendasPrev = vendasDoPeriodo({ qtd: c.vendasQtdPrev, vgv: c.vgvPrev });
  // Tempo até a primeira interação, dos dois lados, vindo das views.
  // Antes as três linhas abaixo saíam de `first_response_at`, que marca a saída
  // do card da primeira coluna do kanban (leadsService.ts:602) e não ter falado
  // com ninguém. Na Lotus isso dava 41 leads de 1.684, média de 12,9 dias, com
  // um valor negativo e outro de 203 dias — e a taxa de atendimento, que usa a
  // mesma coluna, media "% de cards arrastados", não "% de leads atendidos".
  const amostraLia = Array.isArray(c.interacaoLia) ? c.interacaoLia : null;
  const amostraLiaPrev = Array.isArray(c.interacaoLiaPrev) ? c.interacaoLiaPrev : null;

  const respMin = medianMinutes(amostraLia), respMinPrev = medianMinutes(amostraLiaPrev);
  const corretorMin = medianMinutes(c.interacaoCorretor);
  const corretorMinPrev = medianMinutes(c.interacaoCorretorPrev);

  // Atendido = a LIA falou com o lead. `null` (leitura falhou) vira "Sem dados"
  // em vez de 0%, que seria afirmar que ninguém foi atendido.
  const atendidos = amostraLia ? amostraLia.length : null;
  const taxaAtend = amostraLia && totalLeads > 0 ? round1((atendidos / totalLeads) * 100) : null;
  const atendidosPrev = amostraLiaPrev ? amostraLiaPrev.length : null;
  const taxaAtendPrev = amostraLiaPrev && totalLeadsPrev > 0 ? round1((atendidosPrev / totalLeadsPrev) * 100) : null;

  // Sem venda no período o ticket não é R$ 0, é indefinido — não houve venda
  // para tirar média de. Mesma distinção do resto desta função.
  const ticket = vendas.qtd ? vendas.valor / vendas.qtd : null;
  const ticketPrev = vendasPrev.qtd ? vendasPrev.valor / vendasPrev.qtd : null;

  const visitas = countVisitaOuAlem(current);
  const convVisita = totalLeads > 0 ? round1((visitas / totalLeads) * 100) : null;
  const visitasPrev = countVisitaOuAlem(previous);
  const convVisitaPrev = totalLeadsPrev > 0 ? round1((visitasPrev / totalLeadsPrev) * 100) : null;

  // `null` aqui é leitura falhada; `0` é imobiliária sem ninguém cadastrado.
  const equipe = c.tamanhoEquipe == null ? null : Number(c.tamanhoEquipe);
  const vendasPorCorretor =
    equipe && vendas.qtd != null ? round1(vendas.qtd / equipe) : null;

  return {
    totalLeads:        { rawValue: totalLeads, displayValue: contagem(totalLeads), trend: computeTrend(totalLeads, totalLeadsPrev) },
    vendas:            { rawValue: vendas.qtd, displayValue: contagem(vendas.qtd), trend: computeTrend(vendas.qtd, vendasPrev.qtd) },
    valorVendas:       { rawValue: vendas.valor, displayValue: BRL(vendas.valor), trend: computeTrend(vendas.valor, vendasPrev.valor) },
    imoveisAtivos:     { rawValue: c.imoveisAtivos ?? null, displayValue: contagem(c.imoveisAtivos ?? null), trend: null },
    tempoMedioResposta:{ rawValue: respMin, displayValue: formatMinutes(respMin), trend: computeTrend(respMin, respMinPrev, true) },
    tempoAteCorretor:  { rawValue: corretorMin, displayValue: formatMinutes(corretorMin), trend: computeTrend(corretorMin, corretorMinPrev, true) },
    taxaAtendimento:   { rawValue: taxaAtend, displayValue: percentual(taxaAtend), trend: computeTrend(taxaAtend, taxaAtendPrev) },
    // --- novos ---
    vgv:               { rawValue: c.vgv ?? null, displayValue: BRL(c.vgv ?? null), trend: computeTrend(c.vgv ?? null, c.vgvPrev ?? null) },
    vgc:               { rawValue: c.vgc ?? null, displayValue: BRL(c.vgc ?? null), trend: computeTrend(c.vgc ?? null, c.vgcPrev ?? null) },
    ticketMedio:       { rawValue: ticket, displayValue: BRL(ticket), trend: computeTrend(ticket, ticketPrev) },
    conversaoVisita:   { rawValue: convVisita, displayValue: percentual(convVisita), trend: computeTrend(convVisita, convVisitaPrev) },
    captacaoExclusiva: { rawValue: c.captacaoExclusiva ?? null, displayValue: contagem(c.captacaoExclusiva ?? null), trend: null },
    captacaoSemExclusividade: { rawValue: c.captacaoSemExclusividade ?? null, displayValue: contagem(c.captacaoSemExclusividade ?? null), trend: null },
    tamanhoEquipe:     { rawValue: equipe, displayValue: contagem(equipe), trend: null },
    // trend: null — não buscamos o tamanho da equipe do mês anterior, então não
    // há baseline confiável para vendas/corretor (computeTrend(x,0) seria sempre
    // null e enganoso). Consistente com as demais métricas só-contagem acima.
    vendasPorCorretor: { rawValue: vendasPorCorretor, displayValue: vendasPorCorretor == null ? SEM_DADOS : vendasPorCorretor.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), trend: null },
  };
}

// Os 6 cards do modo sem configuração. Métrica nova NÃO entra aqui: `vgv`,
// `ticketMedio` e `conversaoVisita` existem em nativeCardValues e são ligadas
// por linha em `dashboard_kpis`. Mexer neste mapa muda o que um tenant sem
// configuração nenhuma enxerga — `tempoAteCorretor` segue a mesma rota das
// outras, pela seed.
const LEGACY_LABELS = {
  totalLeads: 'Total de Leads', vendas: 'Vendas', valorVendas: 'Valor em Vendas',
  imoveisAtivos: 'Imóveis Ativos', tempoMedioResposta: 'Tempo até a LIA responder',
  taxaAtendimento: 'Taxa de Atendimento',
};

function clampPercent(target, realized) {
  if (!target || target <= 0 || realized == null) return null;
  return Math.max(0, Math.min(100, round1((realized / target) * 100)));
}

function formatByUnit(value, unit) {
  if (unit === 'currency') return BRL(value);
  if (unit === 'percent') return percentual(value);
  return contagem(value);
}

/**
 * Cards principais a partir dos leads do período atual e do anterior.
 * Quando `config` ({ kpis, targets, values }) é fornecida, usa o modo
 * configurável: `crm` resolve via metricKey; `manual`/`planilha` usam
 * kpi_values; aplica metas e visibilidade. Sem `config`, preserva o
 * comportamento legado 100% idêntico ao original.
 */
export function buildCards(current, previous, counts, config) {
  const native = nativeCardValues(current, previous, counts);

  if (!config || !Array.isArray(config.kpis) || config.kpis.length === 0) {
    return Object.keys(LEGACY_LABELS).map((key, i) => ({
      key, id: key, metricKey: key, source: 'crm', unit: 'count',
      // Vazio: no modo legado não há linha em `dashboard_kpis` onde o gestor
      // pudesse ter escrito descrição. A tela cai no dicionário pela metricKey.
      description: '',
      label: LEGACY_LABELS[key], displayOrder: i,
      category: 'geral', isFeatured: false,
      ...native[key],
      target: null, progressPercent: null,
    }));
  }

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
        if (k.source === 'crm') {
          console.warn(`[kpis] KPI '${k.name}' (id=${k.id}) é 'crm' mas metricKey '${k.metricKey}' não existe no catálogo nativo; exibindo 0.`);
        }
        rawValue = valueByKpi.has(k.id) ? valueByKpi.get(k.id) : 0;
        displayValue = formatByUnit(rawValue, k.unit);
        trend = null;
      }
      return {
        id: k.id, metricKey: k.metricKey, source: k.source, unit: k.unit, label: k.name,
        description: k.description || '',
        displayOrder: k.displayOrder, category: k.categoryId || 'geral', isFeatured: !!k.isFeatured,
        rawValue, displayValue,
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
 * @param {object} input.counts            contagens agregadas: { imoveisAtivos, captacaoExclusiva, captacaoSemExclusividade, tamanhoEquipe, vgv, vgc, vgvPrev, vgcPrev }
 * @param {Array}  input.goals             metas já formatadas (id,name,realizadoDisplay,metaDisplay,percent)
 * @param {object} input.commercialCurrent   { vgv, vgc } do mês atual
 * @param {object} input.commercialPrevious  { vgv, vgc } do mês anterior
 * @param {string} input.previousLabel       rótulo do mês anterior
 */
export function buildOverview({
  period,
  currentLeads,
  previousLeads,
  counts,            // { imoveisAtivos, captacaoExclusiva, captacaoSemExclusividade, tamanhoEquipe, vgv, vgc, vgvPrev, vgcPrev }
  goals,
  commercialCurrent,
  commercialPrevious,
  previousLabel,
  config,
  atualizadoEm,
}) {
  return {
    period,
    // Quando estes números foram calculados. Sem isso, um painel servido de
    // cache parece estar ao vivo — o plano pede "atualizado às hh:mm".
    // Recebido de fora em vez de `new Date()` aqui: esta função é pura e é o
    // que o snapshot de regressão trava.
    atualizadoEm: atualizadoEm || null,
    cards: buildCards(currentLeads, previousLeads, counts, config),
    funnel: buildFunnel(currentLeads),
    sources: buildSources(commercialCurrent && commercialCurrent.vendas),
    priceRanges: buildPriceRanges(commercialCurrent && commercialCurrent.vendas),
    goals: Array.isArray(goals) ? goals : [],
    commercial: buildCommercialComparison({
      current: commercialCurrent || { vgv: 0, vgc: 0 },
      previous: commercialPrevious || { vgv: 0, vgc: 0 },
      currentLabel: period.label,
      previousLabel: previousLabel || '',
    }),
  };
}
