import { supabase } from '@/lib/supabaseClient';

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
    .from('commercial_sales_monthly_summary' as any)
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
  mesReferencia?: number,
): Promise<CommercialSalesBrokerSummary[]> {
  let query = supabase
    .from('commercial_sales_broker_summary' as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('ano_referencia', anoReferencia);

  if (mesReferencia) {
    query = query.eq('mes_referencia', mesReferencia);
  }

  const { data, error } = await query.order('total_vgc', { ascending: false });

  if (error) throw error;

  return (data || []) as CommercialSalesBrokerSummary[];
}
