/**
 * Serviço para dados de relatórios em tempo real
 * Substitui dados mockados por dados reais do banco
 */

import { KPIsEquipe } from '@/features/metricas/services/metricsService';
import { supabase } from '@/lib/supabaseClient';

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

export async function buscarKPIsGerais(tenantId: string): Promise<KPIsGerais> {
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId);

  if (leadsError) throw leadsError;

  const totalLeadsRecebidos = leads?.length || 0;
  const totalLeadsInteragidos = leads?.filter(l => l.first_interaction_at).length || 0;
  const totalLeadsConvertidos = leads?.filter(l =>
    l.etapa_atual?.includes('Venda') ||
    l.etapa_atual?.includes('Concluído') ||
    l.etapa_atual?.includes('Negócio Fechado')
  ).length || 0;

  // Calcular tempo médio de primeira interação
  const leadsComInteracao = leads?.filter(l => l.first_interaction_at) || [];
  const temposInteracao = leadsComInteracao.map(l => {
    if (l.created_at && l.first_interaction_at) {
      const diff = new Date(l.first_interaction_at).getTime() - new Date(l.created_at).getTime();
      return Math.floor(diff / (1000 * 60)); // minutos
    }
    return 0;
  }).filter(t => t > 0);

  const mediaTempoPrimeiraInteracao = temposInteracao.length > 0
    ? Math.round(temposInteracao.reduce((a, b) => a + b, 0) / temposInteracao.length)
    : 0;

  // Calcular média de interações por dia (últimos 30 dias)
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const leadsUltimos30Dias = leads?.filter(l =>
    new Date(l.created_at) >= trintaDiasAtras
  ).length || 0;

  const mediaInteracaoDia = Math.round(leadsUltimos30Dias / 30);

  return {
    totalLeadsRecebidos,
    totalLeadsInteragidos,
    mediaInteracaoDia,
    mediaTempoPrimeiraInteracao,
    totalLeadsConvertidos
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
  const { data, error } = await supabase
    .from('leads' as any)
    .select('created_at, final_sale_value, status')
    .eq('tenant_id', tenantId)
    .not('assigned_agent_id', 'is', null)
    .not('final_sale_value', 'is', null)
    .gt('final_sale_value', 0);

  if (error) {
    console.error('Erro ao buscar vendas assinadas:', error);
    return 0;
  }

  // Retornar o número de vendas assinadas (leads com valor > 0)
  return (data || []).length;
}

export async function buscarVendasCriadas(
  tenantId: string,
) {
  const { data, error } = await supabase
    .from('leads' as any)
    .select('created_at, final_sale_value, status')
    .eq('tenant_id', tenantId)
    .filter('archived_at', 'is', null);

  if (error) {
    console.error('Erro ao buscar vendas criadas:', error);
    return 0;
  }

  // Retornar o número de vendas criadas (total de leads)
  return (data || []).length;
}

export async function buscarRankingCorretores(
  tenantId: string,
  ano: number,
  mes: number,
  periodo: 'monthly' | 'quarterly' | 'semiannual' | 'yearly'
): Promise<MetricasIndividuais[]> {
  let startMonth = mes;
  let endMonth = mes;
  let startYear = ano;
  let endYear = ano;

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
    .gte('created_at', `${startYear}-${String(startMonth).padStart(2, '0')}-01`)
    .lt('created_at', `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`);

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
  // Buscar leads do corretor no período
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('assigned_agent_id', corretorId)
    .gte('created_at', dataInicial)
    .lte('created_at', dataFinal);

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
    const bairro = lead.bairro || 'Não informado';
    bairrosCount.set(bairro, (bairrosCount.get(bairro) || 0) + 1);
  });

  const porBairro = Array.from(bairrosCount.entries())
    .map(([bairro, quantidade]) => ({ label: bairro, value: quantidade }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Agrupar por fonte
  const fontesCount = new Map<string, number>();
  leads?.forEach(lead => {
    const fonte = lead.origem_lead || 'Não informado';
    fontesCount.set(fonte, (fontesCount.get(fonte) || 0) + 1);
  });

  const porFonte = Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ label: fonte, value: quantidade }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Agrupar por imóvel
  const imoveisCount = new Map<string, number>();
  leads?.forEach(lead => {
    const imovel = lead.imovel_id || 'Não informado';
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
  // Buscar vendas do corretor no período (usando leads com final_sale_value)
  const { data: vendas, error: vendasError } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('assigned_agent_id', corretorId)
    .gte('created_at', dataInicial)
    .lte('created_at', dataFinal)
    .not('final_sale_value', 'is', null);

  if (vendasError) throw vendasError;

  const vendasTotal = vendas?.length || 0;
  const vendasExclusivas = vendas?.filter(v => v.exclusividade).length || 0;
  const vendasNaoExclusivas = vendasTotal - vendasExclusivas;

  const vgvTotal = vendas?.reduce((sum, v) => sum + (v.final_sale_value || 0), 0) || 0;
  const comissaoTotal = vendas?.reduce((sum, v) => sum + (v.final_sale_value || 0), 0) || 0;
  const ticketMedio = vendasTotal > 0 ? vgvTotal / vendasTotal : 0;

  // Detalhamento das vendas
  const rows = vendas?.map(v => ({
    id: v.id,
    codigo_imovel: v.property_code || '',
    exclusividade: v.exclusivity ? 'exclusivo' : 'não exclusivo',
    fonte: v.lead_source || '',
    valor_imovel: v.final_sale_value || 0,
    comissao: v.final_sale_value || 0,
    data: v.created_at || ''
  })) || [];

  // Agrupar por fonte
  const fontesCount = new Map<string, number>();
  vendas?.forEach(venda => {
    const fonte = venda.lead_source || 'Não informado';
    fontesCount.set(fonte, (fontesCount.get(fonte) || 0) + 1);
  });

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

  const fontesCount = new Map<string, number>();
  vendas?.forEach(venda => {
    const fonte = venda.source || 'Não informado';
    fontesCount.set(fonte, (fontesCount.get(fonte) || 0) + 1);
  });

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