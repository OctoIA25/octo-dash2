import { supabase } from '@/lib/supabaseClient';
import {
  agruparPorCorretor,
  agruparPorMes,
  buscarVendasAssinadas,
  type VendaAssinada,
} from './vendasAssinadasService';

const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
type MesReferencia = number | number[];

interface CommercialSaleRow {
  mes_referencia: number | null;
  valor_imovel: number | null;
  valor_vgv: number | null;
  origem: string | null;
}

interface CommercialSalesRankingRow {
  corretor_nome: string | null;
  corretor_email: string | null;
  valor_vgv: number | string | null;
  valor_vgc: number | string | null;
  comissao_total_venda: number | string | null;
  mes_referencia: number | string | null;
  data_assinatura: string | null;
  data_recebimento: string | null;
}

interface CommercialSalesUserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface CommercialSalesTenantMember {
  user_id: string;
  email?: string | null;
  name?: string | null;
  user_email?: string | null;
  role?: string | null;
  status?: string | null;
}

interface CommercialSalesUserMatch {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface CommercialSalesSyncParams {
  tenantId: string;
  anoReferencia?: number;
  dryRun?: boolean;
  spreadsheetId?: string;
  sheetGid?: string;
  sourceUrl?: string;
}

export interface CommercialSalesSyncResult {
  ok: boolean;
  dryRun?: boolean;
  batchId?: string;
  sourceUrl?: string;
  totalCsvRows?: number;
  headerRow?: number;
  parsedRows?: number;
  ignoredRows?: number;
  inserted?: number;
  updated?: number;
  unchanged?: number;
  deactivated?: number;
  sample?: unknown[];
  error?: string;
}

export interface CommercialSalesMonthlySummary {
  tenant_id: string;
  ano_referencia: number;
  mes_referencia: number | null;
  total_vendas: number;
  total_vgv: number;
  total_vgc: number;
  total_team_leader: number;
  total_conta_japi: number;
  total_comissao_venda: number;
  atualizado_em: string | null;
}

export interface CommercialSalesBrokerSummary {
  tenant_id: string;
  ano_referencia: number;
  mes_referencia: number | null;
  corretor_nome: string;
  total_vendas: number;
  total_vgv: number;
  total_vgc: number;
  total_team_leader: number;
  total_conta_japi: number;
  atualizado_em: string | null;
}

export interface SearchCommercialSales {
  mes: string;
  ate_500k: number;
  de_500k_999k: number;
  acima_1m: number;
}

export interface CommercialSalesSource {
  fonte: string;
  quantidade: number;
}

export interface CommercialSalesBrokerRanking {
  corretor: string;
  userId?: string;
  ranking: number;
  vendasFeitas: number;
  vgvTotal: number;
  vgcTotal: number;
  comissaoTotal: number;
  ticketMedio: number;
  fotoUrl?: string;
}

export interface KPIsSalesCommercial {
  vendasCriadas: number;
  vendasAssinadas: number;
  valorTotalVendasMes: number;
  vgvTotal: number;
  vgcTotal: number;
  comissaoTotal: number;
  ticketMedio: number;
}

export type CommercialSalesFinanceSource = 'proposals' | 'commercial_sales' | 'sales_transactions' | 'leads' | 'empty';

export interface CommercialSalesFinanceMonthly {
  mesNumero: number;
  mes: string;
  vgv: number;
  vgc: number;
  vendas: number;
}

export interface CommercialSalesFinanceSummary {
  source: CommercialSalesFinanceSource;
  vgvSource: CommercialSalesFinanceSource;
  vgcSource: CommercialSalesFinanceSource;
  vendasSource: CommercialSalesFinanceSource;
  vgvTotal: number;
  vgcTotal: number;
  vendasTotal: number;
  ticketMedio: number;
  monthly: CommercialSalesFinanceMonthly[];
  updatedAt?: string | null;
}

interface SalesTransactionFinanceRow {
  valor_imovel: number | string | null;
  valor_comissao: number | string | null;
  data_transacao: string | null;
}

interface LeadFinanceRow {
  final_sale_value: number | string | null;
  closing_date: string | null;
  created_at: string | null;
  custom_fields?: Record<string, unknown> | null;
}

const COMMERCIAL_SALES_PAGE_SIZE = 1000;

function toCommercialNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const compact = raw
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/%/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!compact || compact === '-' || compact === ',' || compact === '.') return 0;

  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  let cleaned = compact;

  if (lastComma !== -1 && lastDot !== -1) {
    cleaned = lastComma > lastDot
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(/,/g, '');
  } else if (lastComma !== -1) {
    cleaned = compact.replace(/\./g, '').replace(',', '.');
  } else if (lastDot !== -1) {
    const decimalDigits = compact.length - lastDot - 1;
    cleaned = decimalDigits > 2 ? compact.replace(/\./g, '') : compact;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyFinanceMonthly(): CommercialSalesFinanceMonthly[] {
  return MES_LABELS.map((mes, index) => ({
    mesNumero: index + 1,
    mes,
    vgv: 0,
    vgc: 0,
    vendas: 0,
  }));
}

function buildFinanceSummary(
  source: CommercialSalesFinanceSource,
  monthly: CommercialSalesFinanceMonthly,
  updatedAt?: string | null,
): CommercialSalesFinanceSummary;
function buildFinanceSummary(
  source: CommercialSalesFinanceSource,
  monthly: CommercialSalesFinanceMonthly[],
  updatedAt?: string | null,
): CommercialSalesFinanceSummary;
function buildFinanceSummary(
  source: CommercialSalesFinanceSource,
  monthlyInput: CommercialSalesFinanceMonthly | CommercialSalesFinanceMonthly[],
  updatedAt?: string | null,
): CommercialSalesFinanceSummary {
  const monthly = Array.isArray(monthlyInput) ? monthlyInput : [monthlyInput];
  const vgvTotal = monthly.reduce((sum, mes) => sum + mes.vgv, 0);
  const vgcTotal = monthly.reduce((sum, mes) => sum + mes.vgc, 0);
  const vendasTotal = monthly.reduce((sum, mes) => sum + mes.vendas, 0);

  return {
    source,
    vgvSource: source,
    vgcSource: source,
    vendasSource: source,
    vgvTotal,
    vgcTotal,
    vendasTotal,
    ticketMedio: vendasTotal > 0 ? vgvTotal / vendasTotal : 0,
    monthly,
    updatedAt,
  };
}

function emptyFinanceSummary(): CommercialSalesFinanceSummary {
  return buildFinanceSummary('empty', emptyFinanceMonthly());
}

function getMonthFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const month = date.getMonth() + 1;
  return month >= 1 && month <= 12 ? month : null;
}

function getYearFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date.getFullYear();
}

function getLeadVgcFallback(lead: LeadFinanceRow): number {
  const customFields = lead.custom_fields || {};
  const possibleKeys = [
    'valor_vgc',
    'vgc',
    'valor_comissao',
    'comissao',
    'commission',
    'comissao_total_venda',
  ];

  for (const key of possibleKeys) {
    const parsed = toCommercialNumber(customFields[key]);
    if (parsed > 0) return parsed;
  }

  return 0;
}

/** Financeiro mensal a partir das vendas assinadas (`proposals`). */
function summarizeVendasAssinadas(vendas: VendaAssinada[]): CommercialSalesFinanceSummary {
  const monthly = emptyFinanceMonthly();

  agruparPorMes(vendas).forEach((totais, mes) => {
    const bucket = monthly[mes - 1];
    if (!bucket) return;
    bucket.vendas += totais.vendas;
    bucket.vgv += totais.vgv;
    bucket.vgc += totais.vgc;
  });

  return buildFinanceSummary('proposals', monthly);
}

function summarizeCommercialMonthlyRows(rows: CommercialSalesMonthlySummary[]): CommercialSalesFinanceSummary {
  const monthly = emptyFinanceMonthly();
  let updatedAt: string | null = null;

  rows.forEach((row) => {
    const mesNumero = Number(row.mes_referencia);
    if (mesNumero < 1 || mesNumero > 12) return;

    const bucket = monthly[mesNumero - 1];
    bucket.vendas += Number(row.total_vendas || 0);
    bucket.vgv += toCommercialNumber(row.total_vgv);
    bucket.vgc += toCommercialNumber(row.total_vgc);
    updatedAt = row.atualizado_em || updatedAt;
  });

  return buildFinanceSummary('commercial_sales', monthly, updatedAt);
}

function summarizeSalesTransactionRows(rows: SalesTransactionFinanceRow[]): CommercialSalesFinanceSummary {
  const monthly = emptyFinanceMonthly();

  rows.forEach((row) => {
    const mesNumero = getMonthFromDate(row.data_transacao);
    if (!mesNumero) return;

    const valorImovel = toCommercialNumber(row.valor_imovel);
    const valorComissao = toCommercialNumber(row.valor_comissao);
    if (valorImovel <= 0 && valorComissao <= 0) return;

    const bucket = monthly[mesNumero - 1];
    bucket.vendas += 1;
    bucket.vgv += valorImovel;
    bucket.vgc += valorComissao;
  });

  return buildFinanceSummary('sales_transactions', monthly);
}

function summarizeLeadFinanceRows(rows: LeadFinanceRow[], anoReferencia: number): CommercialSalesFinanceSummary {
  const monthly = emptyFinanceMonthly();

  rows.forEach((row) => {
    const dataReferencia = row.closing_date || row.created_at;
    const ano = getYearFromDate(dataReferencia);
    const mesNumero = getMonthFromDate(dataReferencia);
    if (ano !== anoReferencia || !mesNumero) return;

    const valorFinalVenda = toCommercialNumber(row.final_sale_value);
    if (valorFinalVenda <= 0) return;

    const bucket = monthly[mesNumero - 1];
    bucket.vendas += 1;
    bucket.vgv += valorFinalVenda;
    bucket.vgc += getLeadVgcFallback(row);
  });

  return buildFinanceSummary('leads', monthly);
}

async function buscarFinanceiroSalesTransactions(
  tenantId: string,
  anoReferencia: number,
): Promise<CommercialSalesFinanceSummary> {
  const { data, error } = await supabase
    .from('sales_transactions' as any)
    .select('valor_imovel, valor_comissao, data_transacao')
    .eq('tenant_id', tenantId)
    .eq('status', 'concluida')
    .gte('data_transacao', `${anoReferencia}-01-01`)
    .lt('data_transacao', `${anoReferencia + 1}-01-01`)
    .order('data_transacao', { ascending: true });

  if (error) {
    console.warn('[commercialSalesService] sales_transactions indisponível para financeiro:', error);
    return emptyFinanceSummary();
  }

  return summarizeSalesTransactionRows((data || []) as SalesTransactionFinanceRow[]);
}

async function buscarFinanceiroLeads(
  tenantId: string,
  anoReferencia: number,
): Promise<CommercialSalesFinanceSummary> {
  const rows: LeadFinanceRow[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('leads' as any)
      .select('final_sale_value, closing_date, created_at, custom_fields')
      .eq('tenant_id', tenantId)
      .not('final_sale_value', 'is', null)
      .gt('final_sale_value', 0)
      .order('created_at', { ascending: true })
      .range(page * COMMERCIAL_SALES_PAGE_SIZE, (page + 1) * COMMERCIAL_SALES_PAGE_SIZE - 1);

    if (error) {
      console.warn('[commercialSalesService] leads indisponível para financeiro:', error);
      return emptyFinanceSummary();
    }

    const pageRows = (data || []) as LeadFinanceRow[];
    rows.push(...pageRows);

    if (pageRows.length < COMMERCIAL_SALES_PAGE_SIZE) break;
    page += 1;
  }

  return summarizeLeadFinanceRows(rows, anoReferencia);
}

function getCommercialSaleMonth(venda: Pick<CommercialSalesRankingRow, 'mes_referencia' | 'data_assinatura' | 'data_recebimento'>): number | null {
  const mesReferencia = Number(venda.mes_referencia);
  if (mesReferencia >= 1 && mesReferencia <= 12) return mesReferencia;

  const dateValue = venda.data_assinatura || venda.data_recebimento;
  if (!dateValue) return null;

  const month = new Date(`${dateValue}T00:00:00`).getMonth() + 1;
  return month >= 1 && month <= 12 ? month : null;
}

function filtrarVendasPorPeriodoComercial(
  vendas: CommercialSalesRankingRow[],
  mesReferencia?: MesReferencia
): CommercialSalesRankingRow[] {
  if (!mesReferencia) return vendas;

  const vendasComMesIdentificavel = vendas.filter((venda) => getCommercialSaleMonth(venda));
  if (vendasComMesIdentificavel.length === 0) return vendas;

  const meses = new Set(Array.isArray(mesReferencia) ? mesReferencia : [mesReferencia]);
  return vendasComMesIdentificavel.filter((venda) => {
    const mes = getCommercialSaleMonth(venda);
    return Boolean(mes && meses.has(mes));
  });
}

export async function sincronizarVendasComerciais(
  params: CommercialSalesSyncParams,
): Promise<CommercialSalesSyncResult> {
  const { data, error } = await supabase.functions.invoke('sync-commercial-sales-google-sheet', {
    body: {
      tenantId: params.tenantId,
      anoReferencia: params.anoReferencia,
      dryRun: params.dryRun,
      spreadsheetId: params.spreadsheetId,
      sheetGid: params.sheetGid,
      sourceUrl: params.sourceUrl,
    },
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return data as CommercialSalesSyncResult;
}

export async function buscarResumoVendasComerciaisMensal(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
): Promise<CommercialSalesMonthlySummary[]> {
  const { data, error } = await supabase
    .from('commercial_sales_monthly_summary')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('ano_referencia', anoReferencia)
    .order('mes_referencia', { ascending: true });

  if (error) throw error;

  return (data || []) as CommercialSalesMonthlySummary[];
}

export async function buscarResumoVendasComerciaisPorCorretor(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
  mesReferencia?: MesReferencia,
): Promise<CommercialSalesBrokerSummary[]> {
  let query = supabase
    .from('commercial_sales_broker_summary')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('ano_referencia', anoReferencia);

  if (Array.isArray(mesReferencia) && mesReferencia.length > 0) {
    query = query.in('mes_referencia', mesReferencia);
  } else if (mesReferencia) {
    query = query.eq('mes_referencia', mesReferencia);
  }

  const { data, error } = await query.order('total_vgc', { ascending: false });

  if (error) throw error;

  return (data || []) as CommercialSalesBrokerSummary[];
}

export async function buscarVendasComerciaisPorFaixa(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
  mesReferencia?: MesReferencia,
): Promise<SearchCommercialSales[]> {
  let query = supabase
    .from('commercial_sales')
    .select('mes_referencia, valor_imovel, valor_vgv')
    .eq('tenant_id', tenantId)
    .eq('ano_referencia', anoReferencia)
    .eq('is_active', true);

  if (Array.isArray(mesReferencia) && mesReferencia.length > 0) {
    query = query.in('mes_referencia', mesReferencia);
  } else if (mesReferencia) {
    query = query.eq('mes_referencia', mesReferencia);
  }

  const { data, error } = await query.order('mes_referencia', { ascending: true });

  if (error) throw error;

  const vendasPorMes = new Map<number, SearchCommercialSales>();

  ((data || []) as CommercialSaleRow[]).forEach((venda) => {
    const mesNumero = Number(venda.mes_referencia);
    if (!mesNumero) return;

    const mes = MES_LABELS[mesNumero - 1] || String(mesNumero);

    if (!vendasPorMes.has(mesNumero)) {
      vendasPorMes.set(mesNumero, {
        mes,
        ate_500k: 0,
        de_500k_999k: 0,
        acima_1m: 0,
      });
    }

    const bucket = vendasPorMes.get(mesNumero)!;
    const valor = Number(venda.valor_imovel || venda.valor_vgv || 0);

    if (valor <= 500000) {
      bucket.ate_500k += 1;
    } else if (valor <= 999999) {
      bucket.de_500k_999k += 1;
    } else {
      bucket.acima_1m += 1;
    }
  });

  return Array.from(vendasPorMes.values());
}

export async function buscarVendasComerciaisPorFonte(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
  mesReferencia?: MesReferencia,
): Promise<CommercialSalesSource[]> {
  let query = supabase
    .from('commercial_sales')
    .select('origem')
    .eq('tenant_id', tenantId)
    .eq('ano_referencia', anoReferencia)
    .eq('is_active', true);

  if (Array.isArray(mesReferencia) && mesReferencia.length > 0) {
    query = query.in('mes_referencia', mesReferencia);
  } else if (mesReferencia) {
    query = query.eq('mes_referencia', mesReferencia);
  }

  const { data, error } = await query;

  if (error) throw error;

  const fontesCount = new Map<string, number>();

  ((data || []) as Pick<CommercialSaleRow, 'origem'>[]).forEach((venda) => {
    const fonte = venda.origem?.trim() || 'Não informado';
    fontesCount.set(fonte, (fontesCount.get(fonte) || 0) + 1);
  });

  return Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ fonte, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * Ranking de corretores por comissão das vendas assinadas.
 *
 * Origem trocada de `commercial_sales` para `proposals` em 02/09/2026. Além de
 * voltar a enxergar venda nova, some a duplicação que a planilha carregava: o
 * apelido digitado ali ("Fernanda", "Gabi", "Andre") só casava com o usuário
 * por nome exato, então a mesma pessoa aparecia em duas linhas do ranking. Em
 * `proposals` o dono da venda é `agent_user_id`.
 */
export async function buscarRankingCorretoresComercial(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
  mesReferencia?: MesReferencia,
): Promise<CommercialSalesBrokerRanking[]> {
  const meses = mesReferencia
    ? new Set(Array.isArray(mesReferencia) ? mesReferencia : [mesReferencia])
    : null;

  const vendas = (
    await buscarVendasAssinadas(tenantId, `${anoReferencia}-01-01`, `${anoReferencia}-12-31`)
  ).filter((venda) => (!meses || meses.has(venda.mes)) && (venda.agentUserId || venda.agentNome));

  const resolver = await buscarResolverUsuariosComerciais(tenantId);

  // Resolver ANTES de agrupar: proposta sem `agent_user_id` mas com nome que
  // casa com um membro (ex.: "FERNANDA SOUZA" digitado no funil) tem que cair
  // na linha da mesma pessoa — senão a duplicação volta por outra porta.
  const vendasResolvidas = vendas.map((venda) => ({
    ...venda,
    agentUserId:
      venda.agentUserId || resolver.byName.get(normalizeCommercialKey(venda.agentNome))?.userId || null,
  }));

  return agruparPorCorretor(vendasResolvidas)
    .map((corretor) => {
      // Sem usuário, o nome da planilha é tudo que há (Eduardo, Nathalia Lobo,
      // "Flávia e Humberto").
      const match =
        (corretor.agentUserId ? resolver.byId.get(corretor.agentUserId) : undefined) ||
        resolver.byName.get(normalizeCommercialKey(corretor.agentNome)) ||
        null;

      return {
        corretor: match?.displayName || corretor.agentNome || 'Não informado',
        userId: match?.userId || corretor.agentUserId || undefined,
        vendasFeitas: corretor.vendas,
        vgvTotal: corretor.vgv,
        vgcTotal: corretor.vgc,
        // Na planilha "Comiss. total da venda" era a própria coluna de VGC —
        // o campo continua existindo para não quebrar quem já o consome.
        comissaoTotal: corretor.vgc,
        ticketMedio: corretor.vendas > 0 ? corretor.vgv / corretor.vendas : 0,
        fotoUrl: match?.avatarUrl || undefined,
        ranking: 0,
      };
    })
    .sort((a, b) => b.comissaoTotal - a.comissaoTotal)
    .map((corretor, index) => ({ ...corretor, ranking: index + 1 }));
}

/** O tenant tem venda assinada? Decide se o ranking usa a origem comercial. */
export async function tenantTemVendasComerciais(tenantId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('proposals')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('stage_id', 'proposta-assinada')
    .not('signed_at', 'is', null);

  if (error) throw error;

  return Number(count || 0) > 0;
}

export async function buscarFinanceiroVendasComerciaisComFallback(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
): Promise<CommercialSalesFinanceSummary> {
  const empty = emptyFinanceSummary();
  const summaries: CommercialSalesFinanceSummary[] = [];

  try {
    const vendas = await buscarVendasAssinadas(
      tenantId,
      `${anoReferencia}-01-01`,
      `${anoReferencia}-12-31`,
    );
    summaries.push(summarizeVendasAssinadas(vendas));
  } catch (error) {
    console.warn('[commercialSalesService] proposals indisponível para financeiro:', error);
  }

  // `commercial_sales` continua como 2ª fonte: é o histórico congelado da
  // importação e ainda cobre tenant que nunca assinou proposta no funil.
  try {
    const comercial = await buscarResumoVendasComerciaisMensal(tenantId, anoReferencia);
    summaries.push(summarizeCommercialMonthlyRows(comercial));
  } catch (error) {
    console.warn('[commercialSalesService] commercial_sales indisponível para financeiro:', error);
  }

  summaries.push(await buscarFinanceiroSalesTransactions(tenantId, anoReferencia));
  summaries.push(await buscarFinanceiroLeads(tenantId, anoReferencia));

  const vgvSummary = summaries.find((summary) => summary.vgvTotal > 0) || empty;
  const vgcSummary = summaries.find((summary) => summary.vgcTotal > 0) || empty;
  const vendasSummary =
    (vgvSummary.vendasTotal > 0 ? vgvSummary : undefined) ||
    (vgcSummary.vendasTotal > 0 ? vgcSummary : undefined) ||
    summaries.find((summary) => summary.vendasTotal > 0) ||
    empty;

  const monthly = emptyFinanceMonthly().map((mes, index) => ({
    ...mes,
    vgv: vgvSummary.monthly[index]?.vgv || 0,
    vgc: vgcSummary.monthly[index]?.vgc || 0,
    vendas: vendasSummary.monthly[index]?.vendas || 0,
  }));

  const vgvTotal = monthly.reduce((sum, mes) => sum + mes.vgv, 0);
  const vgcTotal = monthly.reduce((sum, mes) => sum + mes.vgc, 0);
  const vendasTotal = monthly.reduce((sum, mes) => sum + mes.vendas, 0);
  const source =
    vgvSummary.source !== 'empty'
      ? vgvSummary.source
      : vgcSummary.source !== 'empty'
        ? vgcSummary.source
        : vendasSummary.source;

  return {
    source,
    vgvSource: vgvSummary.source,
    vgcSource: vgcSummary.source,
    vendasSource: vendasSummary.source,
    vgvTotal,
    vgcTotal,
    vendasTotal,
    ticketMedio: vendasTotal > 0 ? vgvTotal / vendasTotal : 0,
    monthly,
    updatedAt: vgvSummary.updatedAt || vgcSummary.updatedAt || vendasSummary.updatedAt,
  };
}

function normalizeCommercialKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function buscarResolverUsuariosComerciais(tenantId: string) {
  const empty = {
    byEmail: new Map<string, CommercialSalesUserMatch>(),
    byName: new Map<string, CommercialSalesUserMatch>(),
    byId: new Map<string, CommercialSalesUserMatch>(),
  };

  const { data: memberships, error: membershipsError } = await supabase
    .from('tenant_memberships' as any)
    .select('*')
    .eq('tenant_id', tenantId);

  if (membershipsError) {
    console.warn('[commercialSalesService] Erro ao buscar membros do tenant:', membershipsError);
    return empty;
  }

  const memberRows = ((memberships || []) as CommercialSalesTenantMember[])
    .filter((member) => member.user_id && member.status !== 'inactive');
  const userIds = [...new Set(memberRows.map((member) => member.user_id))];

  if (userIds.length === 0) return empty;

  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles' as any)
    .select('id, email, full_name, avatar_url')
    .in('id', userIds);

  if (profilesError) {
    console.warn('[commercialSalesService] Erro ao buscar perfis dos usuários:', profilesError);
  }

  const profileById = new Map(
    ((profiles || []) as CommercialSalesUserProfile[]).map((profile) => [profile.id, profile])
  );

  const byEmail = new Map<string, CommercialSalesUserMatch>();
  const byName = new Map<string, CommercialSalesUserMatch>();
  const byId = new Map<string, CommercialSalesUserMatch>();

  const addAlias = (
    map: Map<string, CommercialSalesUserMatch>,
    value: unknown,
    match: CommercialSalesUserMatch
  ) => {
    const key = normalizeCommercialKey(value);
    if (!key || map.has(key)) return;
    map.set(key, match);
  };

  memberRows.forEach((member) => {
    const profile = profileById.get(member.user_id);
    const displayName =
      profile?.full_name?.trim() ||
      member.name?.trim() ||
      profile?.email?.split('@')[0] ||
      member.email?.split('@')[0] ||
      member.user_email?.split('@')[0] ||
      'Usuário';

    const match: CommercialSalesUserMatch = {
      userId: member.user_id,
      displayName,
      email: profile?.email || member.email || member.user_email || null,
      avatarUrl: profile?.avatar_url || null,
    };

    byId.set(member.user_id, match);
    addAlias(byName, profile?.full_name, match);
    addAlias(byName, member.name, match);
    addAlias(byName, member.email, match);
    addAlias(byName, member.user_email, match);
    addAlias(byEmail, profile?.email, match);
    addAlias(byEmail, member.email, match);
    addAlias(byEmail, member.user_email, match);
  });

  return { byEmail, byName, byId };
}

function resolverUsuarioVendaComercial(
  resolver: Awaited<ReturnType<typeof buscarResolverUsuariosComerciais>>,
  venda: CommercialSalesRankingRow
): CommercialSalesUserMatch | null {
  const byEmail = resolver.byEmail.get(normalizeCommercialKey(venda.corretor_email));
  if (byEmail) return byEmail;

  const byName = resolver.byName.get(normalizeCommercialKey(venda.corretor_nome));
  if (byName) return byName;

  const byNameAsEmail = resolver.byEmail.get(normalizeCommercialKey(venda.corretor_nome));
  if (byNameAsEmail) return byNameAsEmail;

  return null;
}

export async function buscarKPIsVendasComerciais(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
  mesReferencia?: MesReferencia,
): Promise<KPIsSalesCommercial> {
  let vendasMensais = await buscarResumoVendasComerciaisMensal(tenantId, anoReferencia);

  if (Array.isArray(mesReferencia) && mesReferencia.length > 0) {
    const meses = new Set(mesReferencia);
    vendasMensais = vendasMensais.filter((mes) => meses.has(Number(mes.mes_referencia)));
  } else if (mesReferencia) {
    vendasMensais = vendasMensais.filter((mes) => Number(mes.mes_referencia) === mesReferencia);
  }

  const vendasCriadas = vendasMensais.reduce((sum, mes) => sum + Number(mes.total_vendas || 0), 0);
  const vgvTotal = vendasMensais.reduce((sum, mes) => sum + Number(mes.total_vgv || 0), 0);
  const vgcTotal = vendasMensais.reduce((sum, mes) => sum + Number(mes.total_vgc || 0), 0);
  const comissaoTotal = vendasMensais.reduce((sum, mes) => sum + Number(mes.total_comissao_venda || 0), 0);

  return {
    vendasCriadas,
    vendasAssinadas: vendasCriadas,
    valorTotalVendasMes: vgvTotal,
    vgvTotal,
    vgcTotal,
    comissaoTotal,
    ticketMedio: vendasCriadas > 0 ? vgvTotal / vendasCriadas : 0,
  };
}
