/**
 * 📊 SERVIÇO DE MÉTRICAS
 * 
 * Busca métricas reais do sistema para o dashboard de gestão de equipe
 * Integra dados do bolsão de leads para calcular tempo médio de resposta
 */

import { calcularMetricasCorretores, CorretorMetrica } from '@/features/leads/services/bolsaoService';

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
 * Mapeamento de corretores para equipes
 * TODO: Buscar isso do Supabase na tabela de equipes
 */
const MAPEAMENTO_EQUIPES: Record<string, { equipe: string; cor: string }> = {
  // Equipe Verde
  'Felipe Martins': { equipe: 'Equipe Verde', cor: '#22c55e' },
  'Ana Silva': { equipe: 'Equipe Verde', cor: '#22c55e' },
  'João Santos': { equipe: 'Equipe Verde', cor: '#22c55e' },
  
  // Equipe Amarela
  'Mariana Mamede': { equipe: 'Equipe Amarela', cor: '#eab308' },
  'Carlos Souza': { equipe: 'Equipe Amarela', cor: '#eab308' },
  'Julia Costa': { equipe: 'Equipe Amarela', cor: '#eab308' },
  
  // Equipe Vermelha
  'Felipe Camargo': { equipe: 'Equipe Vermelha', cor: '#ef4444' },
  'Pedro Lima': { equipe: 'Equipe Vermelha', cor: '#ef4444' },
  'Camila Oliveira': { equipe: 'Equipe Vermelha', cor: '#ef4444' },
};

/**
 * Busca métricas gerais de tempo de resposta
 */
export async function buscarMetricasGerais(
  dataInicio?: Date,
  dataFim?: Date
): Promise<MetricasGerais> {
  try {
    
    const metricasCorretores = await calcularMetricasCorretores(dataInicio, dataFim);
    
    if (metricasCorretores.length === 0) {
      return {
        tempoMedioRespostaGeral: 0,
        totalLeadsAssumidos: 0,
        taxaAtendimentoGeral: 0
      };
    }
    
    // Calcular média geral
    const somaTempo = metricasCorretores.reduce((acc, m) => acc + m.tempoMedioResposta, 0);
    const somaLeads = metricasCorretores.reduce((acc, m) => acc + m.totalLeadsAssumidos, 0);
    const somaAtendidos = metricasCorretores.reduce((acc, m) => acc + m.leadsAtendidos, 0);
    
    const tempoMedioGeral = Math.round(somaTempo / metricasCorretores.length);
    const taxaAtendimentoGeral = somaLeads > 0 
      ? Math.round((somaAtendidos / somaLeads) * 100)
      : 0;
    
    
    return {
      tempoMedioRespostaGeral: tempoMedioGeral,
      totalLeadsAssumidos: somaLeads,
      taxaAtendimentoGeral
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar métricas gerais:', error);
    return {
      tempoMedioRespostaGeral: 0,
      totalLeadsAssumidos: 0,
      taxaAtendimentoGeral: 0
    };
  }
}

/**
 * Busca métricas de tempo de resposta por equipe
 */
export async function buscarMetricasPorEquipe(
  dataInicio?: Date,
  dataFim?: Date
): Promise<MetricasEquipe[]> {
  try {
    
    const metricasCorretores = await calcularMetricasCorretores(dataInicio, dataFim);
    
    if (metricasCorretores.length === 0) {
      return [];
    }
    
    // Agrupar métricas por equipe
    const equipeMap = new Map<string, {
      tempoTotal: number;
      count: number;
      cor: string;
      corretores: string[];
    }>();
    
    metricasCorretores.forEach(metrica => {
      const equipaInfo = MAPEAMENTO_EQUIPES[metrica.corretor];
      
      if (equipaInfo) {
        const nomeEquipe = equipaInfo.equipe;
        
        if (!equipeMap.has(nomeEquipe)) {
          equipeMap.set(nomeEquipe, {
            tempoTotal: 0,
            count: 0,
            cor: equipaInfo.cor,
            corretores: []
          });
        }
        
        const equipeData = equipeMap.get(nomeEquipe)!;
        equipeData.tempoTotal += metrica.tempoMedioResposta;
        equipeData.count += 1;
        equipeData.corretores.push(metrica.corretor);
      } else {
        // Corretores sem equipe definida vão para "Equipe Geral"
        const nomeEquipe = 'Equipe Geral';
        
        if (!equipeMap.has(nomeEquipe)) {
          equipeMap.set(nomeEquipe, {
            tempoTotal: 0,
            count: 0,
            cor: '#6b7280', // Cinza
            corretores: []
          });
        }
        
        const equipeData = equipeMap.get(nomeEquipe)!;
        equipeData.tempoTotal += metrica.tempoMedioResposta;
        equipeData.count += 1;
        equipeData.corretores.push(metrica.corretor);
      }
    });
    
    // Converter Map para array de métricas
    const metricas: MetricasEquipe[] = Array.from(equipeMap.entries()).map(
      ([equipe, data]) => ({
        equipe,
        tempoMedio: Math.round(data.tempoTotal / data.count),
        cor: data.cor,
        corretores: data.corretores
      })
    );
    
    // Ordenar por tempo médio (mais rápido primeiro)
    metricas.sort((a, b) => a.tempoMedio - b.tempoMedio);
    
    
    return metricas;
    
  } catch (error) {
    console.error('❌ Erro ao buscar métricas por equipe:', error);
    return [];
  }
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
    
    if (metrica) {
    } else {
    }
    
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
    
    const metricas = await calcularMetricasCorretores(dataInicio, dataFim);
    
    
    return metricas;
    
  } catch (error) {
    console.error('❌ Erro ao buscar métricas de corretores:', error);
    return [];
  }
}
