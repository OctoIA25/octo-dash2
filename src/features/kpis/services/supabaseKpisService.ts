/**
 * Implementação Supabase do `KpisService`.
 *
 * ⚠️ FRONTEIRA DE INTEGRAÇÃO: este é o único arquivo que conhece o Supabase
 * e o formato das tabelas. A UI consome `KpisService` (contrato em types.ts).
 * Para migrar para um backend REST, crie `restKpisService.ts` que implemente
 * o mesmo contrato chamando `GET /api/v1/kpis` e troque o provider no hook —
 * nenhum componente muda.
 *
 * Decisões de CORRETUDE adotadas aqui (alinhadas à auditoria de KPIs):
 *  - Todas as queries filtram `tenant_id` E `archived_at IS NULL`.
 *  - "Venda" = lead com `final_sale_value > 0` (fonte única nesta aba),
 *    em vez do status 'Proposta Enviada'/'concluida' (que se anulavam).
 *  - Funil com etapas MUTUAMENTE EXCLUSIVAS pela coluna `status` canônica,
 *    sem contar o mesmo lead em duas etapas.
 *  - Limites de período convertidos para UTC num só lugar (period.ts).
 */

import { supabase } from '@/lib/supabaseClient';
import { fetchGoals } from '@/features/metas/services/goalsService';
import { buildGoalViews, selectActiveIndividualGoals } from '@/features/metas/domain/metrics';
import { formatGoalValue } from '@/features/metas/domain/format';
import { canonicalizeFonteCounts } from '@/data/realLeadsProcessor';
import { dayEndUtc, dayStartUtc, previousMonthPeriod } from '../period';
import { fetchKpis } from '@/features/kpis/admin/services/kpiAdminService';
import { fetchTargets, fetchValues } from '@/features/kpis/admin/services/kpiTargetsService';
import { resolveProgress } from '@/features/kpis/domain/kpiModel';
import { normalizePeriodStart } from '@/features/kpis/domain/periods';
import type {
  KpiCommercialComparison,
  KpiFunnel,
  KpiFunnelStage,
  KpiGoalProgress,
  KpiPeriod,
  KpiPriceRange,
  KpiSourceBreakdown,
  KpiSummaryCard,
  KpisOverview,
  KpisService,
  KpiTrend,
} from '../types';

interface LeadRow {
  // Na tabela `leads`, o estágio do funil é a coluna `status` (não há
  // `etapa_atual` — esse nome só existe no ProcessedLead normalizado).
  status: string | null;
  source: string | null;
  final_sale_value: number | null;
  created_at: string | null;
  first_response_at: string | null;
}

/** Etapas canônicas do funil, do topo à base. Ordem é significativa. */
const FUNNEL_ORDER: Array<{ label: string; matches: (etapa: string) => boolean }> = [
  { label: 'Novos Leads', matches: (e) => e === '' || e.includes('novo') },
  { label: 'Em Atendimento', matches: (e) => e.includes('atendimento') || e.includes('interaç') || e.includes('interac') },
  { label: 'Visita', matches: (e) => e.includes('visita') },
  { label: 'Proposta', matches: (e) => e.includes('proposta') || e.includes('negocia') },
  { label: 'Fechamento', matches: (e) => e.includes('assinad') || e.includes('fecha') || e.includes('finaliz') },
];

/** Classifica um lead em EXATAMENTE uma etapa (primeira que casa, da base ao topo). */
function classifyStage(etapaRaw: string | null): string {
  const etapa = (etapaRaw || '').toLowerCase().trim();
  // Percorre da base para o topo: um lead em "Fechamento" não deve cair em "Visita".
  for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) {
    if (FUNNEL_ORDER[i].matches(etapa)) return FUNNEL_ORDER[i].label;
  }
  return FUNNEL_ORDER[0].label; // fallback: topo do funil
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Variação percentual. `null` quando não há baseline (evita "+100%" enganoso). */
function computeTrend(atual: number, anterior: number, lowerIsBetter = false): KpiTrend {
  if (anterior === 0) {
    return { percent: null, positive: !lowerIsBetter };
  }
  const pct = round1(((atual - anterior) / anterior) * 100);
  const positive = lowerIsBetter ? pct <= 0 : pct >= 0;
  return { percent: pct, positive };
}

const BRL = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function formatMinutes(min: number): string {
  if (min <= 0) return 'Sem dados';
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Busca todos os leads do período (paginado para evitar o corte silencioso de
 * 1000 linhas do PostgREST). Sempre escopado por tenant e sem arquivados.
 */
async function fetchLeads(
  tenantId: string,
  period: KpiPeriod,
  agentId?: string | null,
): Promise<LeadRow[]> {
  const PAGE = 1000;
  const rows: LeadRow[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from('leads')
      .select('status,source,final_sale_value,created_at,first_response_at')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .gte('created_at', dayStartUtc(period.startDate))
      .lte('created_at', dayEndUtc(period.endDate))
      .range(from, from + PAGE - 1);

    // Escopo individual: fail-closed quando informado.
    if (agentId) {
      query = query.eq('assigned_agent_id', agentId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown as LeadRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

/** Tempo médio de resposta (min) dos leads com primeira resposta válida (>= 0). */
function avgResponseMinutes(leads: LeadRow[]): number {
  let total = 0;
  let count = 0;
  for (const lead of leads) {
    if (!lead.created_at || !lead.first_response_at) continue;
    const created = new Date(lead.created_at).getTime();
    const responded = new Date(lead.first_response_at).getTime();
    if (!created || !responded) continue;
    const diff = (responded - created) / 60_000;
    if (diff < 0) continue;
    total += diff;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function countVendas(leads: LeadRow[]): { qtd: number; valor: number } {
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

function buildFunnel(leads: LeadRow[]): KpiFunnel {
  const total = leads.length;
  const counts = new Map<string, number>(FUNNEL_ORDER.map((s) => [s.label, 0]));
  for (const lead of leads) {
    const stage = classifyStage(lead.status);
    counts.set(stage, (counts.get(stage) || 0) + 1);
  }

  const stages: KpiFunnelStage[] = FUNNEL_ORDER.map((s, idx) => {
    const count = counts.get(s.label) || 0;
    const prevCount = idx > 0 ? counts.get(FUNNEL_ORDER[idx - 1].label) || 0 : 0;
    return {
      label: s.label,
      count,
      percentOfTotal: total > 0 ? round1((count / total) * 100) : 0,
      conversionFromPrevious: idx > 0 && prevCount > 0 ? round1((count / prevCount) * 100) : null,
    };
  });

  const topo = stages[0]?.count || 0;
  const base = stages[stages.length - 1]?.count || 0;
  return {
    stages,
    overallConversion: topo > 0 ? round1((base / topo) * 100) : 0,
  };
}

function buildSources(leads: LeadRow[]): KpiSourceBreakdown[] {
  // Soma valor por fonte apenas dos leads com venda; conta também a quantidade.
  const vendaLeads = leads.filter((l) => (Number(l.final_sale_value) || 0) > 0);
  const fonteCounts = canonicalizeFonteCounts(vendaLeads.map((l) => l.source || 'Outros'));

  const valorPorFonte = new Map<string, number>();
  for (const lead of vendaLeads) {
    const fonte = lead.source || 'Outros';
    valorPorFonte.set(fonte, (valorPorFonte.get(fonte) || 0) + (Number(lead.final_sale_value) || 0));
  }

  return Array.from(fonteCounts.entries())
    .map(([fonte, quantidade]) => ({
      fonte,
      quantidade,
      valor: valorPorFonte.get(fonte) || 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

function buildPriceRanges(leads: LeadRow[]): KpiPriceRange[] {
  let ate500 = 0;
  let de500a1m = 0;
  let acima1m = 0;
  for (const lead of leads) {
    const v = Number(lead.final_sale_value) || 0;
    if (v <= 0) continue;
    if (v < 500_000) ate500 += 1;
    else if (v < 1_000_000) de500a1m += 1;
    else acima1m += 1;
  }
  return [
    { faixa: 'Até R$ 500 mil', quantidade: ate500 },
    { faixa: 'R$ 500 mil – 1 mi', quantidade: de500a1m },
    { faixa: 'Acima de R$ 1 mi', quantidade: acima1m },
  ];
}

async function countImoveisAtivos(tenantId: string): Promise<number> {
  const { count, error } = await supabase
    // `imoveis_locais` não está nos tipos gerados do Supabase (idem demais serviços).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('imoveis_locais' as any)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) return 0;
  return count ?? 0;
}

async function buildGoals(tenantId: string): Promise<KpiGoalProgress[]> {
  try {
    const goals = await fetchGoals(tenantId);
    const today = new Date().toISOString().split('T')[0];
    const views = buildGoalViews(goals, today);
    // Foca nas metas ativas (todas as escopos) com maior atingimento primeiro.
    const active = views.filter((v) => v.status !== 'inactive');
    void selectActiveIndividualGoals; // mantém a opção de filtrar por escopo no futuro
    return active
      .map((v) => ({
        id: v.goal.id,
        name: v.goal.name,
        realizadoDisplay: formatGoalValue(v.progress.currentValue, v.goal.unit),
        metaDisplay: formatGoalValue(v.progress.targetValue, v.goal.unit),
        percent: v.progress.percent,
      }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 6);
  } catch {
    return [];
  }
}

/** Formata um número conforme a unidade do KPI (mesma regra do servidor formatByUnit). */
function formatByUnit(value: number, unit: KpiSummaryCard['unit']): string {
  if (unit === 'currency') return BRL(value);
  if (unit === 'percent') return `${Number(value).toFixed(1)}%`;
  return Number(value || 0).toLocaleString('pt-BR');
}

/** Labels para os 6 KPIs nativos (no modo legado). */
const LEGACY_LABELS: Record<string, string> = {
  totalLeads: 'Total de Leads',
  vendas: 'Vendas',
  valorVendas: 'Valor em Vendas',
  imoveisAtivos: 'Imóveis Ativos',
  tempoMedioResposta: 'Tempo Médio de Resposta',
  taxaAtendimento: 'Taxa de Atendimento',
};

/**
 * Calcula os 6 valores nativos indexados por metricKey.
 * Espelha `nativeCardValues` de server/kpis/kpisCompute.js.
 */
function nativeCardValues(
  current: LeadRow[],
  previous: LeadRow[],
  imoveisAtivos: number,
): Record<string, { rawValue: number; displayValue: string; trend: KpiTrend | null }> {
  const totalLeads = current.length;
  const totalLeadsPrev = previous.length;

  const vendas = countVendas(current);
  const vendasPrev = countVendas(previous);

  const respMin = avgResponseMinutes(current);
  const respMinPrev = avgResponseMinutes(previous);

  const atendidos = current.filter((l) => !!l.first_response_at).length;
  const taxaAtend = totalLeads > 0 ? round1((atendidos / totalLeads) * 100) : 0;
  const atendidosPrev = previous.filter((l) => !!l.first_response_at).length;
  const taxaAtendPrev = totalLeadsPrev > 0 ? round1((atendidosPrev / totalLeadsPrev) * 100) : 0;

  return {
    totalLeads:         { rawValue: totalLeads, displayValue: totalLeads.toLocaleString('pt-BR'), trend: computeTrend(totalLeads, totalLeadsPrev) },
    vendas:             { rawValue: vendas.qtd, displayValue: vendas.qtd.toLocaleString('pt-BR'), trend: computeTrend(vendas.qtd, vendasPrev.qtd) },
    valorVendas:        { rawValue: vendas.valor, displayValue: BRL(vendas.valor), trend: computeTrend(vendas.valor, vendasPrev.valor) },
    imoveisAtivos:      { rawValue: imoveisAtivos, displayValue: Number(imoveisAtivos || 0).toLocaleString('pt-BR'), trend: null },
    tempoMedioResposta: { rawValue: respMin, displayValue: formatMinutes(respMin), trend: computeTrend(respMin, respMinPrev, /* lowerIsBetter */ true) },
    taxaAtendimento:    { rawValue: taxaAtend, displayValue: `${taxaAtend.toFixed(1)}%`, trend: computeTrend(taxaAtend, taxaAtendPrev) },
  };
}

interface KpiConfig {
  kpis: Array<{
    id: string;
    name: string;
    source: KpiSummaryCard['source'];
    unit: KpiSummaryCard['unit'];
    metricKey: string | null;
    status: string;
    isVisible: boolean;
    displayOrder: number;
  }>;
  targets: Array<{ kpiId: string; targetValue: number }>;
  values: Array<{ kpiId: string; value: number }>;
}

/**
 * Monta os cards de KPI.
 * - Sem config (ou lista de KPIs vazia): modo legado — 6 cards nativos.
 *   Garante dashboard preenchido durante a migração (tenant sem seed ainda).
 * - Com config: modo configurável — espelha buildCards de server/kpis/kpisCompute.js.
 *
 * Progresso: usa `resolveProgress` do domínio (mesma matemática de clampPercent
 * do servidor: max(0, min(100, round1(realized/target*100)))).
 */
function buildCards(
  current: LeadRow[],
  previous: LeadRow[],
  imoveisAtivos: number,
  config?: KpiConfig | null,
): KpiSummaryCard[] {
  const native = nativeCardValues(current, previous, imoveisAtivos);

  // Modo legado: sem config ou lista de KPIs vazia.
  if (!config || !Array.isArray(config.kpis) || config.kpis.length === 0) {
    return Object.keys(LEGACY_LABELS).map((key, i) => ({
      id: key,
      metricKey: key,
      source: 'crm' as const,
      unit: 'count' as const,
      label: LEGACY_LABELS[key],
      displayOrder: i,
      ...(native[key] ?? { rawValue: 0, displayValue: '0', trend: null }),
      target: null,
      progressPercent: null,
    }));
  }

  // Modo configurável.
  const targetByKpi = new Map(config.targets.map((t) => [t.kpiId, t.targetValue]));
  const valueByKpi = new Map(config.values.map((v) => [v.kpiId, v.value]));

  return config.kpis
    .filter((k) => k.status === 'active' && k.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((k): KpiSummaryCard => {
      const target = targetByKpi.has(k.id) ? targetByKpi.get(k.id)! : null;
      let rawValue: number;
      let displayValue: string;
      let kpiTrend: KpiTrend | null;

      if (k.source === 'crm' && k.metricKey && native[k.metricKey]) {
        const n = native[k.metricKey];
        rawValue = n.rawValue;
        displayValue = n.displayValue;
        kpiTrend = n.trend;
      } else {
        if (k.source === 'crm') {
          console.warn(`[kpis] KPI '${k.name}' (id=${k.id}) é 'crm' mas metricKey '${k.metricKey ?? ''}' não existe no catálogo nativo; exibindo 0.`);
        }
        rawValue = valueByKpi.has(k.id) ? valueByKpi.get(k.id)! : 0;
        displayValue = formatByUnit(rawValue, k.unit);
        kpiTrend = null;
      }

      const { percent } = resolveProgress(target, rawValue);
      return {
        id: k.id,
        metricKey: k.metricKey,
        source: k.source,
        unit: k.unit,
        label: k.name,
        displayOrder: k.displayOrder,
        rawValue,
        displayValue,
        target,
        progressPercent: target == null ? null : percent,
        trend: kpiTrend,
      };
    });
}

/** Soma VGV/VGC das vendas comerciais assinadas no período (commercial_sales). */
async function fetchCommercialTotals(
  tenantId: string,
  period: KpiPeriod,
): Promise<{ vgv: number; vgc: number }> {
  const PAGE = 1000;
  let vgv = 0;
  let vgc = 0;
  let page = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('commercial_sales' as never)
      .select('valor_vgv,valor_vgc')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .gte('data_assinatura', period.startDate)
      .lte('data_assinatura', period.endDate)
      .range(page * PAGE, (page + 1) * PAGE - 1);

    if (error) return { vgv: 0, vgc: 0 };
    const rows = (data ?? []) as Array<{ valor_vgv: number | string | null; valor_vgc: number | string | null }>;
    for (const row of rows) {
      vgv += Number(row.valor_vgv) || 0;
      vgc += Number(row.valor_vgc) || 0;
    }
    if (rows.length < PAGE) break;
    page += 1;
  }
  return { vgv, vgc };
}

function buildCommercial(
  current: { vgv: number; vgc: number },
  previous: { vgv: number; vgc: number },
  currentLabel: string,
  previousLabel: string,
): KpiCommercialComparison[] {
  const make = (key: 'vgv' | 'vgc', label: string, prevVal: number, curVal: number): KpiCommercialComparison => ({
    key,
    label,
    previousLabel,
    currentLabel,
    previousValue: prevVal,
    currentValue: curVal,
    previousDisplay: BRL(prevVal),
    currentDisplay: BRL(curVal),
    trend: computeTrend(curVal, prevVal),
  });
  return [
    make('vgv', 'VGV', previous.vgv, current.vgv),
    make('vgc', 'VGC', previous.vgc, current.vgc),
  ];
}

export const supabaseKpisService: KpisService = {
  async getOverview({ tenantId, period, agentId }) {
    const prevPeriod = previousMonthPeriod(period);
    // Chave de período para metas/realizado: 1º dia do mês que contém period.startDate.
    const periodStart = normalizePeriodStart(period.startDate, 'month');

    const [current, previous, imoveisAtivos, goals, commCurrent, commPrevious, kpis, targets, values] = await Promise.all([
      fetchLeads(tenantId, period, agentId),
      fetchLeads(tenantId, prevPeriod, agentId),
      countImoveisAtivos(tenantId),
      buildGoals(tenantId),
      fetchCommercialTotals(tenantId, period),
      fetchCommercialTotals(tenantId, prevPeriod),
      // fetchKpis LANÇA em erro; aqui um erro de config NÃO pode quebrar o
      // dashboard — degradamos para o modo legado (config vazia → 6 nativos).
      fetchKpis(tenantId).catch(() => []),
      fetchTargets(tenantId, 'month', periodStart),
      fetchValues(tenantId, 'month', periodStart),
    ]);

    // Passa config apenas quando há KPIs seedados; caso contrário cai no modo
    // legado dentro de buildCards (garante dashboard preenchido durante migração).
    const config: KpiConfig | null = kpis.length > 0 ? { kpis, targets, values } : null;

    const overview: KpisOverview = {
      period,
      cards: buildCards(current, previous, imoveisAtivos, config),
      funnel: buildFunnel(current),
      sources: buildSources(current),
      priceRanges: buildPriceRanges(current),
      goals,
      commercial: buildCommercial(commCurrent, commPrevious, period.label, prevPeriod.label),
    };
    return overview;
  },
};
