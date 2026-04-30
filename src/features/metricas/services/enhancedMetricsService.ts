/**
 * Serviço aprimorado para métricas em tempo real
 * Substitui completamente os dados mockados do MetricsDashboard
 */

import { supabase } from '@/lib/supabaseClient';
import {
  calcularPercentual,
  calcularDistribuicaoPercentual,
  calcularVariacaoPercentual,
  calcularProgressoVisual,
  formatarVariacaoPercentual,
  calcularVariacoesKPIs,
  calcularTaxaConversao,
  calcularTaxaAtendimento,
  type DistribuicaoPercentual,
  type VariacoesPercentuais as VariacoesPercentuaisType
} from './percentageService';

// Interfaces para métricas aprimoradas
export interface KPIsEquipe {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number;
}

export interface MetricasEquipe {
  equipe: string;
  tempoMedio: number;
  cor: string;
}

export interface LeadsPorEquipe {
  equipe: string;
  quantidade: number;
  cor: string;
}

export interface DistribuicaoExclusivoFicha {
  tipo: string;
  quantidade: number;
  percentual: number;
}

// Usar VariacoesPercentuais do percentageService
export type VariacoesPercentuais = VariacoesPercentuaisType;

export interface NegocioFechadoPorFonte {
  fonte: string;
  quantidade: number;
}

export interface VendasPorFaixa {
  mes: string;
  ate_500k: number;
  de_500k_999k: number;
  acima_1m: number;
}

export interface EvolucaoAtivacoes {
  mes: string;
  quantidade: number;
}


// Cores padrão para equipes
const CORES_EQUIPES = [
  '#22c55e', // Equipe Verde
  '#eab308', // Equipe Amarela
  '#ef4444', // Equipe Vermelha
  '#3b82f6', // Equipe Azul
  '#8b5cf6', // Equipe Roxa
  '#06b6d4', // Equipe Ciano
];

// Função para obter cor da equipe
function getCorEquipe(index: number): string {
  return CORES_EQUIPES[index % CORES_EQUIPES.length];
}

// Buscar KPIs gerais da equipe
export async function buscarKPIsEquipe(tenantId: string): Promise<KPIsEquipe> {
  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();

  // Buscar vendas do mês
  const { data: vendas, error: vendasError } = await supabase
    .from('sales_transactions')
    .select('valor_imovel, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'concluida')
    .gte('data_transacao', `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`)
    .lt('data_transacao', `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-01`);

  if (vendasError) throw vendasError;

  const vendasAssinadas = vendas?.length || 0;
  const valorTotalVendas = vendas?.reduce((sum, v) => sum + (v.valor_imovel || 0), 0) || 0;

  // Buscar imóveis ativos
  const { data: imoveis, error: imoveisError } = await supabase
    .from('imoveis')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'ativo');

  if (imoveisError) throw imoveisError;

  const imoveisAtivos = imoveis?.length || 0;

  // Buscar leads do mês
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, created_at, first_interaction_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`)
    .lt('created_at', `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-01`);

  if (leadsError) throw leadsError;

  const totalLeadsMes = leads?.length || 0;

  // Calcular tempo médio de resposta
  const leadsComResposta = leads?.filter(l => l.first_interaction_at) || [];
  const temposResposta = leadsComResposta.map(l => {
    if (l.created_at && l.first_interaction_at) {
      const diff = new Date(l.first_interaction_at).getTime() - new Date(l.created_at).getTime();
      return Math.floor(diff / (1000 * 60)); // minutos
    }
    return 0;
  }).filter(t => t > 0);

  const tempoMedioRespostaGeral = temposResposta.length > 0 
    ? Math.round(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length)
    : 0;

  return {
    vendasCriadas: vendasAssinadas, // Simplificado - poderia ser separado
    vendasAssinadas,
    imoveisAtivos,
    totalLeadsMes,
    valorTotalVendasMes: valorTotalVendas,
    tempoMedioRespostaGeral
  };
}

// Buscar métricas por equipe
export async function buscarMetricasPorEquipe(
  tenantId: string,
  mes?: number,
  ano?: number
): Promise<MetricasEquipe[]> {
  // Buscar diretamente da tabela teams
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .eq('tenant_id', tenantId);

  if (teamsError) {
    console.error('Erro ao buscar equipes:', teamsError);
    return [];
  }

  // Sempre calcular dados reais dos leads
  console.log('Calculando métricas reais dos dados brutos...');
  const mesAlvo = mes || new Date().getMonth() + 1;
  const anoAlvo = ano || new Date().getFullYear();
  const metricasBrutas = await calcularMetricasPorEquipeBrutas(tenantId, mesAlvo, anoAlvo);

  // Se tiver equipes configuradas, usar cores e nomes delas
  if (teams && teams.length > 0) {
    return metricasBrutas.map((metrica, index) => ({
      equipe: metrica.equipe,
      tempoMedio: metrica.tempoMedio,
      cor: teams[index]?.color || metrica.cor,
    }));
  }

  return metricasBrutas;
}

// Calcular métricas por equipe a partir dos dados brutos
async function calcularMetricasPorEquipeBrutas(
  tenantId: string,
  mes: number,
  ano: number
): Promise<MetricasEquipe[]> {
  // Buscar todos os leads no período (sem filtros restritivos)
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('assigned_agent_name, created_at, visit_date')
    .eq('tenant_id', tenantId)
    .gte('created_at', `${ano}-${String(mes).padStart(2, '0')}-01`)
    .lt('created_at', `${ano}-${String(mes + 1).padStart(2, '0')}-01`);

  if (leadsError) throw leadsError;

  // Agrupar por corretor
  const corretoresMap = new Map<string, { leads: any[], tempos: number[] }>();
  
  leads?.forEach(lead => {
    const corretor = lead.assigned_agent_name;
    if (!corretor) return;
    
    if (!corretoresMap.has(corretor)) {
      corretoresMap.set(corretor, { leads: [], tempos: [] });
    }
    
    const corretorData = corretoresMap.get(corretor)!;
    corretorData.leads.push(lead);
    
    if (lead.created_at && lead.visit_date) {
      const diff = new Date(lead.visit_date).getTime() - new Date(lead.created_at).getTime();
      const tempo = Math.floor(diff / (1000 * 60));
      if (tempo > 0) {
        corretorData.tempos.push(tempo);
      }
    }
  });

  // Converter para o formato esperado
  const metricasEquipe: MetricasEquipe[] = [];
  let index = 0;
  
  for (const [corretor, data] of corretoresMap) {
    const tempoMedio = data.tempos.length > 0 
      ? Math.round(data.tempos.reduce((a, b) => a + b, 0) / data.tempos.length)
      : 0;

    metricasEquipe.push({
      equipe: corretor,
      tempoMedio,
      cor: getCorEquipe(index++)
    });
  }

  return metricasEquipe;
}

// Buscar leads por equipe
export async function buscarLeadsPorEquipe(tenantId: string): Promise<LeadsPorEquipe[]> {
  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();

  // Buscar equipes únicas do tenant
  const { data: memberships, error: membershipsError } = await supabase
    .from('tenant_memberships')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (membershipsError) throw membershipsError;

  // Obter equipes únicas
  const uniqueTeams = [...new Set(memberships?.map(m => m.team_id) || [])];
  const leadsPorEquipe: LeadsPorEquipe[] = [];

  for (let i = 0; i < uniqueTeams.length; i++) {
    const teamId = uniqueTeams[i];
    
    // Buscar membros da equipe
    const { data: members, error: membersError } = await supabase
      .from('tenant_memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (membersError) throw membersError;

    // Buscar leads da equipe no mês
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .gte('created_at', `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`)
      .lt('created_at', `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-01`)
      .in('attended_by_id', members?.map(m => m.user_id) || []);

    if (leadsError) throw leadsError;

    leadsPorEquipe.push({
      equipe: teamId,
      quantidade: leads?.length || 0,
      cor: getCorEquipe(i)
    });
  }

  return leadsPorEquipe.sort((a, b) => b.quantidade - a.quantidade);
}

// Buscar distribuição exclusivo vs ficha
export async function buscarDistribuicaoExclusivoFicha(tenantId: string): Promise<DistribuicaoExclusivoFicha[]> {
  const { data: imoveis, error } = await supabase
    .from('imoveis')
    .select('exclusividade')
    .eq('tenant_id', tenantId)
    .eq('status', 'ativo');

  if (error) throw error;

  const total = imoveis?.length || 0;
  if (total === 0) {
    return [
      { tipo: 'Exclusivo', quantidade: 0, percentual: 0 },
      { tipo: 'Ficha', quantidade: 0, percentual: 0 }
    ];
  }

  const exclusivos = imoveis?.filter(i => i.exclusividade).length || 0;
  const fichas = total - exclusivos;

  // Usar o novo serviço de percentuais
  const dadosBrutos = [
    { tipo: 'Exclusivo', quantidade: exclusivos },
    { tipo: 'Ficha', quantidade: fichas }
  ];

  return calcularDistribuicaoPercentual(dadosBrutos, 1);
}

// Buscar negócios fechados por fonte
export async function buscarNegociosFechadosPorFonte(tenantId: string): Promise<NegocioFechadoPorFonte[]> {
  const { data: vendas, error } = await supabase
    .from('sales_transactions')
    .select('fonte_negocio')
    .eq('tenant_id', tenantId)
    .eq('status', 'concluida')
    .gte('data_transacao', new Date(new Date().getFullYear(), 0, 1).toISOString()); // Desde início do ano

  if (error) throw error;

  const fontesCount = new Map<string, number>();
  vendas?.forEach(venda => {
    const fonte = venda.fonte_negocio || 'Não informado';
    fontesCount.set(fonte, (fontesCount.get(fonte) || 0) + 1);
  });

  return Array.from(fontesCount.entries())
    .map(([fonte, quantidade]) => ({ fonte, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10); // Top 10 fontes
}

// Buscar vendas por faixa de preço
export async function buscarVendasPorFaixa(tenantId: string): Promise<VendasPorFaixa[]> {
  const { data: vendas, error } = await supabase
    .from('sales_transactions')
    .select('valor_imovel, data_transacao')
    .eq('tenant_id', tenantId)
    .eq('status', 'concluida')
    .gte('data_transacao', new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString()) // Últimos 12 meses
    .order('data_transacao', { ascending: true });

  if (error) throw error;

  // Agrupar por mês e faixa de valor
  const mesesData = new Map<string, {
    ate_500k: number;
    de_500k_999k: number;
    acima_1m: number;
  }>();

  vendas?.forEach(venda => {
    if (!venda.data_transacao || !venda.valor_imovel) return;

    const mes = new Date(venda.data_transacao).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const valor = venda.valor_imovel;

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
    .map(([mes, data]) => ({ mes, ...data }))
    .slice(-12); // Últimos 12 meses
}

// Buscar evolução de ativações
export async function buscarEvolucaoAtivacoes(tenantId: string): Promise<EvolucaoAtivacoes[]> {
  const { data: imoveis, error } = await supabase
    .from('imoveis')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'ativo')
    .gte('created_at', new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString()) // Últimos 12 meses
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Agrupar por mês
  const mesesData = new Map<string, number>();
  imoveis?.forEach(imovel => {
    if (!imovel.created_at) return;
    
    const mes = new Date(imovel.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    mesesData.set(mes, (mesesData.get(mes) || 0) + 1);
  });

  return Array.from(mesesData.entries())
    .map(([mes, quantidade]) => ({ mes, quantidade }))
    .slice(-12); // Últimos 12 meses
}


// Buscar métricas gerais (compatível com service existente)
export async function buscarMetricasGerais() {
  // Implementação placeholder para compatibilidade
  return {
    tempoMedioRespostaGeral: 0
  };
}

// Buscar métricas de conversão em tempo real
export async function buscarMetricasConversao(tenantId: string) {
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('etapa_atual, created_at, assigned_agent_name, first_interaction_at, final_sale_value')
      .eq('tenant_id', tenantId)
      .filter('archived_at', 'is', null);

    if (error) throw error;

    if (!leads || leads.length === 0) {
      return {
        taxaConversaoGeral: 0,
        taxaAtendimento: 0,
        totalLeads: 0,
        leadsConvertidos: 0,
        leadsAtendidos: 0,
        conversaoPorEtapa: []
      };
    }

    const totalLeads = leads.length;
    
    // Definir estágios do funil
    const estagios = [
      { nome: 'Lead', condicao: (l: any) => true },
      { nome: 'Interação', condicao: (l: any) => l.first_interaction_at || l.etapa_atual?.includes('Interação') },
      { nome: 'Reunião', condicao: (l: any) => l.etapa_atual?.includes('Reunião') || l.etapa_atual?.includes('Visita') },
      { nome: 'Venda', condicao: (l: any) => l.etapa_atual?.includes('Venda') || l.etapa_atual?.includes('Concluído') || l.final_sale_value > 0 }
    ];

    // Calcular quantidade por estágio
    const conversaoPorEtapa = estagios.map(estagio => {
      const quantidade = leads.filter(estagio.condicao).length;
      const taxaConversao = estagio.nome === 'Lead' ? 100 : calcularTaxaConversao(quantidade, totalLeads);
      
      return {
        etapa: estagio.nome,
        quantidade,
        taxa: taxaConversao
      };
    });

    // Calcular métricas gerais
    const leadsConvertidos = conversaoPorEtapa[3]?.quantidade || 0; // Vendas
    const leadsAtendidos = conversaoPorEtapa[1]?.quantidade || 0; // Interações
    
    const taxaConversaoGeral = calcularTaxaConversao(leadsConvertidos, totalLeads);
    const taxaAtendimento = calcularTaxaAtendimento(leadsAtendidos, totalLeads);

    return {
      taxaConversaoGeral,
      taxaAtendimento,
      totalLeads,
      leadsConvertidos,
      leadsAtendidos,
      conversaoPorEtapa
    };

  } catch (error) {
    console.error('Erro ao buscar métricas de conversão:', error);
    return {
      taxaConversaoGeral: 0,
      taxaAtendimento: 0,
      totalLeads: 0,
      leadsConvertidos: 0,
      leadsAtendidos: 0,
      conversaoPorEtapa: []
    };
  }
}

// Buscar todas as métricas de corretores (compatibilidade)
export async function buscarTodasMetricasCorretores() {
  // Implementação placeholder para compatibilidade
  return [];
}
