/**
 * Serviço para dados de relatórios em tempo real
 * Substitui dados mockados por dados reais do banco
 */

import { supabase } from '@/lib/supabaseClient';
import { canonicalizeFonteCounts } from '@/data/realLeadsProcessor';

const UUID_AGENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Filtro por `assigned_agent_id` (UUID) ou `assigned_agent_name` (ex.: ranking por nome). */
export function isAgentKeyUuid(agentKey: string): boolean {
  return UUID_AGENT_RE.test(agentKey.trim());
}

function applyAssignedAgentFilter<T extends { eq: (c: string, v: string) => T }>(
  query: T,
  agentKey: string
): T {
  const key = agentKey.trim();
  if (!key) return query;
  if (isAgentKeyUuid(key)) return query.eq('assigned_agent_id', key);
  return query.eq('assigned_agent_name', key);
}

function toDayStartIso(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00.000Z`;
}

function toDayEndIso(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : `${dateStr}T23:59:59.999Z`;
}

// Types (definidos inline para evitar dependência de Database)
interface RelatorioVenda {
  id: string;
  tenant_id: string;
  corretor_id?: string;
  imovel_id?: string;
  lead_id?: string;
  codigo_imovel?: string;
  tipo_negocio?: string;
  valor_imovel?: number;
  valor_comissao?: number;
  percentual_comissao?: number;
  exclusividade?: boolean;
  status?: string;
  fonte_negocio?: string;
  data_transacao?: string;
  data_criacao?: string;
  data_atualizacao?: string;
  criado_por?: string;
}

interface RelatorioCorretorMetric {
  id: string;
  tenant_id: string;
  corretor_id: string;
  ano: number;
  mes: number;
  vendas_criadas?: number;
  vendas_assinadas?: number;
  valor_total_vendas?: number;
  total_leads_recebidos?: number;
  total_leads_interagidos?: number;
  taxa_interacao?: number;
  tempo_medio_resposta?: number;
  visitas_realizadas?: number;
  taxa_conversao_visitas?: number;
  taxa_conversao_vendas?: number;
  imoveis_ativos?: number;
  imoveis_exclusivos?: number;
  imoveis_ficha?: number;
  gestao_ativa?: number;
  participacao_treinamentos?: number;
  meta_vendas?: number;
  meta_comissao?: number;
  percentual_atingimento_meta?: number;
  data_criacao?: string;
  data_atualizacao?: string;
  criado_por?: string;
}

interface RelatorioTeamMetric {
  id: string;
  tenant_id: string;
  equipe_id?: string;
  nome_equipe?: string;
  ano: number;
  mes: number;
  total_corretores?: number;
  vendas_criadas?: number;
  vendas_assinadas?: number;
  valor_total_vendas?: number;
  total_leads_recebidos?: number;
  total_leads_interagidos?: number;
  taxa_interacao_geral?: number;
  tempo_medio_resposta_equipe?: number;
  imoveis_ativos?: number;
  imoveis_exclusivos?: number;
  taxa_conversao_visitas?: number;
  taxa_conversao_vendas?: number;
  imoveis_ativados_mes?: number;
  data_criacao?: string;
  data_atualizacao?: string;
  criado_por?: string;
}

// Interfaces para dados de relatórios
export interface VendasPorFonte {
  fonte: string;
  quantidade: number;
}

export interface VendasPorFaixa {
  mes: string;
  ate_500k: number;
  de_500k_999k: number;
  acima_1m: number;
}

export interface LeadsPorBairro {
  bairro: string;
  quantidade: number;
}

export interface MetricasIndividuais {
  corretor: string;
  valorComissao: number;
  vendasFeitas: number;
  gestaoAtiva: number;
  ranking: number;
  fotoUrl?: string;
}

export interface KPIsGerais {
  totalLeadsRecebidos: number;
  totalLeadsInteragidos: number;
  mediaInteracaoDia: number;
  mediaTempoPrimeiraInteracao: number;
  totalLeadsConvertidos: number;
}

export interface MetricasIndividuaisLeads {
  totalLeads: number;
  leadsRecebidos: number;
  visitas: number;
  vendasRealizadas: number;
  porBairro: Array<{ label: string; value: number }>;
  porFonte: Array<{ label: string; value: number }>;
  porImovel: Array<{ label: string; value: number }>;
}

export interface MetricasIndividuaisVendas {
  vendasTotal: number;
  vendasExclusivas: number;
  vendasNaoExclusivas: number;
  vgvTotal: number;
  comissaoTotal: number;
  ticketMedio: number;
  rows: Array<{
    id: string;
    codigo_imovel: string;
    exclusividade: string;
    fonte: string;
    valor_imovel: number;
    comissao: number;
    data: string;
  }>;
  fonteBreakdown: Array<{ fonte: string; quantidade: number }>;
}

// Funções para buscar dados reais

// Amostra do tempo de resposta: os leads respondidos MAIS RECENTES. A média de
// tempo de primeira resposta não tem como sair de uma COUNT, e o PostgREST corta
// em 1000 de qualquer jeito — então a janela é explícita e recente, em vez de um
// pedaço arbitrário do começo da tabela.
const AMOSTRA_TEMPO_RESPOSTA = 1000;

export async function buscarKPIsGerais(tenantId: string): Promise<KPIsGerais> {
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const doTenant = () => supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);

  // As cinco leituras são independentes → uma rodada só.
  // Antes isto era um `select('*')` de TODOS os leads com os filtros feitos em JS,
  // sobre duas colunas que não existem na tabela (`first_interaction_at` e
  // `etapa_atual`): o filtro nunca casava e três destes KPIs eram zero fixo. As
  // colunas reais são `first_response_at` e, para conversão, `final_sale_value`.
  const [recebidos, interagidos, convertidos, ultimos30, amostraResposta] = await Promise.all([
    doTenant(),
    doTenant().not('first_response_at', 'is', null),
    doTenant().gt('final_sale_value', 0),
    doTenant().gte('created_at', trintaDiasAtras.toISOString()),
    supabase
      .from('leads')
      .select('created_at, first_response_at')
      .eq('tenant_id', tenantId)
      .not('first_response_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(AMOSTRA_TEMPO_RESPOSTA),
  ]);

  const primeiroErro = [recebidos, interagidos, convertidos, ultimos30, amostraResposta].find(r => r.error)?.error;
  if (primeiroErro) throw primeiroErro;

  const temposResposta = (amostraResposta.data || [])
    .map(l => {
      if (!l.created_at || !l.first_response_at) return 0;
      const diff = new Date(l.first_response_at).getTime() - new Date(l.created_at).getTime();
      return Math.floor(diff / (1000 * 60)); // minutos
    })
    .filter(t => t > 0);

  const mediaTempoPrimeiraInteracao = temposResposta.length > 0
    ? Math.round(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length)
    : 0;

  return {
    totalLeadsRecebidos: recebidos.count ?? 0,
    totalLeadsInteragidos: interagidos.count ?? 0,
    mediaInteracaoDia: Math.round((ultimos30.count ?? 0) / 30),
    mediaTempoPrimeiraInteracao,
    totalLeadsConvertidos: convertidos.count ?? 0,
  };
}

export async function buscarTotalLeadsMensal(
  tenantId: string,
) {
  // Usar query direta para contar leads mensais do tenant
  const { count, error } = await supabase
    .from('leads' as any)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  if (error) {
    console.error('Erro ao buscar leads mensais:', error);
    return 0;
  }

  return count ?? 0;
}

// Função para formatar valores monetários
export const formatarValorMonetario = (valor: number): string => {
  if (valor >= 1000000) {
    return `$${(valor / 1000000).toFixed(1)}M`;
  } else if (valor >= 1000) {
    return `$${(valor / 1000).toFixed(1)}K`;
  } else {
    return `$${valor.toFixed(0)}`;
  }
};

export async function buscarImoveisAtivos(tenantId: string) {
  const { count, error } = await supabase
    .from('leads' as any)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'Novos Leads');

  if (error) {
    console.error('Erro ao buscar imoveis ativos:', error);
    return 0;
  }

  return count ?? 0;
}



export async function buscarValorTotal(
  tenantId: string,
) {
  const { data, error } = await supabase
    .from('leads' as any)
    .select('final_sale_value')
    .eq('tenant_id', tenantId)
    .not('final_sale_value', 'is', null);

  if (error) {
    console.error('Erro ao buscar valor total:', error);
    return 0;
  }

  return data?.reduce((acc, lead) => acc + (lead.final_sale_value || 0), 0) || 0;
}

export async function buscarVendasAssinadas(
  tenantId: string,
) {
  // Contagem no banco, não `.length` das linhas: o PostgREST corta o resultado em
  // db-max-rows (1000 neste projeto, verificado) SEM erro — contar no cliente dá o
  // número errado assim que o tenant passa desse volume. Mesmo padrão de
  // buscarTotalLeadsMensal/buscarImoveisAtivos, e não traz nenhuma linha.
  const { count, error } = await supabase
    .from('leads' as any)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('assigned_agent_id', 'is', null)
    .not('final_sale_value', 'is', null)
    .gt('final_sale_value', 0);

  if (error) {
    console.error('Erro ao buscar vendas assinadas:', error);
    return 0;
  }

  return count ?? 0;
}

export async function buscarVendasCriadas(
  tenantId: string,
) {
  // Contagem no banco (ver nota em buscarVendasAssinadas): `.length` das linhas
  // silenciosamente empaca em 1000.
  const { count, error } = await supabase
    .from('leads' as any)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  if (error) {
    console.error('Erro ao buscar vendas criadas:', error);
    return 0;
  }

  return count ?? 0;
}

export async function buscarRankingCorretores(
  tenantId: string,
  ano: number,
  mes: number,
  periodo: 'monthly' | 'quarterly' | 'semiannual' | 'yearly'
): Promise<MetricasIndividuais[]> {
  let startMonth = mes;
  let endMonth = mes;
  const startYear = ano;
  const endYear = ano;

  if (periodo === 'quarterly') {
    startMonth = ((mes - 1) / 3) * 3 + 1;
    endMonth = startMonth + 2;
  } else if (periodo === 'semiannual') {
    startMonth = mes <= 6 ? 1 : 7;
    endMonth = mes <= 6 ? 6 : 12;
  } else if (periodo === 'yearly') {
    startMonth = 1;
    endMonth = 12;
  }

  // Buscar dados diretos da tabela leads em vez de corretor_metrics
  const { data: leads, error } = await supabase
    .from('leads')
    .select('assigned_agent_name, created_at, final_sale_value')
    .eq('tenant_id', tenantId)
    // .gte('created_at', `${startYear}-${String(startMonth - 1).padStart(2, '0')}-01`)
    // .lt('created_at', `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`);

  if (error) throw error;

  // Agregar dados por corretor
  const aggregated = new Map<string, {
    valorComissao: number;
    vendasFeitas: number;
    gestaoAtiva: number;
    fotoUrl?: string;
  }>();

  leads?.forEach(lead => {
    const key = lead.assigned_agent_name;
    if (!key) return;

    const existing = aggregated.get(key) || {
      valorComissao: 0,
      vendasFeitas: 0,
      gestaoAtiva: 0,
      fotoUrl: undefined
    };

    aggregated.set(key, {
      valorComissao: existing.valorComissao + (lead.final_sale_value || 0),
      vendasFeitas: existing.vendasFeitas + (lead.final_sale_value ? 1 : 0),
      gestaoAtiva: existing.gestaoAtiva + 1,
      fotoUrl: existing.fotoUrl
    });
  });

  // Converter para array e ordenar
  const ranking = Array.from(aggregated.entries())
    .map(([corretorId, data]) => ({
      corretor: corretorId,
      ...data
    }))
    .sort((a, b) => b.valorComissao - a.valorComissao)
    .map((item, index) => ({
      ...item,
      ranking: index + 1,
      fotoUrl: item.fotoUrl || `/avatars/${item.corretor.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`
    }));

  return ranking;
}

export async function buscarMetricasIndividuaisLeads(
  tenantId: string,
  corretorId: string,
  dataInicial: string,
  dataFinal: string
): Promise<MetricasIndividuaisLeads> {
  const di = toDayStartIso(dataInicial);
  const df = toDayEndIso(dataFinal);

  let query = supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('created_at', di)
    .lte('created_at', df);

  query = applyAssignedAgentFilter(query, corretorId);

  const { data: leads, error: leadsError } = await query;

  if (leadsError) throw leadsError;

  const totalLeads = leads?.length || 0;
  const leadsRecebidos = totalLeads;

  // Contar visitas (leads em etapa de visita)
  const visitas = leads?.filter(l =>
    l.etapa_atual?.includes('Visita') ||
    l.etapa_atual?.includes('Visitação') ||
    l.etapa_atual?.includes('Mostrar')
  ).length || 0;

  // Contar vendas realizadas
  const vendasRealizadas = leads?.filter(l =>
    l.etapa_atual?.includes('Venda') ||
    l.etapa_atual?.includes('Concluído') ||
    l.etapa_atual?.includes('Negócio Fechado')
  ).length || 0;

  // Agrupar por bairro
  const bairrosCount = new Map<string, number>();
  leads?.forEach(lead => {
    const row = lead as Record<string, unknown>;
    const bairro = String(
      row.bairro ?? row.district ?? row.neighborhood ?? 'Não informado'
    );
    bairrosCount.set(bairro, (bairrosCount.get(bairro) || 0) + 1);
  });

  const porBairro = Array.from(bairrosCount.entries())
    .map(([bairro, quantidade]) => ({ label: bairro, value: quantidade }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Agrupar por fonte (deduplicando variações de capitalização)
  const fontesCount = canonicalizeFonteCounts(
    (leads ?? []).map(lead => {
      const row = lead as Record<string, unknown>;
      return String(row.origem_lead ?? row.source ?? row.lead_source ?? 'Não informado');
    })
  );

  const porFonte = Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ label: fonte, value: quantidade }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Agrupar por imóvel
  const imoveisCount = new Map<string, number>();
  leads?.forEach(lead => {
    const row = lead as Record<string, unknown>;
    const imovel = String(row.imovel_id ?? row.property_code ?? 'Não informado');
    imoveisCount.set(imovel, (imoveisCount.get(imovel) || 0) + 1);
  });

  const porImovel = Array.from(imoveisCount.entries())
    .map(([imovel, quantidade]) => ({ label: imovel, value: quantidade }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return {
    totalLeads,
    leadsRecebidos,
    visitas,
    vendasRealizadas,
    porBairro,
    porFonte,
    porImovel
  };
}

export async function buscarMetricasIndividuaisVendas(
  tenantId: string,
  corretorId: string,
  dataInicial: string,
  dataFinal: string
): Promise<MetricasIndividuaisVendas> {
  const di = toDayStartIso(dataInicial);
  const df = toDayEndIso(dataFinal);

  let query = supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('created_at', di)
    .lte('created_at', df)
    .not('final_sale_value', 'is', null);

  query = applyAssignedAgentFilter(query, corretorId);

  const { data: vendas, error: vendasError } = await query;

  if (vendasError) throw vendasError;

  const vendasTotal = vendas?.length || 0;
  const vendasExclusivas = vendas?.filter(v => {
    const row = v as Record<string, unknown>;
    return Boolean(row.exclusividade ?? row.exclusivity);
  }).length || 0;
  const vendasNaoExclusivas = vendasTotal - vendasExclusivas;

  const vgvTotal = vendas?.reduce((sum, v) => sum + (v.final_sale_value || 0), 0) || 0;
  const comissaoTotal = vendas?.reduce((sum, v) => sum + (v.final_sale_value || 0), 0) || 0;
  const ticketMedio = vendasTotal > 0 ? vgvTotal / vendasTotal : 0;

  // Detalhamento das vendas
  const rows = vendas?.map(v => {
    const row = v as Record<string, unknown>;
    const exclusivo = Boolean(row.exclusivity ?? row.exclusividade);
    const fonte = String(row.lead_source ?? row.source ?? 'Não informado');
    const codigo = String(row.property_code ?? row.codigo_imovel ?? '');
    return {
      id: String(row.id ?? ''),
      codigo_imovel: codigo,
      exclusividade: exclusivo ? 'exclusivo' : 'não exclusivo',
      fonte,
      valor_imovel: Number(row.final_sale_value ?? 0),
      comissao: Number(row.final_sale_value ?? 0),
      data: String(row.created_at ?? ''),
    };
  }) || [];

  // Agrupar por fonte (deduplicando variações de capitalização)
  const fontesCount = canonicalizeFonteCounts(
    (vendas ?? []).map(venda => {
      const row = venda as Record<string, unknown>;
      return String(row.lead_source ?? row.source ?? 'Não informado');
    })
  );

  const fonteBreakdown = Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ fonte, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return {
    vendasTotal,
    vendasExclusivas,
    vendasNaoExclusivas,
    vgvTotal,
    comissaoTotal,
    ticketMedio,
    rows,
    fonteBreakdown
  };
}

export async function buscarVendasPorFonte(tenantId: string): Promise<VendasPorFonte[]> {
  const { data: vendas, error } = await supabase
    .from('leads')
    .select('source')
    .eq('tenant_id', tenantId)
    .not('final_sale_value', 'is', null);

  if (error) throw error;

  const fontesCount = canonicalizeFonteCounts(
    (vendas ?? []).map(venda => venda.source || 'Não informado')
  );

  return Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ fonte, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

export async function buscarVendasPorFaixa(
  tenantId: string,
  meses: number = 12
): Promise<VendasPorFaixa[]> {
  const { data: vendas, error } = await supabase
    .from('leads')
    .select('final_sale_value, created_at')
    .eq('tenant_id', tenantId)
    .not('final_sale_value', 'is', null)
    .gte('created_at', new Date(Date.now() - meses * 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Agrupar por mês e faixa de valor
  const mesesData = new Map<string, {
    ate_500k: number;
    de_500k_999k: number;
    acima_1m: number;
  }>();

  vendas?.forEach(venda => {
    if (!venda.created_at || !venda.final_sale_value) return;

    const mes = new Date(venda.created_at).toLocaleDateString('pt-BR', { month: 'short' });
    const valor = venda.final_sale_value;

    if (!mesesData.has(mes)) {
      mesesData.set(mes, { ate_500k: 0, de_500k_999k: 0, acima_1m: 0 });
    }

    const data = mesesData.get(mes)!;
    if (valor <= 500000) {
      data.ate_500k++;
    } else if (valor <= 999999) {
      data.de_500k_999k++;
    } else {
      data.acima_1m++;
    }
  });

  return Array.from(mesesData.entries())
    .map(([mes, data]) => ({ mes, ...data }));
}
