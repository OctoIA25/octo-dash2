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
import {
  buscarKPIsEquipeCentral,
  buscarLeadsPorEquipeCentral,
  buscarMetricasGeraisCentral,
  buscarMetricasPorEquipeCentral,
} from './teamMetricsService';

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


// Buscar KPIs gerais da equipe
export async function buscarKPIsEquipe(tenantId: string): Promise<KPIsEquipe> {
  return buscarKPIsEquipeCentral(tenantId);
}

// Buscar métricas por equipe
export async function buscarMetricasPorEquipe(
  tenantId: string,
  mes?: number,
  ano?: number
): Promise<MetricasEquipe[]> {
  const mesAlvo = mes || new Date().getMonth() + 1;
  const anoAlvo = ano || new Date().getFullYear();
  const dataInicio = new Date(anoAlvo, mesAlvo - 1, 1);
  const dataFim = new Date(anoAlvo, mesAlvo, 0);
  const metricas = await buscarMetricasPorEquipeCentral(tenantId, dataInicio, dataFim);

  return metricas.map(({ equipe, tempoMedio, cor }) => ({
    equipe,
    tempoMedio,
    cor,
  }));
}

// Buscar leads por equipe
export async function buscarLeadsPorEquipe(tenantId: string): Promise<LeadsPorEquipe[]> {
  return buscarLeadsPorEquipeCentral(tenantId);
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
  return buscarMetricasGeraisCentral();
}

// Buscar métricas de conversão em tempo real
export async function buscarMetricasConversao(tenantId: string) {
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('etapa_atual, created_at, assigned_agent_name, first_response_at, final_sale_value')
      .eq('tenant_id', tenantId)
      .is('archived_at', null);

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
      { nome: 'Interação', condicao: (l: any) => l.first_response_at || l.etapa_atual?.includes('Interação') },
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
