/**
 * Hook para dados de relatórios em tempo real
 * Substitui dados mockados por dados reais do banco
 */

import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import {
  buscarKPIsGerais,
  buscarRankingCorretores,
  buscarMetricasIndividuaisLeads,
  buscarMetricasIndividuaisVendas,
  buscarVendasPorFonte,
  buscarVendasPorFaixa,
  type KPIsGerais,
  type MetricasIndividuais,
  type MetricasIndividuaisLeads,
  type MetricasIndividuaisVendas,
  type VendasPorFonte,
  type VendasPorFaixa,
} from '../services/relatoriosService';
import { buscarMetricasPorEquipe } from '@/features/metricas/services/enhancedMetricsService';
import {
  buscarRankingCorretoresComercial,
  tenantTemVendasComerciais,
  type CommercialSalesBrokerRanking,
} from '@/features/metricas/services/commercialSalesService';

type RankingPeriodo = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

function getMesReferenciaComercial(mes: number, periodo: RankingPeriodo): number | number[] | undefined {
  if (periodo === 'monthly') return mes;
  if (periodo === 'quarterly') {
    const startMonth = (Math.ceil(mes / 3) - 1) * 3 + 1;
    return [startMonth, startMonth + 1, startMonth + 2];
  }
  if (periodo === 'semiannual') {
    return mes <= 6 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
  }

  return undefined;
}

function avatarSlug(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function mapRankingComercial(ranking: CommercialSalesBrokerRanking[]): MetricasIndividuais[] {
  return ranking
    .map((item) => ({
      corretor: item.corretor,
      valorComissao: Number(item.comissaoTotal || 0),
      vendasFeitas: Number(item.vendasFeitas || 0),
      gestaoAtiva: 0,
      ranking: 0,
      fotoUrl: item.fotoUrl || `/avatars/${avatarSlug(item.corretor)}.jpg`,
    }))
    .sort((a, b) => b.valorComissao - a.valorComissao)
    .map((item, index) => ({
      ...item,
      ranking: index + 1,
    }));
}

/**
 * Período dos KPIs. Sem ele os cards eram o acumulado do tenant enquanto o
 * cabeçalho do relatório anunciava um intervalo — o número não batia com a
 * legenda em nenhuma tela nem no PDF exportado.
 */
interface PeriodoKPIs {
  inicio: string;
  fim: string;
}

const PERIODO_PADRAO: PeriodoKPIs = {
  inicio: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  fim: format(new Date(), 'yyyy-MM-dd'),
};

export const useRelatorios = (periodo: PeriodoKPIs = PERIODO_PADRAO) => {
  const { tenantId } = useAuth();
  
  // Estados para dados reais
  const [kpisGerais, setKpisGerais] = useState<KPIsGerais | null>(null);
  const [rankingCorretores, setRankingCorretores] = useState<MetricasIndividuais[]>([]);
  const [vendasPorFonte, setVendasPorFonte] = useState<VendasPorFonte[]>([]);
  const [vendasPorFaixa, setVendasPorFaixa] = useState<VendasPorFaixa[]>([]);
  const [metricasEquipes, setMetricasEquipes] = useState<any[]>([]);

  // Estados para métricas individuais
  const [metricasIndLeads, setMetricasIndLeads] = useState<MetricasIndividuaisLeads | null>(null);
  const [metricasIndVendas, setMetricasIndVendas] = useState<MetricasIndividuaisVendas | null>(null);
  
  // Estados de loading
  const [loading, setLoading] = useState(true);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [loadingMetricasInd, setLoadingMetricasInd] = useState(false);
  
  // Filtros
  const [rankingAno, setRankingAno] = useState(new Date().getFullYear());
  const [rankingMes, setRankingMes] = useState(new Date().getMonth() + 1);
  const [rankingPeriodo, setRankingPeriodo] = useState<'monthly' | 'quarterly' | 'semiannual' | 'yearly'>('yearly');
  const [metricasIndCorretor, setMetricasIndCorretor] = useState('');
  const [metricasIndDataInicial, setMetricasIndDataInicial] = useState(() =>
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [metricasIndDataFinal, setMetricasIndDataFinal] = useState(() =>
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );

  // Carregar dados gerais
  const { inicio, fim } = periodo;

  useEffect(() => {

    const carregarDadosGerais = async () => {
      if (!tenantId) return;
      
      setLoading(true);
      try {
        // Estas 4 consultas são independentes (dependem apenas de tenantId e do
        // período, nenhuma usa o resultado da outra). Buscamos em PARALELO: a
        // latência passa a ser a da consulta mais lenta, não a soma das 4.
        // Contagens de venda/VGV/VGC vêm dentro de buscarKPIsGerais — uma única
        // leitura de `proposals` serve os dois blocos de cards.
        const [
          metricasEquipesData,
          kpis,
          fonteData,
          faixaData,
        ] = await Promise.all([
          buscarMetricasPorEquipe(tenantId),
          buscarKPIsGerais(tenantId, inicio, fim),
          buscarVendasPorFonte(tenantId),
          buscarVendasPorFaixa(tenantId),
        ]);

        setMetricasEquipes(metricasEquipesData);
        setKpisGerais(kpis);
        setVendasPorFonte(fonteData);
        setVendasPorFaixa(faixaData);
      } catch (error) {
        console.error('Erro ao carregar dados gerais dos relatórios:', error);
        // Sem dado real não há número para mostrar: a tela exibe "—", nunca um
        // valor inventado (o fallback mockado de 1247 leads saiu daqui).
        setKpisGerais(null);
      } finally {
        setLoading(false);
      }
    };
    
    carregarDadosGerais();
    
    // Forçar refresh a cada 30 segundos
    const interval = setInterval(carregarDadosGerais, 30000);
    
    return () => clearInterval(interval);
  }, [tenantId, inicio, fim]);

  // Carregar ranking de corretores
  useEffect(() => {
    const carregarRanking = async () => {
      if (!tenantId) return;
      setLoadingRanking(true);
      try {
        let rankingComercial: MetricasIndividuais[] = [];

        try {
          const mesReferencia = getMesReferenciaComercial(rankingMes, rankingPeriodo);
          const comercial = await buscarRankingCorretoresComercial(tenantId, rankingAno, mesReferencia);
          rankingComercial = mapRankingComercial(comercial);
        } catch (error) {
          console.warn('Ranking comercial indisponível, usando fallback por leads:', error);
        }

        if (rankingComercial.length > 0) {
          setRankingCorretores(rankingComercial);
          return;
        }

        const tenantUsaRankingComercial = await tenantTemVendasComerciais(tenantId);
        if (tenantUsaRankingComercial) {
          setRankingCorretores([]);
          return;
        }

        const ranking = await buscarRankingCorretores(tenantId, rankingAno, rankingMes, rankingPeriodo);
        setRankingCorretores(ranking);
      } catch (error) {
        console.error('Erro ao carregar ranking de corretores:', error);
      } finally {
        setLoadingRanking(false);
      }
    };
    
    carregarRanking();
  }, [tenantId, rankingAno, rankingMes, rankingPeriodo]);


  // Carregar métricas individuais
  useEffect(() => {
    const carregarMetricasIndividuais = async () => {
      if (!tenantId || !metricasIndCorretor || !metricasIndDataInicial || !metricasIndDataFinal) return;
      
      setLoadingMetricasInd(true);
      try {
        // Carregar métricas de leads
        const leadsData = await buscarMetricasIndividuaisLeads(
          tenantId,
          metricasIndCorretor,
          metricasIndDataInicial,
          metricasIndDataFinal
        );
        setMetricasIndLeads(leadsData);
        
        // Carregar métricas de vendas
        const vendasData = await buscarMetricasIndividuaisVendas(
          tenantId,
          metricasIndCorretor,
          metricasIndDataInicial,
          metricasIndDataFinal
        );
        setMetricasIndVendas(vendasData);
        
      } catch (error) {
        console.error('Erro ao carregar métricas individuais:', error);
      } finally {
        setLoadingMetricasInd(false);
      }
    };
    
    carregarMetricasIndividuais();
  }, [tenantId, metricasIndCorretor, metricasIndDataInicial, metricasIndDataFinal]);

  // Nem KPI nem ranking usam mock: sem dado real, `kpis` é null e a tela mostra
  // "—". Um número inventado no lugar de um erro é pior que a ausência dele.
  const kpis = kpisGerais;
  const ranking = rankingCorretores;

  return {
    // Dados
    kpis,
    ranking,
    vendasPorFonte,
    vendasPorFaixa,
    metricasIndLeads,
    metricasIndVendas,
    metricasEquipes,

    
    // Loading states
    loading,
    loadingRanking,
    loadingMetricasInd,
    
    // Filtros
    rankingAno,
    rankingMes,
    rankingPeriodo,
    metricasIndCorretor,
    metricasIndDataInicial,
    metricasIndDataFinal,
    
    // Actions
    setRankingAno,
    setRankingMes,
    setRankingPeriodo,
    setMetricasIndCorretor,
    setMetricasIndDataInicial,
    setMetricasIndDataFinal,
    
    // Flags para saber se estamos usando dados reais
    usandoDadosReaisKPIs: !!kpisGerais,
    usandoDadosReaisRanking: rankingCorretores.length > 0,
    usandoDadosReaisVendasPorFonte: vendasPorFonte.length > 0,
    usandoDadosReaisVendasPorFaixa: vendasPorFaixa.length > 0,
  };
};
