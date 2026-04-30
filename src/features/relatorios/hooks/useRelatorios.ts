/**
 * Hook para dados de relatórios em tempo real
 * Substitui dados mockados por dados reais do banco
 */

import { useState, useEffect, useMemo } from 'react';
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
  buscarVendasCriadas,
  buscarVendasAssinadas,
  buscarTotalLeadsMensal,
  buscarImoveisAtivos,
  buscarValorTotal,
} from '../services/relatoriosService';
import { buscarMetricasPorEquipe } from '@/features/metricas/services/enhancedMetricsService';

export const useRelatorios = () => {
  const { tenantId } = useAuth();
  
  // Estados para dados reais
  const [kpisGerais, setKpisGerais] = useState<KPIsGerais | null>(null);
  const [rankingCorretores, setRankingCorretores] = useState<MetricasIndividuais[]>([]);
  const [vendasPorFonte, setVendasPorFonte] = useState<VendasPorFonte[]>([]);
  const [vendasPorFaixa, setVendasPorFaixa] = useState<VendasPorFaixa[]>([]);
  const [vendasCriadas, setVendasCriadas ] = useState<number>(0);
  const [vendasAssinadas, setVendasAssinadas] = useState<number>(0);
  const [totalLeadsMensal, setTotalLeadsMensal] = useState<number>(0);
  const [imoveisAtivos, setImoveisAtivos] = useState<number>(0);
  const [valorTotal, setValorTotal] = useState<number>(0);
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
  const [rankingPeriodo, setRankingPeriodo] = useState<'monthly' | 'quarterly' | 'semiannual' | 'yearly'>('monthly');
  const [metricasIndCorretor, setMetricasIndCorretor] = useState('');
  const [metricasIndDataInicial, setMetricasIndDataInicial] = useState('');
  const [metricasIndDataFinal, setMetricasIndDataFinal] = useState('');

  // Carregar dados gerais
  useEffect(() => {

    const carregarDadosGerais = async () => {
      if (!tenantId) return;
      
      setLoading(true);
      try {


        const vendasCriadasData = await buscarVendasCriadas(tenantId);
        setVendasCriadas(vendasCriadasData);

        const vendasAssinadas = await buscarVendasAssinadas(tenantId);
        setVendasAssinadas(vendasAssinadas);
        
        // Carregar métricas por equipe
        const metricasEquipesData = await buscarMetricasPorEquipe(tenantId);
        setMetricasEquipes(metricasEquipesData);
        
        // Carregar KPIs gerais
        const kpis = await buscarKPIsGerais(tenantId);
        setKpisGerais(kpis);
        
        // Carregar vendas por fonte
        const fonteData = await buscarVendasPorFonte(tenantId);
        setVendasPorFonte(fonteData);
        
        // Carregar vendas por faixa
        const faixaData = await buscarVendasPorFaixa(tenantId);
        setVendasPorFaixa(faixaData);
        
        // Carregar total de leads mensal
        const totalLeadsMensal = await buscarTotalLeadsMensal(tenantId);
        setTotalLeadsMensal(totalLeadsMensal);
        
        // Carregar valor total
        const valorTotal = await buscarValorTotal(tenantId);
        setValorTotal(valorTotal);

        // Carregar imoveis ativos
        const imoveisAtivos = await buscarImoveisAtivos(tenantId);
        setImoveisAtivos(Number(imoveisAtivos));
        
      } catch (error) {
        console.error('Erro ao carregar dados gerais dos relatórios:', error);
      } finally {
        setLoading(false);
      }
    };
    
    carregarDadosGerais();
    
    // Forçar refresh a cada 30 segundos
    const interval = setInterval(carregarDadosGerais, 30000);
    
    return () => clearInterval(interval);
  }, [tenantId]);

  // Carregar ranking de corretores
  useEffect(() => {
    const carregarRanking = async () => {
      if (!tenantId) return;
      
      setLoadingRanking(true);
      try {
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

  // Dados mockados como fallback (se não houver dados reais)
  const kpisMock = useMemo(() => ({
    totalLeadsRecebidos: 1247,
    totalLeadsInteragidos: 1015,
    mediaInteracaoDia: 81.41,
    mediaTempoPrimeiraInteracao: 26,
    totalLeadsConvertidos: 187,
  }), []);

  const rankingMock = useMemo(() => [
    {
      corretor: 'ANA E KARLA',
      valorComissao: 42005,
      vendasFeitas: 4,
      gestaoAtiva: 0,
      ranking: 1,
      fotoUrl: '/avatars/ana_e_karla.jpg'
    },
    {
      corretor: 'BARBARA FABRICIO',
      valorComissao: 26380,
      vendasFeitas: 3,
      gestaoAtiva: 0,
      ranking: 2,
      fotoUrl: '/avatars/barbara_fabricio.jpg'
    },
    {
      corretor: 'FELIPE MARTINS',
      valorComissao: 19050,
      vendasFeitas: 5,
      gestaoAtiva: 0,
      ranking: 3,
      fotoUrl: '/avatars/felipe_martins.jpg'
    }
  ], []);

  // Usar dados reais ou fallback para mockados
  const kpis = kpisGerais || kpisMock;
  const ranking = rankingCorretores.length > 0 ? rankingCorretores : rankingMock;

  return {
    // Dados
    kpis,
    ranking,
    vendasPorFonte,
    vendasPorFaixa,
    metricasIndLeads,
    metricasIndVendas,
    vendasCriadas,
    vendasAssinadas,
    metricasEquipes,
    totalLeadsMensal,
    valorTotal,
    imoveisAtivos,

    
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
