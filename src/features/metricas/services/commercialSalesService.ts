import { supabase } from '@/lib/supabaseClient';

const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
type MesReferencia = number | number[];

interface CommercialSaleRow {
  mes_referencia: number | null;
  valor_imovel: number | null;
  valor_vgv: number | null;
  origem: string | null;
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
  ranking: number;
  vendasFeitas: number;
  vgvTotal: number;
  vgcTotal: number;
  comissaoTotal: number;
  ticketMedio: number;
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

export async function buscarRankingCorretoresComercial(
  tenantId: string,
  anoReferencia = new Date().getFullYear(),
  mesReferencia?: MesReferencia,
): Promise<CommercialSalesBrokerRanking[]> {
  const corretores = await buscarResumoVendasComerciaisPorCorretor(
    tenantId,
    anoReferencia,
    mesReferencia,
  );

  const porCorretor = new Map<string, Omit<CommercialSalesBrokerRanking, 'ranking' | 'ticketMedio'>>();

  corretores.forEach((corretor) => {
    const nome = corretor.corretor_nome?.trim() || 'Não informado';
    const atual = porCorretor.get(nome) || {
      corretor: nome,
      vendasFeitas: 0,
      vgvTotal: 0,
      vgcTotal: 0,
      comissaoTotal: 0,
    };

    atual.vendasFeitas += Number(corretor.total_vendas || 0);
    atual.vgvTotal += Number(corretor.total_vgv || 0);
    atual.vgcTotal += Number(corretor.total_vgc || 0);
    atual.comissaoTotal += Number(corretor.total_vgc || 0);

    porCorretor.set(nome, atual);
  });

  const ranking = Array.from(porCorretor.values())
    .map((corretor) => ({
      ...corretor,
      ranking: 0,
      ticketMedio: corretor.vendasFeitas > 0 ? corretor.vgvTotal / corretor.vendasFeitas : 0,
    }))
    .sort((a, b) => b.vgcTotal - a.vgcTotal);

  return ranking.map((corretor, index) => ({
    ...corretor,
    ranking: index + 1,
  }));
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
