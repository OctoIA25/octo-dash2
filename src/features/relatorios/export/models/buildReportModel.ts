/**
 * Builders puros: convertem os dados já calculados da página (`ReportSource`)
 * num `ReportModel` consumido por UI/PDF/Excel.
 *
 * Cada sub-área tem seu builder; `buildReportModel` despacha pela sub-área ativa.
 * Gráficos chegam como `ChartInput` e viram `ChartSection` (id/título/grupo +
 * dados). Adicionar uma seção = adicionar um descritor no builder.
 */

import type { ReportModel, ReportSection, ChartSection } from '../types';
import type {
  ReportSource,
  RelatoriosSubArea,
  ChartInput,
  MarketingSource,
  MetricasSource,
  MetricasIndividuaisSource,
  ImoveisSource,
  FinanceiroSource,
} from './source';
import { formatCurrency, formatNumber, formatPercent, formatRoi } from './format';

type Base = Pick<ReportModel, 'subtitle' | 'meta'>;

function chart(id: string, title: string, group: string, input: ChartInput): ChartSection {
  return { id, title, group, kind: 'chart', ...input };
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketing
// ─────────────────────────────────────────────────────────────────────────────

function buildMarketing(src: MarketingSource, base: Base): ReportModel {
  const k = src.kpis;
  const c = src.charts;
  return {
    title: 'Relatório de Marketing',
    ...base,
    groups: [
      { id: 'visao-geral', title: 'Visão geral' },
      { id: 'graficos', title: 'Gráficos' },
      { id: 'detalhamento', title: 'Detalhamento' },
    ],
    sections: [
      {
        id: 'mkt-kpis',
        title: 'Indicadores gerais',
        group: 'visao-geral',
        kind: 'metrics',
        items: [
          { label: 'Leads recebidos', value: formatNumber(k.totalLeadsRecebidos) },
          { label: 'Leads interagidos', value: formatNumber(k.totalLeadsInteragidos) },
          { label: 'Média interação/dia', value: `${k.mediaInteracaoDia}%` },
          { label: 'Tempo 1ª interação', value: `${k.mediaTempoPrimeiraInteracao} min` },
          { label: 'Leads convertidos', value: formatNumber(k.totalLeadsConvertidos) },
        ],
      },
      chart('mkt-canal', 'Clientes recebidos por Canal', 'graficos', c.canal),
      chart('mkt-origem', 'Clientes recebidos por Origem', 'graficos', c.origem),
      chart('mkt-origem-total', 'Leads por Origem — Total', 'graficos', c.origemTotal),
      chart('mkt-conv-origem', 'Leads convertidos por Origem', 'graficos', c.convOrigem),
      chart('mkt-conv-canal', 'Leads convertidos por Canal', 'graficos', c.convCanal),
      chart('mkt-motivos', 'Motivo de arquivamento', 'detalhamento', c.motivos),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas da equipe
// ─────────────────────────────────────────────────────────────────────────────

function buildMetricas(src: MetricasSource, base: Base): ReportModel {
  const k = src.kpis;
  const c = src.charts;
  const sections: ReportSection[] = [];

  if (src.subArea === 'visao-geral') {
    sections.push(
      {
        id: 'met-kpis',
        title: 'Indicadores da equipe',
        group: 'visao-geral',
        kind: 'metrics',
        items: [
          { label: 'Vendas criadas', value: formatNumber(k.vendasCriadas) },
          { label: 'Vendas assinadas', value: formatNumber(k.vendasAssinadas) },
          { label: 'Imóveis ativos', value: formatNumber(k.imoveisAtivos) },
          { label: 'Leads no mês', value: formatNumber(k.totalLeadsMensal) },
          { label: 'Valor total', value: k.valorTotalFormatado },
        ],
      },
      chart('met-leads-equipe', 'Leads por Equipe', 'equipes', c.leadsEquipe),
      chart('met-tempo-equipe', 'Tempo Médio de Resposta por Equipe', 'equipes', c.tempoEquipe),
      chart('met-conv-equipe', 'Taxa de Conversão por Equipe', 'equipes', c.convEquipe),
      chart('met-leads-usuario', 'Leads interagidos por Usuário', 'usuarios', c.leadsUsuario),
      chart('met-tempo-usuario', 'Tempo de primeira interação por Usuário', 'usuarios', c.tempoUsuario),
      chart('met-atividades-usuario', 'Atividades em aberto por Usuário', 'usuarios', c.atividadesUsuario),
      chart('met-conv-usuario', 'Leads convertidos por Usuário', 'usuarios', c.convUsuario),
    );
  } else {
    sections.push({
      id: 'met-ranking',
      title: 'Ranking da equipe',
      group: 'ranking',
      kind: 'table',
      columns: ['#', 'Corretor', 'Comissão', 'Vendas', 'Gestão ativa'],
      rows: src.ranking.map((r) => [
        r.ranking,
        r.corretor,
        formatCurrency(r.valorComissao),
        formatNumber(r.vendasFeitas),
        formatNumber(r.gestaoAtiva),
      ]),
    });
  }

  return {
    title: 'Relatório de Métricas da Equipe',
    ...base,
    groups: [
      { id: 'visao-geral', title: 'Visão geral' },
      { id: 'equipes', title: 'Por equipe' },
      { id: 'usuarios', title: 'Por usuário' },
      { id: 'ranking', title: 'Ranking' },
    ],
    sections,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas individuais
// ─────────────────────────────────────────────────────────────────────────────

function buildMetricasIndividuais(src: MetricasIndividuaisSource, base: Base): ReportModel {
  const sections: ReportSection[] = [];

  if (src.subArea === 'comissao-metas') {
    const m = src.comissaoMetas;
    sections.push({
      id: 'mi-comissao-kpis',
      title: 'Comissão e metas',
      group: 'comissao-metas',
      kind: 'metrics',
      items: [
        { label: 'Comissão recebida', value: formatCurrency(m.comissaoRecebida) },
        { label: 'Meta anual', value: formatCurrency(m.metaAnual) },
        { label: 'Falta para a meta', value: formatCurrency(m.faltaParaMeta) },
        { label: 'Atingido', value: formatPercent(m.percentual) },
        { label: 'Exclusivos', value: `${formatNumber(m.exclusivos)} / ${formatNumber(m.metaExclusivo)}` },
        { label: 'Fichas', value: `${formatNumber(m.ficha)} / ${formatNumber(m.metaFicha)}` },
      ],
    });
  } else if (src.subArea === 'leads') {
    const L = src.leads;
    const c = src.charts;
    sections.push(
      {
        id: 'mi-leads-kpis',
        title: 'Indicadores de leads',
        group: 'leads',
        kind: 'metrics',
        items: [
          { label: 'Total de leads', value: formatNumber(L.totalLeads) },
          { label: 'Leads recebidos', value: formatNumber(L.leadsRecebidos) },
          { label: 'Visitas', value: formatNumber(L.visitas) },
          { label: 'Vendas realizadas', value: formatNumber(L.vendasRealizadas) },
        ],
      },
      chart('mi-leads-bairro', 'Leads por Bairro', 'leads', c.leadsBairro),
      chart('mi-leads-fonte', 'Leads por Fonte', 'leads', c.leadsFonte),
      chart('mi-leads-imovel', 'Leads por Imóvel', 'leads', c.leadsImovel),
    );
  } else {
    const V = src.vendas;
    const c = src.charts;
    sections.push(
      {
        id: 'mi-vendas-kpis',
        title: 'Indicadores de vendas',
        group: 'vendas',
        kind: 'metrics',
        items: [
          { label: 'Vendas (total)', value: formatNumber(V.vendasTotal) },
          { label: 'Exclusivas', value: formatNumber(V.vendasExclusivas) },
          { label: 'Não exclusivas', value: formatNumber(V.vendasNaoExclusivas) },
          { label: 'VGV total', value: formatCurrency(V.vgvTotal) },
          { label: 'Comissão total', value: formatCurrency(V.comissaoTotal) },
          { label: 'Ticket médio', value: formatCurrency(V.ticketMedio) },
        ],
      },
      chart('mi-vendas-fonte', 'Vendas por Fonte', 'vendas', c.vendasFonte),
      {
        id: 'mi-vendas-tabela',
        title: 'Vendas realizadas',
        group: 'vendas',
        kind: 'table',
        columns: ['Imóvel', 'Exclusividade', 'Fonte', 'Valor', 'Comissão', 'Data'],
        rows: V.rows.map((r) => [
          r.codigo_imovel,
          r.exclusividade,
          r.fonte,
          formatCurrency(r.valor_imovel),
          formatCurrency(r.comissao),
          r.data,
        ]),
      },
    );
  }

  return {
    title: `Relatório Individual — ${src.corretor}`,
    ...base,
    groups: [
      { id: 'comissao-metas', title: 'Comissão e metas' },
      { id: 'leads', title: 'Leads' },
      { id: 'vendas', title: 'Vendas' },
    ],
    sections,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Imóveis
// ─────────────────────────────────────────────────────────────────────────────

function buildImoveis(src: ImoveisSource, base: Base): ReportModel {
  const f = src.financeiro;
  const c = src.charts;
  const sections: ReportSection[] = [
    {
      id: 'imv-kpis',
      title: 'Indicadores comerciais',
      group: 'visao-geral',
      kind: 'metrics',
      items: [
        { label: 'VGV total', value: formatCurrency(f?.vgvTotal ?? 0) },
        { label: 'VGC total', value: formatCurrency(f?.vgcTotal ?? 0) },
        { label: 'Vendas', value: formatNumber(f?.vendasTotal ?? 0) },
        { label: 'Ticket médio', value: formatCurrency(f?.ticketMedio ?? 0) },
      ],
    },
    chart('imv-vgv', 'VGV — Valor Geral de Vendas (Mensal)', 'graficos', c.vgv),
    chart('imv-vgc', 'VGC — Valor Geral de Comissionamento (Mensal)', 'graficos', c.vgc),
    chart('imv-bairros', 'Bairros de Maior Interesse de Venda', 'graficos', c.bairros),
    chart('imv-faixa', 'Vendas por Faixa de Valor', 'graficos', c.faixa),
    chart('imv-exclusivo', 'Distribuição Exclusivo/Ficha', 'graficos', c.exclusivo),
  ];

  if (f && f.monthly.length > 0) {
    sections.push({
      id: 'imv-mensal',
      title: 'Evolução mensal',
      group: 'detalhamento',
      kind: 'table',
      columns: ['Mês', 'VGV', 'VGC', 'Vendas'],
      rows: f.monthly.map((m) => [m.mes, formatCurrency(m.vgv ?? 0), formatCurrency(m.vgc ?? 0), formatNumber(m.vendas ?? 0)]),
    });
  }

  return {
    title: 'Relatório de Imóveis',
    ...base,
    groups: [
      { id: 'visao-geral', title: 'Visão geral' },
      { id: 'graficos', title: 'Gráficos' },
      { id: 'detalhamento', title: 'Detalhamento' },
    ],
    sections,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Financeiro
// ─────────────────────────────────────────────────────────────────────────────

function buildFinanceiro(src: FinanceiroSource, base: Base): ReportModel {
  const { rows, totais } = src.resumo;
  return {
    title: 'Relatório Financeiro',
    ...base,
    groups: [
      { id: 'visao-geral', title: 'Visão geral' },
      { id: 'detalhamento', title: 'Detalhamento por origem' },
    ],
    sections: [
      {
        id: 'fin-kpis',
        title: 'Resumo financeiro',
        group: 'visao-geral',
        kind: 'metrics',
        items: [
          { label: 'Investimento', value: formatCurrency(totais.investimento) },
          { label: 'Receita', value: formatCurrency(totais.receita) },
          { label: 'Leads', value: formatNumber(totais.leadsTotal) },
          { label: 'Convertidos', value: formatNumber(totais.convertidos) },
          { label: 'CPL médio', value: totais.cplMedio === null ? '—' : formatCurrency(totais.cplMedio) },
          { label: 'ROI', value: formatRoi(totais.roi) },
        ],
      },
      {
        id: 'fin-origens',
        title: 'Investimento por origem',
        group: 'detalhamento',
        kind: 'table',
        columns: ['Origem', 'Leads', 'Convertidos', 'Investimento', 'Receita', 'CPL', 'CAC', 'ROI'],
        rows: rows.map((r) => [
          r.origem,
          formatNumber(r.leads),
          formatNumber(r.convertidos),
          formatCurrency(r.investimento),
          formatCurrency(r.receita),
          r.cpl === null ? '—' : formatCurrency(r.cpl),
          r.cac === null ? '—' : formatCurrency(r.cac),
          formatRoi(r.roi),
        ]),
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

function emptyModel(base: Base): ReportModel {
  return { title: 'Relatório', ...base, groups: [], sections: [] };
}

// Aceita tambem 'excel' (aba de importacao) e 'enps' (secao eNPS, com painel
// proprio): ambas sem relatorio exportavel aqui, caem no `default` -> emptyModel.
// As demais sub-areas tem builder dedicado.
export function buildReportModel(subArea: RelatoriosSubArea | 'excel' | 'enps', source: ReportSource): ReportModel {
  const base: Base = { subtitle: source.subtitle, meta: source.meta ?? [] };
  switch (subArea) {
    case 'marketing':
      return source.marketing ? buildMarketing(source.marketing, base) : emptyModel(base);
    case 'metricas':
      return source.metricas ? buildMetricas(source.metricas, base) : emptyModel(base);
    case 'metricas-individuais':
      return source.metricasIndividuais ? buildMetricasIndividuais(source.metricasIndividuais, base) : emptyModel(base);
    case 'imoveis':
      return source.imoveis ? buildImoveis(source.imoveis, base) : emptyModel(base);
    case 'financeiro':
      return source.financeiro ? buildFinanceiro(source.financeiro, base) : emptyModel(base);
    default:
      return emptyModel(base);
  }
}
