/**
 * 📊 SERVIÇO DE MÉTRICAS
 * 
 * Busca métricas reais do sistema para o dashboard de gestão de equipe
 * Integra dados do bolsão de leads para calcular tempo médio de resposta
 */

import { calcularMetricasCorretores, CorretorMetrica } from '@/features/leads/services/bolsaoService';
import { supabase } from '@/lib/supabaseClient';
import { canonicalizeFonteCounts } from '@/data/realLeadsProcessor';
import { useAuth } from '@/hooks/useAuth';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  calcularPercentual,
  calcularVariacaoPercentual,
  calcularTaxaConversao,
  calcularTaxaAtendimento,
  calcularProgressoVisual,
  formatarVariacaoPercentual,
  type VariacoesPercentuais as VariacoesPercentuaisType
} from './percentageService';
import {
  buscarKPIsEquipeCentral,
  buscarLeadsPorEquipeCentral,
  buscarMetricasCorretoresCentral,
  buscarMetricasGeraisCentral,
  buscarMetricasPorEquipeCentral,
  buscarVariacoesPercentuaisEquipeCentral,
  limparCacheTeamMetrics,
} from './teamMetricsService';

/**
 * Interface para métricas de tempo de resposta por equipe
 */
export interface MetricasEquipe {
  equipe: string;
  tempoMedio: number; // em minutos
  cor: string;
  corretores: string[];
}

/**
 * Interface para métricas gerais da equipe
 */
export interface MetricasGerais {
  tempoMedioRespostaGeral: number; // em minutos
  totalLeadsAssumidos: number;
  taxaAtendimentoGeral: number; // percentual
}

/**
 * Interface para KPIs da equipe
 */
export interface KPIsEquipe {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number;
}

/**
 * Interface para variações percentuais
 * Re-exportando do percentageService para compatibilidade
 */
export type VariacoesPercentuais = VariacoesPercentuaisType;

/**
 * Limpa o cache do mapeamento de equipes
 */
export function limparCacheMapeamentoEquipes(): void {
  limparCacheTeamMetrics();
}

/**
 * Calcula métricas de tempo de resposta usando a tabela leads principal
 */
export async function calcularMetricasCorretoresFromLeads(
  dataInicio?: Date,
  dataFim?: Date,
  tenantId?: string
): Promise<CorretorMetrica[]> {
  return buscarMetricasCorretoresCentral(dataInicio, dataFim, tenantId) as Promise<CorretorMetrica[]>;
}

/**
 * Busca métricas gerais de tempo de resposta
 */
export async function buscarMetricasGerais(
  dataInicio?: Date,
  dataFim?: Date,
  tenantId?: string
): Promise<MetricasGerais> {
  return buscarMetricasGeraisCentral(dataInicio, dataFim, tenantId);
}

/**
 * Busca métricas de tempo de resposta por equipe
 */
export async function buscarMetricasPorEquipe(
  dataInicio?: Date,
  dataFim?: Date,
  tenantId?: string
): Promise<MetricasEquipe[]> {
  return buscarMetricasPorEquipeCentral(tenantId, dataInicio, dataFim);
}

/**
 * Busca métrica de tempo de resposta para um corretor específico
 */
export async function buscarMetricaCorretor(
  nomeCorretor: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<CorretorMetrica | null> {
  try {

    const metricasCorretores = await calcularMetricasCorretores(dataInicio, dataFim);

    const metrica = metricasCorretores.find(m => m.corretor === nomeCorretor);

    return metrica || null;

  } catch (error) {
    console.error(`❌ Erro ao buscar métrica do corretor ${nomeCorretor}:`, error);
    return null;
  }
}

/**
 * Busca todas as métricas de corretores
 */
export async function buscarTodasMetricasCorretores(
  dataInicio?: Date,
  dataFim?: Date
): Promise<CorretorMetrica[]> {
  try {

    const metricas = await calcularMetricasCorretoresFromLeads(dataInicio, dataFim);


    return metricas;

  } catch (error) {
    console.error('?? Erro ao buscar métricas de corretores:', error);
    return [];
  }
}

/**
 * Busca contagem de leads por equipe do tenant
 */
export async function buscarLeadsPorEquipe(tenantId?: string): Promise<{ equipe: string; quantidade: number; cor: string }[]> {
  return buscarLeadsPorEquipeCentral(tenantId);
}

/**
 * Busca distribuição de exclusivo vs ficha
 */
export async function buscarDistribuicaoExclusivoFicha(tenantId?: string): Promise<{ tipo: string; quantidade: number; percentual: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads do tenant
    const { data: leads, error } = await supabase
      .from('leads' as any)
      .select('is_exclusive')
      .eq('tenant_id', tenantId)
      .is('archived_at', null);

    if (error || !leads) return [];

    // Contar exclusivo vs ficha
    const exclusivo = (leads as any[]).filter(l => l.is_exclusive === true).length;
    const ficha = (leads as any[]).filter(l => l.is_exclusive === false).length;
    const total = exclusivo + ficha;

    if (total === 0) return [];

    return [
      {
        tipo: 'Exclusivo',
        quantidade: exclusivo,
        percentual: Math.round((exclusivo / total) * 100 * 10) / 10
      },
      {
        tipo: 'Ficha',
        quantidade: ficha,
        percentual: Math.round((ficha / total) * 100 * 10) / 10
      }
    ];
  } catch (error) {
    console.error('❌ Erro ao buscar distribuição exclusivo/ficha:', error);
    return [];
  }
}

/**
 * Busca negócios fechados por fonte
 */
export async function buscarNegociosFechadosPorFonte(tenantId?: string): Promise<{ fonte: string; quantidade: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads finalizados do tenant dos últimos 6 meses
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    const { data: leads, error } = await supabase
      .from('leads' as any)
      .select('source, final_sale_value, created_at')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .not('final_sale_value', 'is', null)
      .gt('final_sale_value', 0)
      .gte('created_at', seisMesesAtras.toISOString());

    if (error || !leads) {
      console.error('Erro ou sem leads finalizados:', error);
      return [];
    }

    // Contar por fonte (deduplicando variações de capitalização)
    const fonteCount = canonicalizeFonteCounts(
      (leads as any[]).map(lead => lead.source || 'Outros')
    );

    const resultado = Array.from(fonteCount.entries()).map(([fonte, quantidade]) => ({
      fonte,
      quantidade
    }));

    return resultado;
  } catch (error) {
    console.error('❌ Erro ao buscar negócios fechados por fonte:', error);
    return [];
  }
}

/**
 * Busca vendas por faixa de preço por mês
 */
export async function buscarVendasPorFaixa(tenantId?: string): Promise<{ mes: string; ate_500k: number; de_500k_999k: number; acima_1m: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar leads finalizados do tenant
    const { data: leads, error } = await supabase
      .from('leads' as any)
      .select('final_sale_value, created_at')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .not('final_sale_value', 'is', null)
      .gt('final_sale_value', 0)
      .order('created_at', { ascending: true });

    if (error || !leads) return [];

    // Agrupar por mês e faixa de preço
    const vendasPorMes = new Map<string, { ate_500k: number; de_500k_999k: number; acima_1m: number }>();

    (leads as any[]).forEach(lead => {
      const valor = lead.final_sale_value;
      const mes = new Date(lead.created_at).toLocaleString('pt-BR', { month: 'short' });

      if (!vendasPorMes.has(mes)) {
        vendasPorMes.set(mes, { ate_500k: 0, de_500k_999k: 0, acima_1m: 0 });
      }

      const dados = vendasPorMes.get(mes)!;
      if (valor < 500000) {
        dados.ate_500k++;
      } else if (valor < 1000000) {
        dados.de_500k_999k++;
      } else {
        dados.acima_1m++;
      }
    });

    return Array.from(vendasPorMes.entries()).map(([mes, dados]) => ({
      mes,
      ...dados
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar vendas por faixa:', error);
    return [];
  }
}

/**
 * Busca evolução de ativações de imóveis por mês
 */
export async function buscarEvolucaoAtivacoes(tenantId?: string): Promise<{ mes: string; quantidade: number }[]> {
  try {
    if (!tenantId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: membership } = await supabase
        .from('tenant_memberships' as any)
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) return [];
      tenantId = (membership as any).tenant_id;
    }

    // Buscar imóveis do tenant dos últimos 6 meses
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    const { data: imoveis, error } = await supabase
      .from('imoveis_locais' as any)
      .select('created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', seisMesesAtras.toISOString())
      .order('created_at', { ascending: true });

    if (error || !imoveis) {
      console.error('Erro ou sem imóveis:', error);
      return [];
    }

    // Agrupar por mês
    const ativacoesPorMes = new Map<string, number>();

    (imoveis as any[]).forEach(imovel => {
      const mes = new Date(imovel.created_at).toLocaleString('pt-BR', { month: 'short' });
      ativacoesPorMes.set(mes, (ativacoesPorMes.get(mes) || 0) + 1);
    });

    const resultado = Array.from(ativacoesPorMes.entries()).map(([mes, quantidade]) => ({
      mes,
      quantidade
    }));

    return resultado;
  } catch (error) {
    console.error('?? Erro ao buscar evolução de ativações:', error);
    return [];
  }
}




/**
 * Busca KPIs reais da equipe
 */
export async function buscarKPIsEquipe(tenantId?: string): Promise<KPIsEquipe> {
  try {
    return await buscarKPIsEquipeCentral(tenantId);

  } catch (error) {
    console.error('?? Erro ao buscar KPIs da equipe:', error);
    return getDefaultKPIs();
  }
}

/**
 * Busca variações percentuais comparando mês atual vs mês anterior
 */
export async function buscarVariacoesPercentuais(tenantId?: string): Promise<VariacoesPercentuais> {
  try {
    return await buscarVariacoesPercentuaisEquipeCentral(tenantId);
  } catch (error) {
    console.error('Erro ao calcular variações percentuais:', error);
    return getDefaultVariacoes();
  }
}

/**
 * Retorna variações padrão caso ocorra erro
 */
function getDefaultVariacoes(): VariacoesPercentuais {
  return {
    vendasCriadas: 0,
    vendasAssinadas: 0,
    imoveisAtivos: 0,
    totalLeadsMes: 0,
    valorTotalVendasMes: 0,
    tempoMedioRespostaGeral: 0
  };
}

/**
 * Retorna KPIs padrão caso ocorra erro
 */
function getDefaultKPIs(): KPIsEquipe {
  return {
    vendasCriadas: 0,
    vendasAssinadas: 0,
    imoveisAtivos: 0,
    totalLeadsMes: 0,
    valorTotalVendasMes: 0,
    tempoMedioRespostaGeral: 0
  };
}
