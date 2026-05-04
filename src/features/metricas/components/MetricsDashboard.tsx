/**

 * Dashboard de Métricas com Chart.js

 * Versão otimizada usando Chart.js ao invés de Recharts

 */



import { useState, useMemo, useEffect } from 'react';
import { format, endOfYear, startOfYear } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';

import {
  TrendingUp,
  CheckCircle,
  Home,
  Users,
  DollarSign,
  Target,
  Activity,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Clock,
  Zap

} from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Bar, Doughnut, Line } from 'react-chartjs-2';

import {

  Chart as ChartJS,

  CategoryScale,

  LinearScale,

  BarElement,

  ArcElement,

  LineElement,

  PointElement,

  Filler,

  Title as ChartTitle,

  Tooltip,

  Legend

} from 'chart.js';



// Registrar componentes do Chart.js

ChartJS.register(

  CategoryScale,

  LinearScale,

  BarElement,

  ArcElement,

  LineElement,

  PointElement,

  Filler,

  ChartTitle,

  Tooltip,

  Legend

);



// Componentes da Aba 2

import { CorretorMetricCard } from '@/components/metrics/individual';



// Dados estáticos

import {

  corretoresData,

  equipesOptions,

  formatarMoeda,

  leadsPorEquipeData,

  vendasPorFaixaData,

  distribuicaoExclusivoFichaData,

  evolucaoAtivacaoData,

  negocioFechadoPorFonteData,

  tempoRespostaPorEquipeData,

  chartColors

} from '@/data/metricsData';



import type { CorretorMetricasCompletas, EquipeOption } from '@/types/metricsTypes';

import {

  buscarMetricasGerais,

  buscarMetricasPorEquipe,

  buscarTodasMetricasCorretores,

  buscarLeadsPorEquipe,

  buscarDistribuicaoExclusivoFicha,

  buscarNegociosFechadosPorFonte,

  buscarVendasPorFaixa,

  buscarEvolucaoAtivacoes,

  buscarKPIsEquipe,

  buscarVariacoesPercentuais

} from '@/features/metricas/services/metricsService';

import type { MetricasEquipe, VariacoesPercentuais, KPIsEquipe } from '@/features/metricas/services/metricsService';

import { useAuthContext } from '@/contexts/AuthContext';

import { useRelatorios } from '@/features/relatorios/hooks/useRelatorios';
import {
  buscarMetricasIndividuaisLeads,
  buscarMetricasIndividuaisVendas,
  buscarRankingCorretores,
} from '@/features/relatorios/services/relatoriosService';
import { buildCorretorMetricasCompletas } from '@/features/relatorios/utils/buildCorretorMetricasCompletas';
import { fetchTeams, type Team } from '@/features/corretores/services/teamsManagementService';

export const MetricsDashboard = () => {

  const { tenantId } = useAuthContext();

  const relatoriosData = useRelatorios();
  const { vendasCriadas: vendasCriadasRelatorio, vendasAssinadas: vendasAssinadasRelatorio, metricasEquipes: metricasEquipesRelatorio, totalLeadsMensal, valorTotal, imoveisAtivos: imoveisAtivosRelatorio } = relatoriosData;

  const [loading, setLoading] = useState(true);

  const [filtroEquipe, setFiltroEquipe] = useState<EquipeOption>('todas');

  // ... (rest of the code remains the same)


  // Estados para dados reais do bolsão

  const [tempoMedioGeralReal, setTempoMedioGeralReal] = useState<number | null>(null);

  const [metricasEquipesReais, setMetricasEquipesReais] = useState<MetricasEquipe[]>([]);

  const [metricasCorretoresReais, setMetricasCorretoresReais] = useState<Map<string, number>>(new Map());

  const [corretoresIndividuaisReais, setCorretoresIndividuaisReais] = useState<CorretorMetricasCompletas[] | null>(null);

  const [loadingIndividuais, setLoadingIndividuais] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);



  // Estados para dados reais de outros gráficos

  const [leadsPorEquipeReal, setLeadsPorEquipeReal] = useState<{ equipe: string; quantidade: number; cor: string }[]>([]);

  const [distribuicaoExclusivoFichaReal, setDistribuicaoExclusivoFichaReal] = useState<{ tipo: string; quantidade: number; percentual: number }[]>([]);

  const [negociosFechadosPorFonteReal, setNegociosFechadosPorFonteReal] = useState<{ fonte: string; quantidade: number }[]>([]);

  const [vendasPorFaixaReal, setVendasPorFaixaReal] = useState<{ mes: string; ate_500k: number; de_500k_999k: number; acima_1m: number }[]>([]);

  const [evolucaoAtivacoesReal, setEvolucaoAtivacoesReal] = useState<{ mes: string; quantidade: number }[]>([]);



  // Estado para KPIs reais

  const [kpisReais, setKpisReais] = useState<KPIsEquipe | null>(null);



  // Estado para variações percentuais

  const [variacoes, setVariacoes] = useState<VariacoesPercentuais | null>(null);


  useEffect(() => {
    const loadTeams = async () => {
      try {
        const teamsData = await fetchTeams(tenantId);
        setTeams(teamsData);
      } catch (error) {
        console.error('Erro ao carregar os times:', error);
      } finally {
        // Setando false no loading.
        setLoadingTeams(false);
      }
    };
    loadTeams();
  }, [tenantId])

  const equipesOptions = useMemo(() => [
    { value: 'todas', label: 'Todas as equipes ' },
    ...teams.map(team => ({
      value: team.id,
      label: team.name
    }))
  ], [teams])

  // Buscar métricas reais ao montar o componente

  // Usa dados fictícios como fallback quando valores reais são zero ou não existem

  useEffect(() => {

    const carregarMetricas = async () => {

      setLoading(true);

      try {



        // Buscar métricas gerais

        const metricasGerais = await buscarMetricasGerais();



        // Só atualiza se o valor for maior que 0 e diferente do valor atual

        if (metricasGerais.tempoMedioRespostaGeral > 0 && metricasGerais.tempoMedioRespostaGeral !== tempoMedioGeralReal) {

          setTempoMedioGeralReal(metricasGerais.tempoMedioRespostaGeral);

        }



        // Buscar métricas por equipe - só usa se tiver dados, senão mantém fictício

        const dataInicio = new Date('2026-01-01');
        const dataFim = new Date('2026-12-31');
        const metricasEquipes = await buscarMetricasPorEquipe(dataInicio, dataFim, tenantId);

        if (metricasEquipes.length > 0) {

          setMetricasEquipesReais(metricasEquipes);

        } else {

        }



        // Buscar métricas de corretores - só usa se tiver dados, senão mantém fictício

        const metricasCorretores = await buscarTodasMetricasCorretores();

        if (metricasCorretores.length > 0) {

          const mapaCorretores = new Map<string, number>();

          metricasCorretores.forEach(m => {

            // Só adiciona se tempo > 0

            if (m.tempoMedioResposta > 0) {

              mapaCorretores.set(m.corretor, m.tempoMedioResposta);

            }

          });

          if (mapaCorretores.size > 0) {

            setMetricasCorretoresReais(mapaCorretores);

          } else {

          }

        } else {

        }



        // Buscar leads por equipe

        const leadsPorEquipe = await buscarLeadsPorEquipe(tenantId);

        setLeadsPorEquipeReal(leadsPorEquipe);



        // Buscar distribuição exclusivo vs ficha

        const distribuicaoExclusivoFicha = await buscarDistribuicaoExclusivoFicha(tenantId);

        setDistribuicaoExclusivoFichaReal(distribuicaoExclusivoFicha);



        // Buscar negócios fechados por fonte

        const negociosFechadosPorFonte = await buscarNegociosFechadosPorFonte(tenantId);

        setNegociosFechadosPorFonteReal(negociosFechadosPorFonte);



        // Buscar vendas por faixa

        const vendasPorFaixa = await buscarVendasPorFaixa(tenantId);

        setVendasPorFaixaReal(vendasPorFaixa);



        // Buscar evolução de ativações

        const evolucaoAtivacoes = await buscarEvolucaoAtivacoes(tenantId);

        setEvolucaoAtivacoesReal(evolucaoAtivacoes);

        // Buscar KPIs reais da equipe
        const kpisEquipe = await buscarKPIsEquipe(tenantId);
        setKpisReais(kpisEquipe);

        // Buscar variações percentuais
        const variacoesData = await buscarVariacoesPercentuais(tenantId);
        setVariacoes(variacoesData);






      } catch (error) {

        console.error(' Erro ao carregar métricas (usando fictícias):', error);

      } finally {

        setLoading(false);

      }

    };



    carregarMetricas();

  }, [tenantId]);



  useEffect(() => {

    const normalizeNome = (value: string) =>

      value

        .normalize('NFD')

        .replace(/[\u0300-\u036f]/g, '')

        .toLowerCase()

        .trim();



    const carregarIndividuais = async () => {

      if (!tenantId) {

        setCorretoresIndividuaisReais(null);

        setLoadingIndividuais(false);

        return;

      }



      setLoadingIndividuais(true);

      try {

        const year = new Date().getFullYear();

        const ranking = await buscarRankingCorretores(tenantId, year, 12, 'yearly');



        if (!ranking.length) {

          setCorretoresIndividuaisReais([]);

          return;

        }



        const dataIni = format(startOfYear(new Date()), 'yyyy-MM-dd');

        const dataFim = format(endOfYear(new Date()), 'yyyy-MM-dd');

        const top = ranking.slice(0, 24);



        const built = await Promise.all(

          top.map(async (row) => {

            const [leads, vendas] = await Promise.all([

              buscarMetricasIndividuaisLeads(tenantId, row.corretor, dataIni, dataFim),

              buscarMetricasIndividuaisVendas(tenantId, row.corretor, dataIni, dataFim),

            ]);



            const template = corretoresData.find(

              (c) => normalizeNome(c.nome) === normalizeNome(row.corretor)

            );



            return buildCorretorMetricasCompletas({

              nomeCorretor: row.corretor,

              rankingPosicao: row.ranking,

              equipe: template?.equipe ?? '—',

              leads,

              vendas,

              gestaoAtivaRanking: row.gestaoAtiva,

              tempoMedioRespostaMin: 0,

            });

          })

        );



        setCorretoresIndividuaisReais(built);

      } catch (err) {

        console.error('Erro ao carregar métricas individuais (dashboard):', err);

        setCorretoresIndividuaisReais(null);

      } finally {

        setLoadingIndividuais(false);

      }

    };



    carregarIndividuais();

  }, [tenantId]);



  // Valor inicial será definido pela função buscarMetricasGerais



  // Usar KPIs consistentes com as variações
  const kpis = useMemo(() => {
    // Se temos KPIs reais, usar eles
    if (kpisReais) {
      return {
        vendasCriadas: kpisReais.vendasCriadas,
        vendasAssinadas: kpisReais.vendasAssinadas,
        imoveisAtivos: kpisReais.imoveisAtivos,
        totalLeadsMes: kpisReais.totalLeadsMes,
        valorTotalVendasMes: kpisReais.valorTotalVendasMes,
        tempoMedioRespostaGeral: kpisReais.tempoMedioRespostaGeral
      };
    }

    // Fallback para valores padrão se não tivermos KPIs reais
    return {
      vendasCriadas: 0,
      vendasAssinadas: 0,
      imoveisAtivos: 0,
      totalLeadsMes: 0,
      valorTotalVendasMes: 0,
      tempoMedioRespostaGeral: 0
    };
  }, [kpisReais]);





  // Função para formatar variação percentual

  const formatarVariacao = (variacao: number) => {

    const isPositive = variacao > 0;

    const isNegative = variacao < 0;

    const isZero = variacao === 0;

    return {

      texto: isPositive ? `+${variacao}%` : isNegative ? `${variacao}%` : '0%',

      cor: isPositive ? 'text-green-600 dark:text-green-400' : isNegative ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400',

      icone: isPositive ? ArrowUpRight : isNegative ? 'ArrowDownRight' : 'Minus'

    };

  };



  // Função para classificar tempo médio de resposta

  const classificarTempoResposta = (tempoMinutos: number) => {

    if (tempoMinutos <= 10) {

      return {

        texto: 'Rápido',

        cor: 'text-green-600 dark:text-green-400',

        icone: Zap

      };

    } else if (tempoMinutos <= 20) {

      return {

        texto: 'Normal',

        cor: 'text-yellow-600 dark:text-yellow-400',

        icone: Clock

      };

    } else if (tempoMinutos <= 30) {

      return {

        texto: 'Lento',

        cor: 'text-orange-600 dark:text-orange-400',

        icone: Clock

      };

    } else {

      return {

        texto: 'Muito Lento',

        cor: 'text-red-600 dark:text-red-400',

        icone: Clock

      };

    }

  };



  // Usar dados reais ou fallback para mockados

  const metricasEquipes = useMemo(() => {

    if (metricasEquipesReais.length > 0) {

      return metricasEquipesReais;

    }

    return tempoRespostaPorEquipeData;

  }, [metricasEquipesReais]);



  // Mesclar dados mockados com métricas reais de tempo de resposta

  const corretoresComMetricasReais = useMemo(() => {

    if (corretoresIndividuaisReais !== null && corretoresIndividuaisReais.length === 0) {

      return [];

    }



    if (corretoresIndividuaisReais !== null && corretoresIndividuaisReais.length > 0) {

      return corretoresIndividuaisReais.map((corretor) => {

        const tempoReal = metricasCorretoresReais.get(corretor.nome);



        return {

          ...corretor,

          kpis: {

            ...corretor.kpis,

            tempoMedioResposta: tempoReal ?? corretor.kpis.tempoMedioResposta,

          },

        };

      });

    }



    return corretoresData.map((corretor) => {

      const tempoReal = metricasCorretoresReais.get(corretor.nome);



      return {

        ...corretor,

        kpis: {

          ...corretor.kpis,

          tempoMedioResposta: tempoReal ?? corretor.kpis.tempoMedioResposta,

        },

      };

    });

  }, [corretoresIndividuaisReais, metricasCorretoresReais]);



  const corretoresFiltrados = useMemo(() => {

    if (filtroEquipe === 'todas') return corretoresComMetricasReais;

    return corretoresComMetricasReais.filter(c => c.equipe === filtroEquipe);

  }, [filtroEquipe, corretoresComMetricasReais]);



  // Configurações dos gráficos

  const chartOptions = {

    responsive: true,

    maintainAspectRatio: false,

    plugins: {

      legend: {

        display: false

      }

    }

  };



  // Dados do gráfico Leads por Equipe

  const leadsEquipeChartData = {

    labels: leadsPorEquipeReal.map(d => d.equipe),

    datasets: [{

      label: 'Leads',

      data: leadsPorEquipeReal.map(d => d.quantidade),

      backgroundColor: leadsPorEquipeReal.map(d => d.cor),

      borderRadius: 4

    }]

  };



  // Dados do gráfico Vendas por Faixa

  const vendasFaixaChartData = {

    labels: vendasPorFaixaReal.map(d => d.mes),

    datasets: [

      {

        label: 'Até 500K',

        data: vendasPorFaixaReal.map(d => d.ate_500k),

        backgroundColor: 'rgba(59, 130, 246, 0.45)'

      },

      {

        label: '500K a 999K',

        data: vendasPorFaixaReal.map(d => d.de_500k_999k),

        backgroundColor: chartColors.primary

      },

      {

        label: 'Acima de 1M',

        data: vendasPorFaixaReal.map(d => d.acima_1m),

        backgroundColor: 'rgba(29, 78, 216, 0.85)'

      }

    ]

  };



  // Dados do gráfico Exclusivo vs Ficha

  const exclusivoFichaChartData = {

    labels: distribuicaoExclusivoFichaReal.map(d => d.tipo),

    datasets: [{

      data: distribuicaoExclusivoFichaReal.map(d => d.quantidade),

      backgroundColor: ['rgba(59, 130, 246, 0.45)', 'rgba(29, 78, 216, 0.85)']

    }]

  };



  // Dados do gráfico Evolução de Ativações

  const evolucaoAtivacaoChartData = {

    labels: evolucaoAtivacoesReal.map(d => d.mes),

    datasets: [{

      label: 'Ativações',

      data: evolucaoAtivacoesReal.map(d => d.quantidade),

      borderColor: chartColors.primary,

      backgroundColor: 'rgba(59, 130, 246, 0.12)',

      tension: 0.35,

      fill: true,

      pointBackgroundColor: chartColors.primary,

      pointBorderColor: '#ffffff',

      pointHoverBackgroundColor: '#ffffff',

      pointHoverBorderColor: chartColors.primary,

      pointRadius: 4,

      pointHoverRadius: 6,

      borderWidth: 2

    }]

  };



  // Dados do gráfico Negócio Fechado por Fonte

  const negocioFonteChartData = {

    labels: negociosFechadosPorFonteReal.map(d => d.fonte),

    datasets: [{

      label: 'Vendas',

      data: negociosFechadosPorFonteReal.map(d => d.quantidade),

      backgroundColor: chartColors.primary,

      borderRadius: 4

    }]

  };



  // Dados do gráfico Tempo Médio de Resposta por Equipe

  const tempoRespostaChartData = {

    labels: metricasEquipes.map(d => d.equipe),

    datasets: [{

      label: 'Tempo (min)',

      data: metricasEquipes.map(d => d.tempoMedio),

      backgroundColor: metricasEquipes.map(d => d.cor),

      borderRadius: 4

    }]

  };



  if (loading) {

    return (

      <div className="flex items-center justify-center min-h-[400px]">

        <div className="text-center">

          <Activity className="h-8 w-8 text-gray-400 animate-pulse mx-auto mb-4" />

          <p className="text-sm text-gray-500 dark:text-gray-400">Carregando métricas...</p>

        </div>

      </div>

    );

  }



  return (

    <div className="w-full">

      <Tabs defaultValue="equipe" className="w-full">

        <TabsList className="grid w-full grid-cols-2 bg-transparent border-b border-gray-200/60 dark:border-gray-700/60 rounded-none p-0 h-auto gap-8 mb-8">

          <TabsTrigger

            value="equipe"

            className="flex items-center gap-2 pb-4 text-sm font-semibold transition-colors relative data-[state=active]:text-gray-900 data-[state=active]:dark:text-white text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 bg-transparent border-none shadow-none h-auto px-0 rounded-none data-[state=active]:bg-transparent"

          >

            <Users className="h-4 w-4" />

            Métricas da Equipe

            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t opacity-0 data-[state=active]:opacity-100 transition-opacity"></span>

          </TabsTrigger>



          <TabsTrigger

            value="individual"

            className="flex items-center gap-2 pb-4 text-sm font-semibold transition-colors relative data-[state=active]:text-gray-900 data-[state=active]:dark:text-white text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 bg-transparent border-none shadow-none h-auto px-0 rounded-none data-[state=active]:bg-transparent"

          >

            <Target className="h-4 w-4" />

            Métricas Individuais

            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t opacity-0 data-[state=active]:opacity-100 transition-opacity"></span>

          </TabsTrigger>

        </TabsList>



        {/* ABA 1: MÉTRICAS DA EQUIPE */}

        <TabsContent value="equipe" className="space-y-8 mt-0">

          <div>

            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">

              Visão Geral da Performance da Equipe

            </h2>

            <p className="text-sm text-gray-500 dark:text-gray-400">

              KPIs agregados e análises de performance consolidadas

            </p>

          </div>



          {/* KPIs Principais */}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">

            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <div className="flex items-center justify-between mb-3">

                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">

                    <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />

                  </div>

                  <div className={`flex items-center gap-1 ${variacoes ? formatarVariacao(variacoes.vendasCriadas).cor : 'text-green-600 dark:text-green-400'}`}>

                    {variacoes ? (

                      <>

                        {formatarVariacao(variacoes.vendasCriadas).icone === 'ArrowUpRight' && <ArrowUpRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.vendasCriadas).icone === 'ArrowDownRight' && <ArrowDownRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.vendasCriadas).icone === 'Minus' && <Minus className="h-3 w-3" />}

                        <span className="text-[10px] font-semibold">{formatarVariacao(variacoes.vendasCriadas).texto}</span>

                      </>

                    ) : (

                      <>

                        <ArrowUpRight className="h-3 w-3" />

                        <span className="text-[10px] font-semibold">Carregando...</span>

                      </>

                    )}

                  </div>

                </div>

                <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpis.vendasCriadas}</p>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vendas Criadas</p>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <div className="flex items-center justify-between mb-3">

                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">

                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />

                  </div>

                  <div className={`flex items-center gap-1 ${variacoes ? formatarVariacao(variacoes.vendasAssinadas).cor : 'text-green-600 dark:text-green-400'}`}>

                    {variacoes ? (

                      <>

                        {formatarVariacao(variacoes.vendasAssinadas).icone === 'ArrowUpRight' && <ArrowUpRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.vendasAssinadas).icone === 'ArrowDownRight' && <ArrowDownRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.vendasAssinadas).icone === 'Minus' && <Minus className="h-3 w-3" />}

                        <span className="text-[10px] font-semibold">{formatarVariacao(variacoes.vendasAssinadas).texto}</span>

                      </>

                    ) : (

                      <>

                        <ArrowUpRight className="h-3 w-3" />

                        <span className="text-[10px] font-semibold">Carregando...</span>

                      </>

                    )}

                  </div>

                </div>

                <p className="text-2xl font-bold text-gray-900 dark:text-white">{vendasAssinadasRelatorio}</p>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vendas Assinadas</p>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <div className="flex items-center justify-between mb-3">

                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">

                    <Home className="h-4 w-4 text-orange-600 dark:text-orange-400" />

                  </div>

                  <div className={`flex items-center gap-1 ${variacoes ? formatarVariacao(variacoes.imoveisAtivos).cor : 'text-green-600 dark:text-green-400'}`}>

                    {variacoes ? (

                      <>

                        {formatarVariacao(variacoes.imoveisAtivos).icone === 'ArrowUpRight' && <ArrowUpRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.imoveisAtivos).icone === 'ArrowDownRight' && <ArrowDownRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.imoveisAtivos).icone === 'Minus' && <Minus className="h-3 w-3" />}

                        <span className="text-[10px] font-semibold">{formatarVariacao(variacoes.imoveisAtivos).texto}</span>

                      </>

                    ) : (

                      <>

                        <ArrowUpRight className="h-3 w-3" />

                        <span className="text-[10px] font-semibold">Carregando...</span>

                      </>

                    )}

                  </div>

                </div>

                <p className="text-2xl font-bold text-gray-900 dark:text-white">{imoveisAtivosRelatorio}</p>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Imóveis Ativos</p>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <div className="flex items-center justify-between mb-3">

                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">

                    <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />

                  </div>

                  <div className={`flex items-center gap-1 ${variacoes ? formatarVariacao(variacoes.totalLeadsMes).cor : 'text-green-600 dark:text-green-400'}`}>

                    {variacoes ? (

                      <>

                        {formatarVariacao(variacoes.totalLeadsMes).icone === 'ArrowUpRight' && <ArrowUpRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.totalLeadsMes).icone === 'ArrowDownRight' && <ArrowDownRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.totalLeadsMes).icone === 'Minus' && <Minus className="h-3 w-3" />}

                        <span className="text-[10px] font-semibold">{formatarVariacao(Number(variacoes.totalLeadsMes)).texto}</span>

                      </>

                    ) : (

                      <>

                        <ArrowUpRight className="h-3 w-3" />

                        <span className="text-[10px] font-semibold">Carregando...</span>

                      </>

                    )}

                  </div>

                </div>

                <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpis.totalLeadsMes}</p>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total de Leads</p>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <div className="flex items-center justify-between mb-3">

                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">

                    <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />

                  </div>

                  <div className={`flex items-center gap-1 ${variacoes ? formatarVariacao(variacoes.valorTotalVendasMes).cor : 'text-green-600 dark:text-green-400'}`}>

                    {variacoes ? (

                      <>

                        {formatarVariacao(variacoes.valorTotalVendasMes).icone === 'ArrowUpRight' && <ArrowUpRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.valorTotalVendasMes).icone === 'ArrowDownRight' && <ArrowDownRight className="h-3 w-3" />}

                        {formatarVariacao(variacoes.valorTotalVendasMes).icone === 'Minus' && <Minus className="h-3 w-3" />}

                        <span className="text-[10px] font-semibold">{formatarVariacao(variacoes.valorTotalVendasMes).texto}</span>

                      </>

                    ) : (

                      <>

                        <ArrowUpRight className="h-3 w-3" />

                        <span className="text-[10px] font-semibold">Carregando...</span>

                      </>

                    )}

                  </div>

                </div>

                <p className="text-xl font-bold text-gray-900 dark:text-white">

                  {formatarMoeda(kpis.valorTotalVendasMes)}

                </p>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Valor Total Vendas</p>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <div className="flex items-center justify-between mb-3">

                  <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">

                    <Clock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />

                  </div>

                  <div className={`flex items-center gap-1 ${kpisReais ? classificarTempoResposta(kpis.tempoMedioRespostaGeral).cor : 'text-green-600 dark:text-green-400'}`}>

                    {kpisReais ? (

                      (() => {

                        const classificacao = classificarTempoResposta(kpis.tempoMedioRespostaGeral);

                        const IconComponent = classificacao.icone;

                        return (

                          <>

                            <IconComponent className="h-3 w-3" />

                            <span className="text-[10px] font-semibold">{classificacao.texto}</span>

                          </>

                        );

                      })()

                    ) : (

                      <>

                        <Zap className="h-3 w-3" />

                        <span className="text-[10px] font-semibold">Rápido</span>

                      </>

                    )}

                  </div>

                </div>

                <p className="text-2xl font-bold text-gray-900 dark:text-white">

                  {kpis.tempoMedioRespostaGeral}<span className="text-sm font-normal text-gray-500 ml-1">min</span>

                </p>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tempo Médio Resposta</p>

              </CardContent>

            </Card>

          </div>



          {/* Gráficos Principais */}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">

                  Leads por Equipe

                </h3>

                <div style={{ height: 280 }}>

                  <Bar data={leadsEquipeChartData} options={{ ...chartOptions, indexAxis: 'y' }} />

                </div>

              </CardContent>

            </Card>

          </div>



          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">

                  Vendas por Faixa de Preço

                </h3>

                <div style={{ height: 280 }}>

                  <Bar data={vendasFaixaChartData} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: true, position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true } } }} />

                </div>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">

                  Distribuição Exclusivo vs Ficha

                </h3>

                <div style={{ height: 280 }}>

                  <Doughnut data={exclusivoFichaChartData} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: true, position: 'bottom' } } }} />

                </div>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">

                  Evolução de Ativações de Imóveis

                </h3>

                <div style={{ height: 280 }}>

                  <Line

                    data={evolucaoAtivacaoChartData}

                    options={{

                      ...chartOptions,

                      plugins: {

                        ...chartOptions.plugins,

                        tooltip: {

                          callbacks: {

                            label: (context) => `${context.dataset.label}: ${context.parsed.y}`

                          }

                        }

                      },

                      scales: {

                        y: {

                          beginAtZero: true,

                          grid: {

                            color: 'rgba(229, 231, 235, 0.5)'

                          },

                          ticks: {

                            color: '#9ca3af',

                            font: { size: 10 }

                          }

                        },

                        x: {

                          grid: { display: false },

                          ticks: {

                            color: '#9ca3af',

                            font: { size: 10 }

                          }

                        }

                      }

                    }}

                  />

                </div>

              </CardContent>

            </Card>

          </div>



          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">

                  Negócio Fechado por Fonte

                </h3>

                <div style={{ height: 280 }}>

                  <Bar data={negocioFonteChartData} options={chartOptions} />

                </div>

              </CardContent>

            </Card>



            <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">

              <CardContent className="p-5">

                <div className="flex items-center justify-between mb-4">

                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">

                    Tempo Médio de Resposta por Equipe

                  </h3>

                  <div className="flex items-center gap-2 px-2.5 py-1 bg-cyan-50 dark:bg-cyan-900/20 rounded-full">

                    <Clock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />

                    <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">

                      Geral: {kpis.tempoMedioRespostaGeral} min

                    </span>

                  </div>

                </div>



                {/* Cards por equipe com indicadores visuais */}

                <div className="space-y-3">

                  {metricasEquipes.map((equipe) => {

                    const isExcelente = equipe.tempoMedio <= 10;

                    const isBom = equipe.tempoMedio > 10 && equipe.tempoMedio <= 15;

                    const progressPercent = Math.min(100, (equipe.tempoMedio / 30) * 100);



                    return (

                      <div key={equipe.equipe} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">

                        <div className="flex items-center justify-between mb-2">

                          <div className="flex items-center gap-2">

                            <div

                              className="w-3 h-3 rounded-full"

                              style={{ backgroundColor: equipe.cor }}

                            />

                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">

                              {equipe.equipe}

                            </span>

                          </div>

                          <div className="flex items-center gap-2">

                            <span className="text-lg font-bold text-gray-900 dark:text-white">

                              {equipe.tempoMedio}<span className="text-xs font-normal text-gray-500 ml-0.5">min</span>

                            </span>

                            {isExcelente && (

                              <span className="flex items-center gap-1 text-[9px] font-semibold text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">

                                <Zap className="h-2.5 w-2.5" />

                                Excelente

                              </span>

                            )}

                            {isBom && (

                              <span className="text-[9px] font-semibold text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full">

                                Bom

                              </span>

                            )}

                            {!isExcelente && !isBom && (

                              <span className="text-[9px] font-semibold text-red-600 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">

                                Atenção

                              </span>

                            )}

                          </div>

                        </div>

                        {/* Barra de progresso */}

                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">

                          <div

                            className={`h-full rounded-full transition-all duration-500 ${isExcelente ? 'bg-green-500' : isBom ? 'bg-yellow-500' : 'bg-red-500'

                              }`}

                            style={{ width: `${progressPercent}%` }}

                          />

                        </div>

                      </div>

                    );

                  })}

                </div>



                {/* Legenda com indicadores */}

                <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">

                  <div className="flex items-center gap-1.5">

                    <div className="w-2 h-2 rounded-full bg-green-500"></div>

                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Excelente (&lt;10min)</span>

                  </div>

                  <div className="flex items-center gap-1.5">

                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>

                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Bom (10-15min)</span>

                  </div>

                  <div className="flex items-center gap-1.5">

                    <div className="w-2 h-2 rounded-full bg-red-500"></div>

                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Atenção (&gt;15min)</span>

                  </div>

                </div>

              </CardContent>

            </Card>

          </div>

        </TabsContent>



        {/* ABA 2: MÉTRICAS INDIVIDUAIS */}

        <TabsContent value="individual" className="space-y-6 mt-0">

          <div>

            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">

              Performance Individual dos Corretores

            </h2>

            <p className="text-sm text-gray-500 dark:text-gray-400">

              Métricas detalhadas por corretor com funil de vendas e portfólio

            </p>

          </div>



          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-700">

            <div className="flex items-center gap-3">

              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Equipe:</span>

              <Select
                value={filtroEquipe}
                onValueChange={(value) => setFiltroEquipe(value as EquipeOption)}
                disabled={loadingTeams}
              >
                <SelectTrigger className="w-[200px] h-9 text-sm">
                  <SelectValue placeholder={loadingTeams ? "Carregando..." : "Selecione a equipe"} />
                </SelectTrigger>
                <SelectContent>
                  {equipesOptions.map((equipe) => (
                    <SelectItem key={equipe.value} value={equipe.value}>
                      {equipe.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

            </div>



            <span className="ml-auto text-sm text-gray-600 dark:text-gray-400 font-medium">

              {corretoresFiltrados.length} corretor{corretoresFiltrados.length !== 1 ? 'es' : ''}

            </span>

          </div>



          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {corretoresFiltrados.map((corretor) => (

              <CorretorMetricCard

                key={corretor.id}

                corretor={corretor}

                isLoading={loading || loadingIndividuais}

              />

            ))}

          </div>



          {corretoresFiltrados.length === 0 && (

            <div className="text-center py-16">

              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-6">

                <Award className="h-10 w-10 text-gray-400 dark:text-gray-600" />

              </div>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">

                Nenhum corretor encontrado

              </h3>

              <p className="text-gray-500 dark:text-gray-400">

                Ajuste os filtros para visualizar outros corretores

              </p>

            </div>

          )}

        </TabsContent>

      </Tabs>

    </div>

  );

};

