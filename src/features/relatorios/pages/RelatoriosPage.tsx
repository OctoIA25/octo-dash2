/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * RelatoriosPage - Página de Relatórios e Análises
 * Utiliza Chart.js para visualização de dados
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { 
  Search, 
  Download, 
  Users, 
  TrendingUp, 
  Clock, 
  CheckCircle2,
  BarChart3,
  Filter,
  Calendar,
  DollarSign,
  Target,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { MetricsDashboard } from '@/features/metricas/components/MetricsDashboard';
import { ImoveisPortfolioChart } from '@/features/imoveis/components/ImoveisPortfolioChart';
import { BairrosChart } from '@/features/imoveis/components/BairrosChart';
import { ImoveisInterestTable } from '@/features/imoveis/components/ImoveisInterestTable';
import { FunnelStagesBubbleChart } from '@/features/leads/components/FunnelStagesBubbleChart';
import { FunilPorUnidadeChart } from '@/features/relatorios/components/FunilPorUnidadeChart';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import { useImovelTipoMap } from '@/features/leads/hooks/useImovelTipoMap';
import { useAuth } from '@/hooks/useAuth';
import { fetchTenantMembers, type TenantMember } from '@/features/corretores/services/tenantMembersService';
import { LEAD_TYPE_INTERESSADO, LEAD_TYPE_PROPRIETARIO } from '@/features/leads/services/leadsService';
import { countProprietariosInStage } from '@/features/leads/utils/funnelStages';
import { ProcessedLead, canonicalizeOrigemLeads } from '@/data/realLeadsProcessor';
import { getRankingColor } from '@/utils/colors';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CorretorMetricCard } from '@/components/metrics/individual';
import { IndividualGoalsPanel } from '@/features/metas';
import {
  buscarMapaEquipesPorTenant,
  resolverEquipeDoLead,
  type TeamResolver,
} from '@/features/metricas/services/teamMetricsService';
import {
  buscarVendasAssinadas,
  somarVendas,
  type VendaAssinada,
} from '@/features/metricas/services/vendasAssinadasService';
import { buscarEvolucaoCarteira, type CarteiraMes } from '../services/relatoriosService';
import { useRelatorios } from '../hooks/useRelatorios';
import { useLeadSourceChannels } from '../hooks/useLeadSourceChannels';

import { GenericImportPage } from '@/features/relatorios/import/generic/pages/GenericImportPage';
import { EnpsCorretoresSection } from '../enps/EnpsCorretoresSection';

import { buildCorretorMetricasCompletas } from '../utils/buildCorretorMetricasCompletas';
import {
  buscarFinanceiroVendasComerciaisComFallback,
  ratearComissaoDasVendas,
  type CommercialSalesFinanceSummary,
} from '@/features/metricas/services/commercialSalesService';
import { FinanceiroTab } from '../components/FinanceiroTab';
import { MarketingSiteTab } from '../components/MarketingSiteTab';
import { ExportReportDialog, buildReportModel, fromChartJs, type ReportSource } from '../export';
import { useLeadSourceCosts } from '../hooks/useLeadSourceCosts';
import { buildFinanceiroResumo, origemKey } from '../utils/buildFinanceiroResumo';

// Registrar componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

// Funções utilitárias para calcular dados reais dos leads
function countByField(leads: ProcessedLead[], field: keyof ProcessedLead): Record<string, number> {
  const counts: Record<string, number> = {};
  leads.forEach(l => {
    const val = String(l[field] || 'Não informado');
    counts[val] = (counts[val] || 0) + 1;
  });
  return counts;
}

function topN(counts: Record<string, number>, n: number): { labels: string[]; values: number[] } {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
  return { labels: sorted.map(e => e[0]), values: sorted.map(e => e[1]) };
}

const generateDailyLabels = (days: number) => {
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    labels.push(format(subDays(new Date(), i), 'dd/MM', { locale: ptBR }));
  }
  return labels;
};

// Cores do tema
const CHART_COLORS = {
  primary: 'rgba(59, 130, 246, 0.8)',
  primaryDark: 'rgba(29, 78, 216, 0.85)',
  primaryLight: 'rgba(59, 130, 246, 0.5)',
  success: 'rgba(34, 197, 94, 0.8)',
  successLight: 'rgba(34, 197, 94, 0.5)',
  warning: 'rgba(234, 179, 8, 0.8)',
  warningLight: 'rgba(234, 179, 8, 0.5)',
  danger: 'rgba(239, 68, 68, 0.8)',
  dangerLight: 'rgba(239, 68, 68, 0.5)',
  purple: 'rgba(168, 85, 247, 0.8)',
  purpleLight: 'rgba(168, 85, 247, 0.5)',
  cyan: 'rgba(6, 182, 212, 0.8)',
  cyanLight: 'rgba(6, 182, 212, 0.5)',
  orange: 'rgba(249, 115, 22, 0.8)',
  orangeLight: 'rgba(249, 115, 22, 0.5)',
};

const STACKED_COLORS = [
  'rgba(59, 130, 246, 0.8)',
  'rgba(34, 197, 94, 0.8)',
  'rgba(234, 179, 8, 0.8)',
  'rgba(168, 85, 247, 0.8)',
  'rgba(6, 182, 212, 0.8)',
  'rgba(249, 115, 22, 0.8)',
];

// Paleta de 30 cores para o gráfico de motivos de arquivamento
const PIE_COLORS = [
  'rgba(31, 119, 180, 0.85)',
  'rgba(255, 127, 14, 0.85)',
  'rgba(44, 160, 44, 0.85)',
  'rgba(214, 39, 40, 0.85)',
  'rgba(148, 103, 189, 0.85)',
  'rgba(140, 86, 75, 0.85)',
  'rgba(227, 119, 194, 0.85)',
  'rgba(127, 127, 127, 0.85)',
  'rgba(188, 189, 34, 0.85)',
  'rgba(23, 190, 207, 0.85)',
  'rgba(166, 206, 227, 0.85)',
  'rgba(31, 120, 180, 0.85)',
  'rgba(178, 223, 138, 0.85)',
  'rgba(51, 160, 44, 0.85)',
  'rgba(251, 154, 153, 0.85)',
  'rgba(227, 26, 28, 0.85)',
  'rgba(253, 191, 111, 0.85)',
  'rgba(255, 127, 0, 0.85)',
  'rgba(202, 178, 214, 0.85)',
  'rgba(106, 61, 154, 0.85)',
  'rgba(255, 255, 153, 0.85)',
  'rgba(177, 89, 40, 0.85)',
  'rgba(141, 211, 199, 0.85)',
  'rgba(255, 255, 179, 0.85)',
  'rgba(190, 186, 218, 0.85)',
  'rgba(251, 128, 114, 0.85)',
  'rgba(128, 177, 211, 0.85)',
  'rgba(253, 180, 98, 0.85)',
  'rgba(179, 222, 105, 0.85)',
  'rgba(252, 205, 229, 0.85)',
];

export const RelatoriosPage = () => {
  const [searchParams] = useSearchParams();
  const { tenantId } = useAuth();

  // Declarados antes do hook: os KPIs são buscados para este período.
  const [dataInicial, setDataInicial] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dataFinal, setDataFinal] = useState(format(new Date(), 'yyyy-MM-dd'));

  const {
    metricasEquipes,
    vendasPorFaixa,
    kpis: kpisRelatorios,
    ranking: rankingCorretoresRelatorio,
    usandoDadosReaisRanking,
    metricasIndLeads,
    metricasIndVendas,
    loadingMetricasInd,
    metricasIndCorretor,
    metricasIndDataInicial,
    metricasIndDataFinal,
    setMetricasIndCorretor,
    setMetricasIndDataInicial,
    setMetricasIndDataFinal,
    setRankingAno,
    setRankingMes,
    setRankingPeriodo,
  } = useRelatorios({ inicio: dataInicial, fim: dataFinal });

  const reportRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  // Estados dos filtros
  const [usuario, setUsuario] = useState('meu-usuario');
  // 'todas' | teams.id — as opções vêm do banco, nunca de uma lista fixa.
  const [equipeFiltro, setEquipeFiltro] = useState('todas');
  const [teamResolver, setTeamResolver] = useState<TeamResolver | null>(null);
  const [vendasDoPeriodo, setVendasDoPeriodo] = useState<VendaAssinada[] | null>(null);
  const [exibirValores, setExibirValores] = useState(true);
  const _tab = searchParams.get('tab');
  const activeSubArea: 'marketing' | 'metricas' | 'metricas-individuais' | 'imoveis' | 'financeiro' | 'excel' | 'enps' =
    _tab === 'metricas' || _tab === 'imoveis' || _tab === 'metricas-individuais' || _tab === 'excel' || _tab === 'financeiro' || _tab === 'enps' ? _tab : 'marketing';

  // Sub-visão do Marketing: 'geral' (conteúdo atual) | 'site' (Google Analytics).
  // Não há setSearchParams neste arquivo (só o getter de useSearchParams), então seguimos o
  // padrão já usado abaixo (activeMetricasSubArea): estado local + window.history.replaceState.
  const initialMktView = useMemo(
    () => (searchParams.get('view') === 'site' ? 'site' : 'geral'),
    [searchParams],
  );
  const [mktView, setMktView] = useState<'geral' | 'site'>(initialMktView);

  const initialMetricasSubArea = useMemo(() => {
    const fromQuery = searchParams.get('metricasSubArea');
    if (fromQuery === 'visao-geral' || fromQuery === 'metricas-individuais' || fromQuery === 'ranking') {
      return fromQuery;
    }
    return 'visao-geral';
  }, [searchParams]);

  const [activeMetricasSubArea, setActiveMetricasSubArea] = useState<
    'visao-geral' | 'metricas-individuais' | 'ranking'
  >(initialMetricasSubArea);

  const initialMetricasIndSubArea = useMemo(() => {
    const fromQuery = searchParams.get('metricasIndSubArea');
    if (
      fromQuery === 'comissao-metas' ||
      fromQuery === 'metas' ||
      fromQuery === 'leads' ||
      fromQuery === 'vendas'
    ) {
      return fromQuery;
    }
    return 'comissao-metas';
  }, [searchParams]);

  const [activeMetricasIndSubArea, setActiveMetricasIndSubArea] = useState<
    'comissao-metas' | 'metas' | 'leads' | 'vendas'
  >(initialMetricasIndSubArea);

  useEffect(() => {
    setActiveMetricasSubArea(initialMetricasSubArea);
  }, [initialMetricasSubArea]);

  useEffect(() => {
    setActiveMetricasIndSubArea(initialMetricasIndSubArea);
  }, [initialMetricasIndSubArea]);

  const [tipoCliente, setTipoCliente] = useState<'nenhum' | 'interessado' | 'proprietario'>('nenhum');
  const [proprietariosSubTab, setProprietariosSubTab] = useState<'vendedor' | 'locatario'>('vendedor');

  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);

  const initialRankingYear = useMemo(() => new Date().getFullYear(), []);
  const initialRankingMonth = useMemo(() => new Date().getMonth() + 1, []);
  const [rankingYear, setRankingYear] = useState<number>(initialRankingYear);
  const [rankingMonth, setRankingMonth] = useState<number>(initialRankingMonth);
  const [rankingPeriod, setRankingPeriod] = useState<'monthly' | 'quarterly' | 'semiannual' | 'yearly'>('yearly');
  const [rankingCurrentPage, setRankingCurrentPage] = useState<number>(1);
  const [financeiroImoveis, setFinanceiroImoveis] = useState<CommercialSalesFinanceSummary | null>(null);
  const [evolucaoCarteira, setEvolucaoCarteira] = useState<CarteiraMes[]>([]);
  const rankingItemsPerPage = 10;

  // Reset page when period or filters change
  useEffect(() => {
    setRankingCurrentPage(1);
  }, [rankingPeriod, rankingMonth, rankingYear]);

  useEffect(() => {
    let mounted = true;
    const loadMembers = async () => {
      if (!tenantId || tenantId === 'owner') return;
      const members = await fetchTenantMembers(tenantId);
      if (mounted) setTenantMembers(members);
    };
    loadMembers();
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  useEffect(() => {
    setRankingAno(rankingYear);
    setRankingMes(rankingMonth);
    setRankingPeriodo(rankingPeriod);
  }, [rankingYear, rankingMonth, rankingPeriod, setRankingAno, setRankingMes, setRankingPeriodo]);

  useEffect(() => {
    let mounted = true;

    const loadFinanceiroImoveis = async () => {
      if (!tenantId || activeSubArea !== 'imoveis') return;

      try {
        const financeiro = await buscarFinanceiroVendasComerciaisComFallback(
          tenantId,
          new Date().getFullYear(),
        );

        if (mounted) {
          setFinanceiroImoveis(financeiro);
        }
      } catch (error) {
        console.error('Erro ao carregar financeiro de imóveis:', error);
        if (mounted) {
          setFinanceiroImoveis(null);
        }
      }
    };

    loadFinanceiroImoveis();
    const interval = setInterval(loadFinanceiroImoveis, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tenantId, activeSubArea]);

  // Evolução da carteira: sem polling, ao contrário do financeiro acima —
  // captação e exclusão de imóvel são eventos de dias, não de 30 segundos.
  useEffect(() => {
    let mounted = true;

    const loadCarteira = async () => {
      if (!tenantId || tenantId === 'owner' || activeSubArea !== 'imoveis') return;
      try {
        const serie = await buscarEvolucaoCarteira(tenantId);
        if (mounted) setEvolucaoCarteira(serie);
      } catch (error) {
        console.error('Erro ao carregar evolução da carteira:', error);
        if (mounted) setEvolucaoCarteira([]);
      }
    };

    loadCarteira();
    return () => {
      mounted = false;
    };
  }, [tenantId, activeSubArea]);

  const normalizeName = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const corretorPhotoMap = useMemo(() => {
    const map = new Map<string, string>();
    tenantMembers.forEach((member) => {
      const email = member.email || '';
      const local = email.split('@')[0] || email;
      const photo = (member.permissions as any)?.photo as string | undefined;
      if (photo) {
        map.set(normalizeName(local.replace(/[._-]/g, ' ')), photo);
      }
    });
    return map;
  }, [tenantMembers]);

  const getCorretorPhoto = useCallback(
    (name: string) => {
      const byName = corretorPhotoMap.get(normalizeName(name));
      return byName || null;
    },
    [corretorPhotoMap]
  );

  const { processedLeads: processedLeadsInteressado } = useLeadsMetrics({
    leadType: LEAD_TYPE_INTERESSADO
  });
  const { processedLeads: processedLeadsProprietario } = useLeadsMetrics({
    leadType: LEAD_TYPE_PROPRIETARIO
  });

  // Mapa codigo_imovel -> tipo (imoveis_locais) para o Funil por Unidade.
  // Uma única query por tenant; junção em memória, sem N+1.
  const { tipoMap: imovelTipoMap, isLoading: isLoadingTipoMap } = useImovelTipoMap();

  const proprietariosLeads = useMemo(() => {
    return processedLeadsProprietario.filter(l => {
      const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
      const tipoLead = l.tipo_lead?.toLowerCase() || '';

      if (proprietariosSubTab === 'vendedor') {
        return (
          tipoNegocio.includes('venda') ||
          tipoNegocio.includes('vender') ||
          tipoLead.includes('vendedor') ||
          tipoLead.includes('proprietário') ||
          tipoLead.includes('proprietario')
        );
      }

      return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao');
    });
  }, [processedLeadsProprietario, proprietariosSubTab]);

  const proprietariosLeadsParaExibir = useMemo(() => {
    return proprietariosLeads;
  }, [proprietariosLeads]);

  const proprietariosKpis = useMemo(() => {
    const allLeads = proprietariosLeadsParaExibir;
    const proprietariosTotal = allLeads.length;

    const leadsCaptadosLIA = allLeads.filter(lead => {
      const origem = lead.origem_lead?.toLowerCase() || '';
      return (
        origem.includes('lia') ||
        origem.includes('ia') ||
        origem.includes('inteligência artificial') ||
        origem.includes('inteligencia artificial')
      );
    }).length;

    const estudosMercado = allLeads.filter(lead => (
      lead.etapa_atual === 'Estudo de Mercado' ||
      lead.etapa_atual === 'Apresentação do Estudo de Mercado' ||
      lead.etapa_atual === 'Criação do Estudo de Mercado' ||
      lead.etapa_atual === 'Criando Estudo' ||
      lead.etapa_atual === 'Estudo em Criação' ||
      lead.etapa_atual === 'Preparando Estudo' ||
      lead.etapa_atual === 'Análise'
    )).length;

    const naoExclusivos = allLeads.filter(lead => (
      lead.etapa_atual === 'Não Exclusivo' ||
      lead.etapa_atual === 'Nao Exclusivo' ||
      lead.etapa_atual === 'Sem Exclusividade'
    )).length;

    const exclusivos = allLeads.filter(lead => (
      lead.etapa_atual === 'Exclusivo' ||
      lead.etapa_atual === 'Exclusividade' ||
      lead.etapa_atual === 'Com Exclusividade'
    )).length;

    const propostas = allLeads.filter(lead => (
      lead.etapa_atual === 'Proposta Enviada' ||
      lead.etapa_atual === 'Proposta Criada' ||
      lead.etapa_atual === 'Proposta' ||
      lead.etapa_atual === 'Propostas Respondidas'
    )).length;

    return {
      metric1: { value: proprietariosTotal, label: proprietariosSubTab === 'vendedor' ? 'Vendedores' : 'Locatários', valueClass: 'text-green-600' },
      metric2: { value: leadsCaptadosLIA, label: 'LIA (Leads Captados pela LIA)', valueClass: 'text-blue-600' },
      metric3: { value: naoExclusivos, label: 'Não Exclusivos', valueClass: 'text-purple-600' },
      metric4: { value: exclusivos, label: 'Exclusivos', valueClass: 'text-orange-600' },
      metric5: { value: propostas, label: 'Propostas', valueClass: 'text-pink-600' },
      metric6: { value: estudosMercado, label: 'Estudos', valueClass: 'text-emerald-600' }
    };
  }, [proprietariosLeadsParaExibir, proprietariosSubTab]);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [activeChartModal, setActiveChartModal] = useState<
    | 'tempo_interacao_usuario'
    | 'atividades_aberto_usuario'
    | 'leads_interagidos_usuario'
    | 'leads_convertidos_usuario'
    | null
  >(null);

  // KPIs vêm inteiros de buscarKPIsGerais, já no período do filtro. A versão
  // anterior remontava os cards aqui a partir de contagens que mediam outra
  // coisa: "Leads Interagidos" e "Leads Recebidos" eram a MESMA query, a média
  // diária era vendas/30 exibida com "%", e o tempo de resposta era zero fixo.
  const kpisCalculados = kpisRelatorios;

  /** Sem dado real o card mostra "—": não existe número honesto para pôr ali. */
  const kpiNumero = useCallback(
    (valor: number | undefined) =>
      valor === undefined || valor === null ? '—' : valor.toLocaleString('pt-BR'),
    [],
  );

  const rankingMetricasIndividuais = useMemo(() => {
    const slugify = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    if (usandoDadosReaisRanking && rankingCorretoresRelatorio.length > 0) {
      return rankingCorretoresRelatorio.map((item, index) => ({
        corretor: item.corretor,
        valorComissao: item.valorComissao,
        vendasFeitas: item.vendasFeitas,
        gestaoAtiva: item.gestaoAtiva,
        comissaoCorretor: item.comissaoCorretor,
        comissaoImobiliaria: item.comissaoImobiliaria,
        precoMedio: item.precoMedio ?? 0,
        ranking: item.ranking ?? index + 1,
        fotoUrl:
          getCorretorPhoto(item.corretor) ||
          item.fotoUrl ||
          `/avatars/${slugify(item.corretor)}.jpg`,
      }));
    }

    return [];
  }, [
    corretorPhotoMap,
    usandoDadosReaisRanking,
    rankingCorretoresRelatorio,
    getCorretorPhoto,
  ]);

  useEffect(() => {
    const names = rankingMetricasIndividuais.map((x) => x.corretor);
    if (names.length === 0) return;
    if (!metricasIndCorretor || !names.includes(metricasIndCorretor)) {
      setMetricasIndCorretor(names[0]);
    }
  }, [rankingMetricasIndividuais, metricasIndCorretor, setMetricasIndCorretor]);

  const bestSellerForSelectedYear = useMemo(() => {
    if (usandoDadosReaisRanking && rankingMetricasIndividuais.length > 0) {
      const best = [...rankingMetricasIndividuais]
        .sort((a, b) => b.vendasFeitas - a.vendasFeitas || b.valorComissao - a.valorComissao)[0];

      return best ? { corretor: best.corretor, totalVendas: best.vendasFeitas } : null;
    }

    return null;
  }, [usandoDadosReaisRanking, rankingMetricasIndividuais]);

  // O agrupamento por bairro saiu: `leads` não tem coluna de bairro — o gráfico
  // era 100% "Não informado". "Vendas realizadas" agora vem de `proposals`
  // (metricasIndVendasView), não de uma etapa que não existe.
  const metricasIndLeadsView = useMemo(() => {
    const emptyFonte = [{ label: 'Sem dados', value: 0 }];
    const emptyImovel = [{ label: '—', value: 0 }];
    const L = metricasIndLeads;
    if (!L) {
      return {
        totalLeads: 0,
        leadsRecebidos: 0,
        visitas: 0,
        porFonte: emptyFonte,
        porImovel: emptyImovel,
      };
    }
    return {
      ...L,
      porFonte: L.porFonte.length > 0 ? L.porFonte : emptyFonte,
      porImovel: L.porImovel.length > 0 ? L.porImovel : emptyImovel,
    };
  }, [metricasIndLeads]);

  const leadsPieColors = useMemo(
    () => ['#22d3ee', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#10b981', '#a3e635', '#f59e0b'],
    []
  );

  const leadsPorFonteData = useMemo(() => {
    return {
      labels: metricasIndLeadsView.porFonte.map((x) => x.label),
      datasets: [
        {
          data: metricasIndLeadsView.porFonte.map((x) => x.value),
          backgroundColor: metricasIndLeadsView.porFonte.map((_, i) => leadsPieColors[(i + 2) % leadsPieColors.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [metricasIndLeadsView, leadsPieColors]);

  const leadsPorFonteLegend = useMemo(() => {
    return metricasIndLeadsView.porFonte.map((item, i) => ({
      label: item.label,
      value: item.value,
      color: leadsPieColors[(i + 2) % leadsPieColors.length],
    }));
  }, [metricasIndLeadsView, leadsPieColors]);

  const leadsPorImovelData = useMemo(() => {
    return {
      labels: metricasIndLeadsView.porImovel.map((x) => x.label),
      datasets: [
        {
          label: 'Leads',
          data: metricasIndLeadsView.porImovel.map((x) => x.value),
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          borderRadius: 8,
          maxBarThickness: 48,
        },
      ],
    };
  }, [metricasIndLeadsView]);

  const metricasIndVendasView = useMemo(() => {
    const V = metricasIndVendas;
    if (!V) {
      return {
        vendasTotal: 0,
        vendasExclusivas: 0,
        vendasNaoExclusivas: 0,
        vgvTotal: 0,
        comissaoTotal: 0,
        ticketMedio: 0,
        rows: [] as Array<{
          id: string;
          codigo_imovel: string;
          exclusividade: string;
          fonte: string;
          valor_imovel: number;
          comissao: number;
          data: string;
        }>,
        fonteBreakdown: [] as Array<{ fonte: string; quantidade: number }>,
      };
    }
    return V;
  }, [metricasIndVendas]);

  const vendasPorFonteData = useMemo(() => {
    const breakdown =
      metricasIndVendasView.fonteBreakdown.length > 0
        ? metricasIndVendasView.fonteBreakdown
        : [{ fonte: 'Sem dados', quantidade: 0 }];
    return {
      labels: breakdown.map((x) => x.fonte),
      datasets: [
        {
          label: 'Vendas',
          data: breakdown.map((x) => x.quantidade),
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          borderRadius: 8,
          maxBarThickness: 44,
        },
      ],
    };
  }, [metricasIndVendasView]);

  const vendasBarOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.98)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          cornerRadius: 10,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#6B7280', font: { size: 9 } },
        },
        y: {
          grid: { color: 'rgba(17, 24, 39, 0.08)' },
          ticks: { color: '#6B7280', font: { size: 9 }, precision: 0 },
        },
      },
    };
  }, []);

  const leadsDarkCardOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.98)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          cornerRadius: 10,
        },
      },
    };
  }, []);

  const leadsBarOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.98)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          cornerRadius: 10,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#6B7280', font: { size: 9 } },
        },
        y: {
          grid: { color: 'rgba(17, 24, 39, 0.08)' },
          ticks: { color: '#6B7280', font: { size: 9 }, precision: 0 },
        },
      },
    };
  }, []);

  /**
   * Pódio: os três primeiros da MESMA ordem da tabela — pela parte do corretor
   * no rateio Lotus. O valor exibido tem que ser esse também; enquanto era o
   * VGC, o 1º lugar podia aparecer com número (e barra) menor que o 2º.
   */
  const top3MetricasIndividuais = useMemo(() => rankingMetricasIndividuais.slice(0, 3), [rankingMetricasIndividuais]);

  /**
   * Rodapé da tabela do ranking. O preço médio do total é VGV/vendas — média
   * ponderada, não média das médias por corretor (que daria outro número).
   * `semRateio` conta quem está sem nível/Líder Direto: as colunas de rateio
   * mostram "—" nessas linhas, então o total delas é parcial e precisa dizer.
   */
  const totaisRanking = useMemo(() => {
    const soma = rankingMetricasIndividuais.reduce(
      (acc, item) => ({
        comissaoTotal: acc.comissaoTotal + item.valorComissao,
        comissaoCorretor: acc.comissaoCorretor + (item.comissaoCorretor ?? 0),
        comissaoImobiliaria: acc.comissaoImobiliaria + (item.comissaoImobiliaria ?? 0),
        vendas: acc.vendas + item.vendasFeitas,
        vgv: acc.vgv + (item.precoMedio ?? 0) * item.vendasFeitas,
        semRateio: acc.semRateio + (item.comissaoCorretor === null || item.comissaoCorretor === undefined ? 1 : 0),
      }),
      { comissaoTotal: 0, comissaoCorretor: 0, comissaoImobiliaria: 0, vendas: 0, vgv: 0, semRateio: 0 },
    );
    return { ...soma, precoMedio: soma.vendas > 0 ? soma.vgv / soma.vendas : 0 };
  }, [rankingMetricasIndividuais]);

  const top3PodiumHeights = useMemo(() => {
    const values = top3MetricasIndividuais.map((x) => x.comissaoCorretor ?? 0);
    const max = Math.max(1, ...values);

    const heightFor = (value: number, min: number, maxH: number) => {
      const t = Math.max(0, Math.min(1, value / max));
      return Math.round(min + t * (maxH - min));
    };

    return {
      first: top3MetricasIndividuais[0] ? heightFor(top3MetricasIndividuais[0].comissaoCorretor ?? 0, 260, 420) : 380,
      second: top3MetricasIndividuais[1] ? heightFor(top3MetricasIndividuais[1].comissaoCorretor ?? 0, 220, 360) : 280,
      third: top3MetricasIndividuais[2] ? heightFor(top3MetricasIndividuais[2].comissaoCorretor ?? 0, 200, 330) : 250,
    };
  }, [top3MetricasIndividuais]);

  const formatCurrencyBRL = useMemo(() => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const formatCompactCurrencyBRL = useCallback(
    (value: number) => {
      const absolute = Math.abs(value);
      const formatter = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });

      if (absolute >= 1000000) return `R$ ${formatter.format(value / 1000000)}M`;
      if (absolute >= 1000) return `R$ ${formatter.format(value / 1000)}K`;

      return formatCurrencyBRL.format(value);
    },
    [formatCurrencyBRL],
  );

  // Só o realizado. As metas que existiam aqui eram derivadas do próprio
  // resultado (comissão × 1,35 com piso de 360k, vendas × 0,35 + 2, leads × 0,2
  // + 3) e a "ficha" era travada em min(leads, meta) — o gráfico comparava o
  // número com ele mesmo. Meta de verdade mora em `goals` (categoria `vgc`);
  // enquanto não estiver ligada, nada de meta na tela.
  const metricasIndComissaoMetasView = useMemo(() => {
    const row = rankingMetricasIndividuais.find((x) => x.corretor === metricasIndCorretor);
    return {
      // A parte do corretor (rateio Lotus) — o mesmo número da coluna "Comissão
      // do corretor" do ranking. O VGC fica ao lado, como na planilha, senão a
      // mesma tela mostra dois valores de "comissão" que não conversam.
      comissaoCorretor: metricasIndVendas?.comissaoCorretor ?? null,
      comissaoVgc: metricasIndVendas?.comissaoTotal ?? 0,
      vgvRecebido: metricasIndVendas?.vgvTotal ?? 0,
      exclusivos: metricasIndVendas?.vendasExclusivas ?? 0,
      leadsAtivos: metricasIndLeads?.totalLeads ?? row?.gestaoAtiva ?? 0,
    };
  }, [
    rankingMetricasIndividuais,
    metricasIndCorretor,
    metricasIndVendas,
    metricasIndLeads,
  ]);

  /** Comissão recebida por mês no período — sai das propostas assinadas. */
  const comissaoPorMesData = useMemo(() => {
    const porMes = new Map<string, number>();
    for (const row of metricasIndVendasView.rows) {
      const mes = String(row.data).slice(0, 7); // YYYY-MM
      if (!mes) continue;
      porMes.set(mes, (porMes.get(mes) || 0) + row.comissao);
    }
    const meses = [...porMes.keys()].sort();

    return {
      labels: meses.map((mes) => {
        const [ano, m] = mes.split('-');
        return `${m}/${ano}`;
      }),
      datasets: [
        {
          label: 'Comissão recebida',
          data: meses.map((mes) => (porMes.get(mes) || 0) / 1000),
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          borderRadius: 10,
          maxBarThickness: 80,
        },
      ],
    };
  }, [metricasIndVendasView]);

  const corretorIndividualDashboardModel = useMemo(() => {
    const row = rankingMetricasIndividuais.find((x) => x.corretor === metricasIndCorretor);
    return buildCorretorMetricasCompletas({
      nomeCorretor: metricasIndCorretor || '—',
      rankingPosicao: row?.ranking ?? 1,
      leads: metricasIndLeads,
      vendas: metricasIndVendas,
      gestaoAtivaRanking: row?.gestaoAtiva ?? 0,
      // Do próprio corretor: antes vinha do KPI do tenant inteiro.
      tempoMedioRespostaMin: metricasIndLeads?.tempoMedioRespostaMin ?? 0,
    });
  }, [
    rankingMetricasIndividuais,
    metricasIndCorretor,
    metricasIndLeads,
    metricasIndVendas,
  ]);

  const comissaoChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { color: '#374151', font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.98)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          cornerRadius: 10,
        },
        datalabels: {
          display: false,
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(17, 24, 39, 0.08)' },
          ticks: { color: '#6B7280', font: { size: 10 } },
        },
        y: {
          grid: { color: 'rgba(17, 24, 39, 0.08)' },
          ticks: {
            color: '#6B7280',
            font: { size: 10 },
            callback: (value: any) => `${value} Mil`,
          },
        },
      },
    };
  }, []);

  const getInitials = (name: string) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map(p => p[0]).join('');
    return initials.toUpperCase();
  };

  const rankingColumnColors = useMemo(() => {
    return {
      corretores: '#14263C',
      ranking: '#1B3D7A',
      valorComissao: '#234992',
      vendasFeitas: '#2A5A8A',
      gestaoAtiva: '#3A6FA0',
      header: '#0F1E30',
    };
  }, []);

  // Opções padrão para gráficos de barra
  const defaultBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#6b7280',
          font: { size: 11 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(75, 85, 99, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
      datalabels: {
        display: exibirValores,
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#6b7280', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(107, 114, 128, 0.1)' },
        ticks: { color: '#6b7280', font: { size: 10 } }
      }
    }
  };

  // ═══ DADOS BASE (declarados cedo para uso em modais e gráficos) ═══
  const allLeadsEarly = useMemo(() => canonicalizeOrigemLeads([...processedLeadsInteressado, ...processedLeadsProprietario]), [processedLeadsInteressado, processedLeadsProprietario]);
  const convertidosEarly = useMemo(() => allLeadsEarly.filter(l => {
    const etapa = (l.etapa_atual || '').toLowerCase();
    return etapa.includes('assinada') || etapa.includes('fechamento') || etapa.includes('contrato');
  }), [allLeadsEarly]);

  // Equipes reais do tenant (mesmo resolver das métricas de equipe: traz teams
  // + o de-para usuário/nome -> equipe, com cache de 5 min).
  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;
    let ativo = true;
    buscarMapaEquipesPorTenant(tenantId)
      .then((resolver) => { if (ativo) setTeamResolver(resolver); })
      .catch((error) => console.error('Erro ao carregar equipes do tenant:', error));
    return () => { ativo = false; };
  }, [tenantId]);

  const equipeSelecionada = equipeFiltro !== 'todas'
    ? teamResolver?.teamById.get(equipeFiltro) ?? null
    : null;

  /**
   * Recorta uma lista de leads pela equipe escolhida. Sem filtro (ou antes de as
   * equipes carregarem) devolve a lista intacta — o gráfico nunca fica vazio por
   * causa de dado que ainda não chegou.
   */
  const filtrarPorEquipe = useCallback((leads: ProcessedLead[]) => {
    if (!equipeSelecionada || !teamResolver) return leads;
    return leads.filter((lead) => resolverEquipeDoLead(teamResolver, {
      assigned_agent_id: lead.assigned_agent_id,
      assigned_agent_name: lead.corretor_responsavel,
    })?.id === equipeSelecionada.id);
  }, [equipeSelecionada, teamResolver]);

  // Recortes consumidos SÓ pelos gráficos da aba Métricas. As demais abas
  // (Marketing, Financeiro, Imóveis) seguem sobre a lista inteira.
  const leadsEquipe = useMemo(() => filtrarPorEquipe(allLeadsEarly), [filtrarPorEquipe, allLeadsEarly]);
  const convertidosEquipe = useMemo(() => filtrarPorEquipe(convertidosEarly), [filtrarPorEquipe, convertidosEarly]);

  // As propostas assinadas do período. Servem a dois consumidores da aba
  // Métricas: os cards quando há equipe escolhida (aí o VGV/VGC é recalculado
  // aqui) e o rateio Lotus do card "Líquido imobiliária", que precisa da venda
  // por corretor — `kpisRelatorios` só traz o bolo somado.
  useEffect(() => {
    if (!tenantId || tenantId === 'owner' || activeSubArea !== 'metricas') return;
    let ativo = true;
    buscarVendasAssinadas(tenantId, dataInicial, dataFinal)
      .then((vendas) => { if (ativo) setVendasDoPeriodo(vendas); })
      .catch((error) => console.error('Erro ao carregar vendas do período:', error));
    return () => { ativo = false; };
  }, [tenantId, dataInicial, dataFinal, activeSubArea]);

  /** As vendas que os cards estão mostrando: do tenant ou só as da equipe. */
  const vendasVisiveis = useMemo(() => {
    if (!vendasDoPeriodo) return null;
    if (!equipeSelecionada) return vendasDoPeriodo;
    return vendasDoPeriodo.filter((venda) => resolverEquipeDoLead(teamResolver!, {
      assigned_agent_id: venda.agentUserId,
      assigned_agent_name: venda.agentNome,
    })?.id === equipeSelecionada.id);
  }, [vendasDoPeriodo, equipeSelecionada, teamResolver]);

  /**
   * Rateio Lotus do período — o mesmo motor do ranking, para o card do líquido
   * não discordar da tabela logo ao lado. Fica em estado porque o rateio lê o
   * nível/Líder Direto de cada corretor no banco.
   */
  const [rateioPeriodo, setRateioPeriodo] = useState<
    { corretor: number; imobiliaria: number; semRateio: number; resolverIndisponivel: boolean } | null
  >(null);
  useEffect(() => {
    if (!tenantId || tenantId === 'owner' || !vendasVisiveis) return;
    let ativo = true;
    setRateioPeriodo(null); // some com o número velho enquanto o novo não chega
    ratearComissaoDasVendas(tenantId, vendasVisiveis)
      .then((rateio) => { if (ativo) setRateioPeriodo(rateio); })
      .catch((error) => console.error('Erro ao ratear comissão do período:', error));
    return () => { ativo = false; };
  }, [tenantId, vendasVisiveis]);

  /**
   * O líquido só é um número quando ALGUÉM foi rateado. Se todo corretor do
   * período caiu em `semRateio` — ninguém com nível cadastrado, ou a leitura de
   * `tenant_memberships` falhou (ela dá timeout de vez em quando) — R$ 0,00
   * seria afirmar que a imobiliária não ficou com nada. Aí o card mostra "—".
   */
  const liquidoImobiliaria = useMemo(() => {
    if (!rateioPeriodo) return null;
    const rateado = rateioPeriodo.corretor + rateioPeriodo.imobiliaria > 0;
    return rateioPeriodo.semRateio > 0 && !rateado ? null : rateioPeriodo.imobiliaria;
  }, [rateioPeriodo]);

  /**
   * KPIs do topo. Sem filtro são os do servidor (tenant inteiro). Com equipe
   * escolhida são recalculados aqui, pela MESMA regra lead -> equipe usada nos
   * gráficos — senão os cards contradiriam os gráficos logo abaixo deles.
   */
  const kpisVisiveis = useMemo(() => {
    if (!equipeSelecionada) return kpisRelatorios;
    if (!vendasDoPeriodo) return null; // carregando: os cards mostram "—"

    const leadsNoPeriodo = leadsEquipe.filter(
      (lead) => lead.data_entrada >= dataInicial && lead.data_entrada <= dataFinal,
    ).length;

    const totais = somarVendas(vendasVisiveis ?? []);

    return {
      ...kpisRelatorios,
      totalLeadsRecebidos: leadsNoPeriodo,
      vendasAssinadas: totais.vendas,
      vgv: totais.vgv,
      vgc: totais.vgc,
      ticketMedio: totais.vendas > 0 ? totais.vgv / totais.vendas : 0,
    };
  }, [equipeSelecionada, kpisRelatorios, vendasDoPeriodo, vendasVisiveis, leadsEquipe, dataInicial, dataFinal]);

  const openChartModal = (
    chart:
      | 'tempo_interacao_usuario'
      | 'atividades_aberto_usuario'
      | 'leads_interagidos_usuario'
      | 'leads_convertidos_usuario'
  ) => {
    setActiveChartModal(chart);
    setIsChartModalOpen(true);
  };

  const closeChartModal = () => {
    setIsChartModalOpen(false);
    setActiveChartModal(null);
  };

  const modalBarOptions = useMemo(() => {
    const base = {
      ...defaultBarOptions,
      indexAxis: 'y' as const,
    };

    return {
      ...base,
      scales: {
        ...base.scales,
        x: {
          ...base.scales?.x,
          ticks: {
            ...base.scales?.x?.ticks,
            font: { size: 11 },
          },
        },
        y: {
          ...base.scales?.y,
          ticks: {
            ...base.scales?.y?.ticks,
            font: { size: 11 },
            maxRotation: 0,
            minRotation: 0,
          },
        },
      },
    };
  }, [defaultBarOptions]);

  // Modais expandidos — usam os mesmos dados reais dos corretores
  const allCorretorCounts = useMemo(() => countByField(leadsEquipe, 'corretor_responsavel'), [leadsEquipe]);
  const allCorretorTop = useMemo(() => topN(allCorretorCounts, 30), [allCorretorCounts]);
  const ALL_CORRETORES = allCorretorTop.labels;

  const modalLeadsInteragidosUsuarioData = useMemo(() => ({
    labels: ALL_CORRETORES,
    datasets: [
      {
        label: 'Interagidos',
        data: ALL_CORRETORES.map(nome => leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() !== 'novos leads').length),
        backgroundColor: CHART_COLORS.primary,
        borderRadius: 6,
      },
      {
        label: 'Não Interagidos',
        data: ALL_CORRETORES.map(nome => leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() === 'novos leads').length),
        backgroundColor: CHART_COLORS.primaryLight,
        borderRadius: 6,
      },
    ],
  }), [leadsEquipe, ALL_CORRETORES]);

  const modalLeadsConvertidosUsuarioData = useMemo(() => ({
    labels: ALL_CORRETORES,
    datasets: [{
      label: 'Leads Convertidos',
      data: ALL_CORRETORES.map(nome => convertidosEquipe.filter(l => l.corretor_responsavel === nome).length),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }],
  }), [convertidosEquipe, ALL_CORRETORES]);

  const modalTempoInteracaoUsuarioData = useMemo(() => {
    const temposPorCorretor = ALL_CORRETORES.map(nome => {
      const leadsDoCorretor = leadsEquipe.filter(l => l.corretor_responsavel === nome);
      const leadsComInteracao = leadsDoCorretor.filter(l => l.data_entrada && l.Data_visita);
      
      if (leadsComInteracao.length === 0) return 0;
      
      const tempos = leadsComInteracao.map(l => {
        const diff = new Date(l.Data_visita).getTime() - new Date(l.data_entrada).getTime();
        return Math.floor(diff / (1000 * 60)); // Converter para minutos
      });
      
      return Math.round(tempos.reduce((sum, t) => sum + t, 0) / tempos.length);
    });
    
    return {
      labels: ALL_CORRETORES,
      datasets: [{
        label: 'Tempo médio (min)',
        data: temposPorCorretor,
        backgroundColor: CHART_COLORS.primary,
        borderRadius: 6,
      }]
    };
  }, [leadsEquipe, ALL_CORRETORES]);

  const modalAtividadesAbertoUsuarioData = useMemo(() => {
    const visitaData = ALL_CORRETORES.map(nome =>
      leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('visita')).length
    );
    const propostaData = ALL_CORRETORES.map(nome =>
      leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('proposta')).length
    );
    return {
      labels: ALL_CORRETORES,
      datasets: [
        { label: 'Visitas', data: visitaData, backgroundColor: CHART_COLORS.primaryDark, borderRadius: 6 },
        { label: 'Propostas', data: propostaData, backgroundColor: CHART_COLORS.primaryLight, borderRadius: 6 },
      ],
    };
  }, [leadsEquipe, ALL_CORRETORES]);

  const stackedBarOptions = {
    ...defaultBarOptions,
    scales: {
      ...defaultBarOptions.scales,
      x: { ...defaultBarOptions.scales.x, stacked: true },
      y: { ...defaultBarOptions.scales.y, stacked: true }
    }
  };

  const modalStackedBarOptions = useMemo(() => {
    return {
      ...stackedBarOptions,
      indexAxis: 'y' as const,
      scales: {
        ...stackedBarOptions.scales,
        x: {
          ...stackedBarOptions.scales?.x,
          ticks: {
            ...stackedBarOptions.scales?.x?.ticks,
            font: { size: 11 },
          },
        },
        y: {
          ...stackedBarOptions.scales?.y,
          ticks: {
            ...stackedBarOptions.scales?.y?.ticks,
            font: { size: 11 },
            maxRotation: 0,
            minRotation: 0,
          },
        },
      },
    };
  }, [stackedBarOptions]);

  // ═══ DADOS REAIS DOS GRÁFICOS (calculados a partir dos leads do Supabase) ═══
  const allLeads = useMemo(() => canonicalizeOrigemLeads([...processedLeadsInteressado, ...processedLeadsProprietario]), [processedLeadsInteressado, processedLeadsProprietario]);

  // Canal efetivo de cada origem: escolha salva do tenant (Configurações >
  // Canais de Lead) > sugestão automática do classificador.
  const { getCanal } = useLeadSourceChannels();
  const { costs: leadSourceCosts } = useLeadSourceCosts();

  const BLUE_STACKED_SHADES = [
    CHART_COLORS.primaryDark,
    CHART_COLORS.primary,
    'rgba(59, 130, 246, 0.65)',
    CHART_COLORS.primaryLight,
    'rgba(59, 130, 246, 0.35)',
    'rgba(59, 130, 246, 0.25)',
  ];

  // 1. Leads por Origem - Total (dados reais)
  const origemCounts = useMemo(() => countByField(allLeads, 'origem_lead'), [allLeads]);
  const origemTop = useMemo(() => topN(origemCounts, 10), [origemCounts]);

  const leadsTotalOrigemData = {
    labels: origemTop.labels,
    datasets: [{
      label: 'Total de Leads',
      data: origemTop.values,
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }]
  };

  // 2. Leads por Origem diário (últimos 14 dias, dados reais)
  const dailyLabels = generateDailyLabels(14);
  const origemLabels = origemTop.labels.slice(0, 6);

  const leadsPorOrigemData = useMemo(() => {
    const now = new Date();
    const datasets = origemLabels.map((origem, idx) => {
      const data = dailyLabels.map((_, dayIdx) => {
        const date = subDays(now, 13 - dayIdx);
        const dateStr = format(date, 'yyyy-MM-dd');
        return allLeads.filter(l => l.origem_lead === origem && (l.data_entrada || '').startsWith(dateStr)).length;
      });
      return {
        label: origem,
        data,
        backgroundColor: BLUE_STACKED_SHADES[Math.min(idx, BLUE_STACKED_SHADES.length - 1)],
        borderRadius: 4,
      };
    });
    return { labels: dailyLabels, datasets };
  }, [allLeads, dailyLabels, origemLabels]);

  // 2b. Leads por Canal diário (origens agrupadas pelo canal efetivo)
  const canalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allLeads.forEach(l => {
      const canal = getCanal(l.origem_lead);
      counts[canal] = (counts[canal] || 0) + 1;
    });
    return counts;
  }, [allLeads, getCanal]);
  const canalTop = useMemo(() => topN(canalCounts, 10), [canalCounts]);
  const canalLabels = canalTop.labels.slice(0, 6);

  const leadsPorCanalData = useMemo(() => {
    const now = new Date();
    const datasets = canalLabels.map((canal, idx) => {
      const data = dailyLabels.map((_, dayIdx) => {
        const date = subDays(now, 13 - dayIdx);
        const dateStr = format(date, 'yyyy-MM-dd');
        return allLeads.filter(l => getCanal(l.origem_lead) === canal && (l.data_entrada || '').startsWith(dateStr)).length;
      });
      return {
        label: canal,
        data,
        backgroundColor: BLUE_STACKED_SHADES[Math.min(idx, BLUE_STACKED_SHADES.length - 1)],
        borderRadius: 4,
      };
    });
    return { labels: dailyLabels, datasets };
  }, [allLeads, dailyLabels, canalLabels, getCanal]);

  // 3. Leads convertidos por Origem (leads que chegaram a Proposta Assinada)
  const convertidos = useMemo(() => allLeads.filter(l => {
    const etapa = (l.etapa_atual || '').toLowerCase();
    return etapa.includes('assinada') || etapa.includes('fechamento') || etapa.includes('contrato');
  }), [allLeads]);

  const convertidosOrigemCounts = useMemo(() => countByField(convertidos, 'origem_lead'), [convertidos]);
  const convertidosOrigemTop = useMemo(() => topN(convertidosOrigemCounts, 10), [convertidosOrigemCounts]);

  const leadsConvertidosOrigemData = {
    labels: convertidosOrigemTop.labels.length > 0 ? convertidosOrigemTop.labels : origemTop.labels,
    datasets: [{
      label: 'Leads Convertidos',
      data: convertidosOrigemTop.values.length > 0 ? convertidosOrigemTop.values : origemTop.labels.map(() => 0),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }]
  };

  // 3b. Leads convertidos por Canal (origens agrupadas pelo canal efetivo)
  const convertidosCanalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    convertidos.forEach(l => {
      const canal = getCanal(l.origem_lead);
      counts[canal] = (counts[canal] || 0) + 1;
    });
    return counts;
  }, [convertidos, getCanal]);
  const convertidosCanalTop = useMemo(() => topN(convertidosCanalCounts, 10), [convertidosCanalCounts]);

  const leadsConvertidosCanalData = {
    labels: convertidosCanalTop.labels.length > 0 ? convertidosCanalTop.labels : canalTop.labels,
    datasets: [{
      label: 'Leads Convertidos',
      data: convertidosCanalTop.values.length > 0 ? convertidosCanalTop.values : canalTop.labels.map(() => 0),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }]
  };

  // 4. Leads por Corretor (dados reais)
  const corretorCounts = useMemo(() => countByField(leadsEquipe, 'corretor_responsavel'), [leadsEquipe]);
  const corretorTop = useMemo(() => topN(corretorCounts, 15), [corretorCounts]);
  const REAL_CORRETORES = corretorTop.labels;

  const leadsInteragidosUsuarioData = useMemo(() => {
    const interagidos = REAL_CORRETORES.map(nome => {
      return leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() !== 'novos leads').length;
    });
    const naoInteragidos = REAL_CORRETORES.map(nome => {
      return leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() === 'novos leads').length;
    });
    return {
      labels: REAL_CORRETORES,
      datasets: [
        { label: 'Interagidos', data: interagidos, backgroundColor: CHART_COLORS.primaryDark, borderRadius: 6 },
        { label: 'Não Interagidos', data: naoInteragidos, backgroundColor: CHART_COLORS.primaryLight, borderRadius: 6 },
      ]
    };
  }, [leadsEquipe, REAL_CORRETORES]);

  // 5. Leads convertidos por Usuário
  const leadsConvertidosUsuarioData = {
    labels: REAL_CORRETORES,
    datasets: [{
      label: 'Leads Convertidos',
      data: REAL_CORRETORES.map(nome => convertidosEquipe.filter(l => l.corretor_responsavel === nome).length),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }]
  };

  // 6. Tempo de primeira interação por Usuário (dados reais)
  const tempoInteracaoData = useMemo(() => {
    const temposPorCorretor = REAL_CORRETORES.map(nome => {
      const leadsDoCorretor = leadsEquipe.filter(l => l.corretor_responsavel === nome);
      const leadsComInteracao = leadsDoCorretor.filter(l => l.data_entrada && l.Data_visita);
      
      if (leadsComInteracao.length === 0) return 0;
      
      const tempos = leadsComInteracao.map(l => {
        const diff = new Date(l.Data_visita).getTime() - new Date(l.data_entrada).getTime();
        return Math.floor(diff / (1000 * 60)); // Converter para minutos
      });
      
      return Math.round(tempos.reduce((sum, t) => sum + t, 0) / tempos.length);
    });
    
    return {
      labels: REAL_CORRETORES,
      datasets: [{
        label: 'Tempo médio (min)',
        data: temposPorCorretor,
        backgroundColor: CHART_COLORS.primary,
        borderRadius: 6,
      }]
    };
  }, [leadsEquipe, REAL_CORRETORES]);

  const atividadesAbertoData = useMemo(() => {
    const visitaData = REAL_CORRETORES.map(nome =>
      leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('visita')).length
    );
    const negociacaoData = REAL_CORRETORES.map(nome =>
      leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('negociação')).length
    );
    const propostaData = REAL_CORRETORES.map(nome =>
      leadsEquipe.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('proposta')).length
    );
    return {
      labels: REAL_CORRETORES,
      datasets: [
        { label: 'Visitas', data: visitaData, backgroundColor: CHART_COLORS.primaryDark, borderRadius: 4 },
        { label: 'Negociação', data: negociacaoData, backgroundColor: CHART_COLORS.primary, borderRadius: 4 },
        { label: 'Propostas', data: propostaData, backgroundColor: CHART_COLORS.primaryLight, borderRadius: 4 },
      ]
    };
  }, [leadsEquipe, REAL_CORRETORES]);

  // 7. Leads por Temperatura (distribuição real)
  const tempCounts = useMemo(() => countByField(allLeads, 'status_temperatura'), [allLeads]);

  // 8. Leads por Etapa do Funil
  const etapaCounts = useMemo(() => countByField(leadsEquipe, 'etapa_atual'), [leadsEquipe]);
  const etapaTop = useMemo(() => topN(etapaCounts, 10), [etapaCounts]);

  const leadsPorEquipeData = {
    labels: etapaTop.labels,
    datasets: [{
      label: 'Leads',
      data: etapaTop.values,
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }]
  };

  // 9. Vendas por faixa de valor (propostas assinadas, últimos 12 meses).
  // Antes este gráfico era `leadsByMonth(allLeads)` — leads por mês exibidos
  // sob o título "Vendas por Faixa de Valor". Nem venda, nem faixa.
  const vendasFaixaChartData = {
    labels: vendasPorFaixa.map(d => d.mes),
    datasets: [
      { label: 'Até 500K', data: vendasPorFaixa.map(d => d.ate_500k), backgroundColor: CHART_COLORS.primaryLight, borderRadius: 4 },
      { label: '500K a 1M', data: vendasPorFaixa.map(d => d.de_500k_999k), backgroundColor: CHART_COLORS.primary, borderRadius: 4 },
      { label: 'Acima de 1M', data: vendasPorFaixa.map(d => d.acima_1m), backgroundColor: CHART_COLORS.primaryDark, borderRadius: 4 },
    ]
  };

  // 10. Tempo Médio de Resposta por Equipe (dados reais)
  // `metricasEquipes` já vem quebrado por equipe: com filtro ativo, sobra a barra dela.
  const metricasEquipesVisiveis = equipeSelecionada
    ? metricasEquipes.filter(d => d.equipe === equipeSelecionada.name)
    : metricasEquipes;

  const tempoRespostaChartData = {
    labels: metricasEquipesVisiveis.map(d => d.equipe),
    datasets: [{
      label: 'Tempo (min)',
      data: metricasEquipesVisiveis.map(d => d.tempoMedio),
      backgroundColor: metricasEquipesVisiveis.map(d => d.cor),
      borderRadius: 6,
    }]
  };

  // 11. Taxa de Conversão por Origem
  const taxaConversaoChartData = useMemo(() => {
    const origens = origemTop.labels.slice(0, 6);
    const taxas = origens.map(origem => {
      const total = leadsEquipe.filter(l => l.origem_lead === origem).length;
      const conv = convertidosEquipe.filter(l => l.origem_lead === origem).length;
      return total > 0 ? Math.round((conv / total) * 1000) / 10 : 0;
    });
    return {
      labels: origens,
      datasets: [{ label: 'Taxa (%)', data: taxas, backgroundColor: CHART_COLORS.primary, borderRadius: 6 }]
    };
  }, [leadsEquipe, convertidosEquipe, origemTop.labels]);

  // 12. Exclusivo vs Ficha — captação, então só o funil de Proprietário conta.
  //
  // Antes o filtro era `etapa_atual.includes('exclusivo')` sobre TODOS os leads,
  // e errava três vezes: "Não Exclusivo" contém "exclusivo" e caía como
  // exclusivo; interessado não tem etapa de exclusividade, então engordava a
  // "Ficha"; e o fallback `|| allLeads.length` inventava a barra quando não
  // havia dado. "Exclusivo" e "Não Exclusivo" são etapas reais do funil de
  // Proprietário (PROPRIETARIO_STAGE_ORDER) — a contagem é a mesma do funil.
  const exclusivoCount = countProprietariosInStage(processedLeadsProprietario, 'Exclusivo');
  const naoExclusivoCount = countProprietariosInStage(processedLeadsProprietario, 'Não Exclusivo');

  const distribuicaoExclusivoFichaChartData = {
    labels: ['Exclusivo', 'Ficha'],
    datasets: [{
      label: 'Proprietários',
      data: [exclusivoCount, naoExclusivoCount],
      backgroundColor: [CHART_COLORS.primaryLight, CHART_COLORS.primaryDark],
      borderRadius: 6,
    }]
  };

  const financeiroImoveisMensal = useMemo(() => {
    return financeiroImoveis?.monthly ?? [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ].map((mes, index) => ({
      mes,
      mesNumero: index + 1,
      vgv: 0,
      vgc: 0,
      vendas: 0,
    }));
  }, [financeiroImoveis]);

  const financeiroImoveisKpis = useMemo(() => ({
    vgvTotal: financeiroImoveis?.vgvTotal ?? 0,
    vgcTotal: financeiroImoveis?.vgcTotal ?? 0,
    vendasTotal: financeiroImoveis?.vendasTotal ?? 0,
    ticketMedio: financeiroImoveis?.ticketMedio ?? 0,
  }), [financeiroImoveis]);

  // 13. Financeiro de imóveis: commercial_sales quando existir, com fallback em transações/leads
  const vgvChartData = {
    labels: financeiroImoveisMensal.map((item) => item.mes),
    datasets: [{
      label: 'VGV',
      data: financeiroImoveisMensal.map((item) => item.vgv),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 4,
    }]
  };

  const vgcChartData = {
    labels: financeiroImoveisMensal.map((item) => item.mes),
    datasets: [{
      label: 'VGC',
      data: financeiroImoveisMensal.map((item) => item.vgc),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 4,
    }]
  };

  // Evolução da carteira: o saldo é a linha; entradas/saídas ficam no tooltip.
  // Plotar os três juntos achataria a linha do saldo (dezenas) contra
  // movimentações que são de unidades.
  const carteiraChartData = useMemo(() => ({
    labels: evolucaoCarteira.map((m) => `${m.mes}/${String(m.ano).slice(2)}`),
    datasets: [
      {
        label: 'Em carteira',
        data: evolucaoCarteira.map((m) => m.carteira),
        borderColor: 'rgb(37, 99, 235)',
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  }), [evolucaoCarteira]);

  const carteiraChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number } }) => `${ctx.parsed.y} imóveis em carteira`,
          afterLabel: (ctx: { dataIndex: number }) => {
            const mes = evolucaoCarteira[ctx.dataIndex];
            if (!mes) return '';
            return `+${mes.entradas} entradas / -${mes.saidas} saídas`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6B7280', font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { color: '#6B7280', precision: 0 } },
    },
  }), [evolucaoCarteira]);

  // 14. Imóveis mais procurados (dados reais)
  const imovelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allLeads.forEach(l => {
      const code = l.codigo_imovel?.trim();
      if (code) counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [allLeads]);
  const imovelTop = useMemo(() => topN(imovelCounts, 10), [imovelCounts]);

  // Agrupa por `leads.property_code`. O título era "Bairros de Maior Interesse
  // de Venda", mas nunca houve bairro aqui: `leads` não tem a coluna, e a barra
  // maior da Lotus é "RESERVA CASTANHEIRA" (nome de lançamento).
  // ponytail: bairro real sairia de um join com `imoveis_locais.bairro`; hoje
  // só 2 dos 292 códigos de lead casam com a tabela, então o gráfico nasceria
  // vazio. Vale fazer quando a captação estiver alimentando `imoveis_locais`.
  const imoveisInteresseData = {
    labels: imovelTop.labels,
    datasets: [{
      label: 'Leads por imóvel',
      data: imovelTop.values,
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }]
  };

  // Opções otimizadas para o gráfico de motivos de arquivamento (30 itens)
  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '55%', // Doughnut com centro maior para visual mais limpo
    plugins: {
      legend: {
        display: false, // Legenda customizada será renderizada separadamente
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const value = context.raw;
            const percentage = ((value / total) * 100).toFixed(1);
            return `${context.label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  // Calcular totais e percentuais para a legenda customizada (dados reais por etapa)
  const motivosData = useMemo(() => {
    const etapaEntries = Object.entries(etapaCounts).sort((a, b) => b[1] - a[1]);
    const total = etapaEntries.reduce((sum, e) => sum + e[1], 0);
    return etapaEntries.map(([label, value], idx) => ({
      label,
      value,
      percentage: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
      color: PIE_COLORS[idx % PIE_COLORS.length]
    }));
  }, [etapaCounts]);

  // 10. Motivo de arquivamento (Doughnut)
  const motivosArquivamentoData = useMemo(() => {
    return {
      labels: motivosData.map((m) => m.label),
      datasets: [{
        data: motivosData.map((m) => m.value),
        backgroundColor: motivosData.map((m) => m.color),
        borderWidth: 2,
        borderColor: '#fff',
      }],
    };
  }, [motivosData]);

  const handlePesquisar = () => {
  };

  // ── Exportação configurável de relatórios ───────────────────────────────────
  // Monta o modelo a partir dos memos já calculados (sem cálculo novo) e o
  // converte conforme a sub-área ativa. Consumido pelo ExportReportDialog.
  // ── Exportação configurável de relatórios ───────────────────────────────────
  // Resumo financeiro (cálculo mais pesado) memoizado à parte.
  const financeiroResumoExport = useMemo(() => {
    const costsByKey: Record<string, number> = {};
    Object.entries(leadSourceCosts || {}).forEach(([origem, valor]) => {
      costsByKey[origemKey(origem)] = Number(valor) || 0;
    });
    return buildFinanceiroResumo({ leads: allLeads, costsByKey, periodo: 'mensal' });
  }, [leadSourceCosts, allLeads]);

  // Monta o modelo a partir dos memos já calculados (sem cálculo novo). Os
  // gráficos viram dados neutros via fromChartJs — sem captura de tela.
  const reportSource = useMemo<ReportSource>(() => ({
    subtitle: `Período: ${dataInicial} a ${dataFinal}`,
    marketing: {
      kpis: kpisCalculados,
      charts: {
        canal: fromChartJs(leadsPorCanalData, 'stackedBar'),
        origem: fromChartJs(leadsPorOrigemData, 'stackedBar'),
        origemTotal: fromChartJs(leadsTotalOrigemData, 'horizontalBar'),
        convOrigem: fromChartJs(leadsConvertidosOrigemData, 'horizontalBar'),
        convCanal: fromChartJs(leadsConvertidosCanalData, 'bar'),
        motivos: fromChartJs(motivosArquivamentoData, 'doughnut'),
      },
    },
    metricas: {
      subArea: activeMetricasSubArea === 'ranking' ? 'ranking' : 'visao-geral',
      kpis: {
        leadsNoPeriodo: kpisVisiveis?.totalLeadsRecebidos ?? 0,
        vendasAssinadas: kpisVisiveis?.vendasAssinadas ?? 0,
        vgvFormatado: formatCompactCurrencyBRL(kpisVisiveis?.vgv ?? 0),
        vgcFormatado: formatCompactCurrencyBRL(kpisVisiveis?.vgc ?? 0),
        liquidoImobiliariaFormatado: liquidoImobiliaria === null ? '—' : formatCompactCurrencyBRL(liquidoImobiliaria),
        ticketMedioFormatado: formatCompactCurrencyBRL(kpisVisiveis?.ticketMedio ?? 0),
      },
      charts: {
        leadsEquipe: fromChartJs(leadsPorEquipeData, 'bar'),
        tempoEquipe: fromChartJs(tempoRespostaChartData, 'bar'),
        convEquipe: fromChartJs(taxaConversaoChartData, 'bar'),
        leadsUsuario: fromChartJs(leadsInteragidosUsuarioData, 'bar'),
        tempoUsuario: fromChartJs(tempoInteracaoData, 'bar'),
        atividadesUsuario: fromChartJs(atividadesAbertoData, 'stackedBar'),
        convUsuario: fromChartJs(leadsConvertidosUsuarioData, 'bar'),
      },
      ranking: rankingMetricasIndividuais.map((r) => ({
        ranking: r.ranking,
        corretor: r.corretor,
        valorComissao: r.valorComissao,
        vendasFeitas: r.vendasFeitas,
        gestaoAtiva: r.gestaoAtiva,
      })),
    },
    metricasIndividuais: {
      subArea: activeMetricasIndSubArea,
      corretor: metricasIndCorretor || '—',
      comissaoMetas: metricasIndComissaoMetasView,
      leads: {
        totalLeads: metricasIndLeadsView.totalLeads,
        leadsRecebidos: metricasIndLeadsView.leadsRecebidos,
        visitas: metricasIndLeadsView.visitas,
      },
      vendas: {
        vendasTotal: metricasIndVendasView.vendasTotal,
        vendasExclusivas: metricasIndVendasView.vendasExclusivas,
        vendasNaoExclusivas: metricasIndVendasView.vendasNaoExclusivas,
        vgvTotal: metricasIndVendasView.vgvTotal,
        comissaoTotal: metricasIndVendasView.comissaoTotal,
        ticketMedio: metricasIndVendasView.ticketMedio,
        rows: metricasIndVendasView.rows.map((r) => ({
          codigo_imovel: r.codigo_imovel,
          exclusividade: r.exclusividade,
          fonte: r.fonte,
          valor_imovel: r.valor_imovel,
          comissao: r.comissao,
          data: r.data,
        })),
      },
      charts: {
        leadsFonte: fromChartJs(leadsPorFonteData, 'doughnut'),
        leadsImovel: fromChartJs(leadsPorImovelData, 'horizontalBar'),
        vendasFonte: fromChartJs(vendasPorFonteData, 'bar'),
      },
    },
    imoveis: {
      financeiro: financeiroImoveis,
      charts: {
        vgv: fromChartJs(vgvChartData, 'bar', 'currency'),
        vgc: fromChartJs(vgcChartData, 'bar', 'currency'),
        imoveis: fromChartJs(imoveisInteresseData, 'horizontalBar'),
        faixa: fromChartJs(vendasFaixaChartData, 'bar'),
        exclusivo: fromChartJs(distribuicaoExclusivoFichaChartData, 'stackedBar'),
        // O exportador não desenha linha; no PDF/Excel o saldo vira barra por mês.
        carteira: fromChartJs(carteiraChartData, 'bar'),
      },
    },
    financeiro: { resumo: financeiroResumoExport },
  }), [
    dataInicial, dataFinal, kpisCalculados,
    leadsPorCanalData, leadsPorOrigemData, leadsTotalOrigemData, leadsConvertidosOrigemData, leadsConvertidosCanalData, motivosArquivamentoData,
    activeMetricasSubArea, kpisVisiveis, liquidoImobiliaria, formatCompactCurrencyBRL,
    leadsPorEquipeData, tempoRespostaChartData, taxaConversaoChartData, leadsInteragidosUsuarioData, tempoInteracaoData, atividadesAbertoData, leadsConvertidosUsuarioData,
    rankingMetricasIndividuais, activeMetricasIndSubArea, metricasIndCorretor, metricasIndComissaoMetasView, metricasIndLeadsView, metricasIndVendasView,
    leadsPorFonteData, leadsPorImovelData, vendasPorFonteData,
    financeiroImoveis, vgvChartData, vgcChartData, imoveisInteresseData, vendasFaixaChartData, distribuicaoExclusivoFichaChartData, carteiraChartData,
    financeiroResumoExport,
  ]);

  const reportModel = useMemo(
    // A aba 'excel' e uma tela de IMPORTACAO, sem relatorio exportavel: buildReportModel
    // devolve um modelo vazio para ela. As demais sub-areas tem builder proprio.
    () => buildReportModel(activeSubArea, reportSource),
    [activeSubArea, reportSource],
  );

  if (activeSubArea === 'excel') {
    return <GenericImportPage />;
  }

  return (
    <div ref={reportRef} className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary, #f5f5f5)' }}>

      {/* Barra de ações do relatório */}
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={() => setIsExportOpen(true)}
          className="h-9 px-4 btn-octo-primary rounded-lg font-medium text-sm inline-flex items-center gap-2 shadow-sm transition-all hover:shadow-md"
        >
          <Download className="h-4 w-4" />
          Exportar Relatório
        </button>
      </div>

      <ExportReportDialog open={isExportOpen} onOpenChange={setIsExportOpen} model={reportModel} />

      {/* Área de Filtros */}
      {activeSubArea === 'metricas' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Filtro de Equipe — opções vindas de `teams` do tenant */}
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Equipe
              </label>
              <select
                value={equipeFiltro}
                onChange={(e) => setEquipeFiltro(e.target.value)}
                disabled={!teamResolver}
                className="h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-60"
              >
                <option value="todas">Todas as equipes</option>
                {(teamResolver?.teams ?? []).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>

            {/* Filtro de Usuário */}
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" />
                Usuário
              </label>
              <select
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value="meu-usuario">Meu usuário</option>
                <option value="todos">Todos os usuários</option>
                {ALL_CORRETORES.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* Data Inicial */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                De
              </label>
              <input
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
                className="h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Data Final */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Até
              </label>
              <input
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                className="h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="flex gap-4 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Valores</label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={exibirValores}
                    onChange={(e) => setExibirValores(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Exibir no gráfico
                </label>
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <button
                onClick={handlePesquisar}
                className="h-10 px-5 btn-octo-primary rounded-lg font-medium text-sm flex items-center gap-2 transition-all"
              >
                <Search className="h-4 w-4" />
                Pesquisar
              </button>
            </div>
          </div>
        </div>
      )}
      <div ref={exportRef}>
      {/* SEÇÃO MARKETING — toggle Geral | Site */}
      {activeSubArea === 'marketing' && (
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 dark:border-slate-700 p-0.5 bg-gray-50 dark:bg-slate-800">
          {([['geral', 'Geral'], ['site', 'Site']] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setMktView(value);
                const params = new URLSearchParams(searchParams);
                if (value === 'site') {
                  params.set('view', 'site');
                } else {
                  params.delete('view');
                }
                window.history.replaceState(null, '', `?${params.toString()}`);
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mktView === value
                  ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {activeSubArea === 'marketing' && mktView === 'site' && <MarketingSiteTab />}
      {/* SEÇÃO MARKETING */}
      {activeSubArea === 'marketing' && mktView === 'geral' && (
        <>
      {/* KPIs Cards */}
      <div data-export-layout="kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads Recebidos</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpiNumero(kpisCalculados?.totalLeadsRecebidos)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads Interagidos</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpiNumero(kpisCalculados?.totalLeadsInteragidos)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads/dia (média)</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpiNumero(kpisCalculados?.mediaLeadsDia)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Tempo 1ª Interação</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisCalculados ? `${kpisCalculados.mediaTempoPrimeiraInteracao} min` : '—'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads Convertidos</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpiNumero(kpisCalculados?.totalLeadsConvertidos)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Gráficos */}
      <div data-export-layout="charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. Clientes recebidos por Canal */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Clientes recebidos por Canal</h3>
          <div className="h-[280px]">
            <Bar data={leadsPorCanalData} options={stackedBarOptions} />
          </div>
        </div>

        {/* 2. Clientes recebidos por Origem */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Clientes recebidos por Origem</h3>
          <div className="h-[280px]">
            <Bar data={leadsPorOrigemData} options={stackedBarOptions} />
          </div>
        </div>

        {/* 3. Leads por Origem - Total */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads por Origem - Total</h3>
          <div className="h-[280px]">
            <Bar data={leadsTotalOrigemData} options={{...defaultBarOptions, indexAxis: 'y' as const}} />
          </div>
        </div>

        {/* 4. Leads convertidos por Origem */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads convertidos por Origem</h3>
          <div className="h-[280px]">
            <Bar data={leadsConvertidosOrigemData} options={{...defaultBarOptions, indexAxis: 'y' as const}} />
          </div>
        </div>

        {/* 5. Leads convertidos por Canal */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads convertidos por Canal</h3>
          <div className="h-[280px]">
            <Bar data={leadsConvertidosCanalData} options={defaultBarOptions} />
          </div>
        </div>

      </div>

      {/* 10. Motivo de arquivamento - Layout especial para 30 itens - SEGUNDA PÁGINA */}
      <div data-export-item="motivos" data-page-break="before" className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5 mt-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Motivo de arquivamento</h3>
        <div data-export-layout="motivos" className="flex flex-col lg:flex-row gap-6">
          {/* Gráfico Doughnut */}
          <div className="flex-shrink-0 w-full lg:w-[320px] h-[320px] flex items-center justify-center">
            <Doughnut data={motivosArquivamentoData} options={pieOptions} />
          </div>
          
          {/* Legenda customizada em 3 colunas */}
          <div className="flex-1 overflow-hidden">
            <div data-export-layout="motivos-legend" data-export-expand="true" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1.5 max-h-[320px] overflow-y-auto pr-2">
              {motivosData.map((item, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors cursor-default group"
                  title={`${item.label}: ${item.value} leads (${item.percentage}%)`}
                >
                  <span 
                    className="motivos-color-swatch inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-gray-200 dark:border-slate-800 shadow-sm"
                    style={{ ['--swatch-color' as any]: item.color } as React.CSSProperties}
                  />
                  <span className="text-xs text-gray-600 dark:text-slate-400 flex-1 min-w-0 truncate">
                    {item.label}
                  </span>
                  <span className="text-xs font-medium text-gray-800 flex-shrink-0">
                    {item.percentage}%
                  </span>
                </div>
              ))}
            </div>
            
            {/* Resumo total */}
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-slate-400">Total de leads arquivados:</span>
                <span className="font-semibold text-gray-900 dark:text-slate-100">
                  {motivosData.reduce((acc, item) => acc + item.value, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* SEÇÃO FINANCEIRO */}
      {activeSubArea === 'financeiro' && (
        <FinanceiroTab leads={allLeads} />
      )}

      {/* SEÇÃO MÉTRICAS DA EQUIPE */}
      {activeSubArea === 'metricas' && (
        <>
          {/* Subárea Navigation */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 mb-6">
            <div className="flex flex-wrap gap-3">
              {[
                { key: 'visao-geral', label: 'Visão Geral', Icon: BarChart3 },
                { key: 'ranking', label: 'Ranking da Equipe', Icon: TrendingUp },
              ].map(({ key, label, Icon }) => {
                const isActive = activeMetricasSubArea === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveMetricasSubArea(key as 'visao-geral' | 'ranking');
                      const params = new URLSearchParams(searchParams);
                      params.set('tab', 'metricas');
                      params.set('metricasSubArea', key);
                      window.history.replaceState(null, '', `?${params.toString()}`);
                    }}
                    className={`h-10 px-4 rounded-lg border transition-all flex items-center gap-2 font-medium text-sm ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeMetricasSubArea === 'visao-geral' && (
            <>
              {/* KPIs Cards - Métricas */}
              <div data-export-layout="kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads no Período</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpiNumero(kpisVisiveis?.totalLeadsRecebidos)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas Assinadas</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpiNumero(kpisVisiveis?.vendasAssinadas)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">VGV</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisVisiveis ? formatCompactCurrencyBRL(kpisVisiveis.vgv) : '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Comissão (VGC)</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisVisiveis ? formatCompactCurrencyBRL(kpisVisiveis.vgc) : '—'}</p>
                    </div>
                  </div>
                </div>

                {/* O VGC ao lado é o bolo inteiro da venda; aqui é o que sobra
                    para a imobiliária depois do rateio Lotus — mesmo motor e
                    mesmo número da coluna "Líquido imobiliária" do ranking. */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Líquido imobiliária</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">
                        {liquidoImobiliaria === null ? '—' : formatCompactCurrencyBRL(liquidoImobiliaria)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Ticket Médio</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisVisiveis ? formatCompactCurrencyBRL(kpisVisiveis.ticketMedio) : '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sem a guarda de `liquidoImobiliaria !== null`: quando TODOS os
                  corretores estão sem nível, o card mostra "—" e é justamente
                  aí que o motivo precisa aparecer. E o motivo tem duas caras —
                  cadastro incompleto × membros que não puderam ser lidos. */}
              {rateioPeriodo?.resolverIndisponivel ? (
                <p className="-mt-3 mb-6 px-1 text-xs text-gray-500 dark:text-slate-400">
                  Não foi possível ler os membros da imobiliária agora, então o rateio não foi calculado.
                  O líquido volta ao atualizar a página — se insistir, é a leitura de equipe que está falhando,
                  não o cadastro.
                </p>
              ) : rateioPeriodo && rateioPeriodo.semRateio > 0 ? (
                <p className="-mt-3 mb-6 px-1 text-xs text-gray-500 dark:text-slate-400">
                  {rateioPeriodo.semRateio === 1
                    ? '1 corretor está sem nível de comissionamento ou Líder Direto cadastrado'
                    : `${rateioPeriodo.semRateio} corretores estão sem nível de comissionamento ou Líder Direto cadastrado`}
                  {' '}em Gestão de Equipe — a comissão deles não entra no líquido da imobiliária.
                </p>
              ) : null}

              {/* Grid de Gráficos - Métricas (Gestão de Equipe) */}
              <div data-export-layout="charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Leads por Equipe */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads por Etapa do Funil</h3>
                  <div className="h-[280px]">
                    <Bar data={leadsPorEquipeData} options={defaultBarOptions} />
                  </div>
                </div>

                {/* 3. Tempo Médio de Resposta por Equipe */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Tempo Médio de Resposta por Equipe</h3>
                  <div className="h-[280px]">
                    <Bar data={tempoRespostaChartData} options={defaultBarOptions} />
                  </div>
                </div>

                {/* 4. Taxa de Conversão por Equipe */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Taxa de Conversão por Equipe</h3>
                  <div className="h-[280px]">
                    <Bar data={taxaConversaoChartData} options={defaultBarOptions} />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads interagidos por Usuários</h3>
                  <div className="h-[280px]">
                    <Bar data={leadsInteragidosUsuarioData} options={defaultBarOptions} />
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => openChartModal('leads_interagidos_usuario')}
                      className="btn-octo-primary w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Exibir mais
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Tempo de primeira interação por Usuário</h3>
                  <div className="h-[280px]">
                    <Bar data={tempoInteracaoData} options={defaultBarOptions} />
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => openChartModal('tempo_interacao_usuario')}
                      className="btn-octo-primary w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Exibir mais
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Atividades em aberto por Usuário</h3>
                  <div className="h-[280px]">
                    <Bar data={atividadesAbertoData} options={stackedBarOptions} />
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => openChartModal('atividades_aberto_usuario')}
                      className="btn-octo-primary w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Exibir mais
                    </button>
                  </div>
                </div>

                {/* Leads convertidos por Usuário */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads convertidos por Usuário</h3>
                  <div className="h-[280px]">
                    <Bar data={leadsConvertidosUsuarioData} options={defaultBarOptions} />
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => openChartModal('leads_convertidos_usuario')}
                      className="btn-octo-primary w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Exibir mais
                    </button>
                  </div>
                </div>
              </div>

              {isChartModalOpen && activeChartModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <div className="mx-auto w-[84vw] max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-transparent flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                          {activeChartModal === 'leads_interagidos_usuario' && 'Leads interagidos por Usuários (todos os corretores)'}
                          {activeChartModal === 'tempo_interacao_usuario' && 'Tempo de primeira interação por Usuário (todos os corretores)'}
                          {activeChartModal === 'atividades_aberto_usuario' && 'Atividades em aberto por Usuário (todos os corretores)'}
                          {activeChartModal === 'leads_convertidos_usuario' && 'Leads convertidos por Usuário (todos os corretores)'}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Visualização completa com todos os corretores</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeChartModal}
                        className="px-4 py-2 rounded-lg border border-transparent text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        Fechar
                      </button>
                    </div>

                    <div className="px-6 py-5 overflow-y-auto overflow-x-hidden">
                      <div className="h-[60vh] min-h-[420px]">
                        {activeChartModal === 'leads_interagidos_usuario' && (
                          <Bar data={modalLeadsInteragidosUsuarioData} options={modalBarOptions} />
                        )}
                        {activeChartModal === 'tempo_interacao_usuario' && (
                          <Bar data={modalTempoInteracaoUsuarioData} options={modalBarOptions} />
                        )}
                        {activeChartModal === 'atividades_aberto_usuario' && (
                          <Bar data={modalAtividadesAbertoUsuarioData} options={modalStackedBarOptions} />
                        )}
                        {activeChartModal === 'leads_convertidos_usuario' && (
                          <Bar data={modalLeadsConvertidosUsuarioData} options={modalBarOptions} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-10">
                <MetricsDashboard />
              </div>
            </>
          )}

          {activeMetricasSubArea === 'ranking' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6 h-full min-h-[640px] flex flex-col">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-gray-800">Ranking</h3>
                      <div className="flex items-center gap-3">
                        <div className="hidden sm:block text-xs text-gray-500 dark:text-slate-400">Top 3 por comissão</div>
                        <div className="flex items-center gap-2">
                          <select
                            value={rankingPeriod}
                            onChange={(e) => setRankingPeriod(e.target.value as 'monthly' | 'quarterly' | 'semiannual' | 'yearly')}
                            className="h-9 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          >
                            <option value="monthly">Mensal</option>
                            <option value="quarterly">Trimestral</option>
                            <option value="semiannual">Semestral</option>
                            <option value="yearly">Anual</option>
                          </select>
                          {rankingPeriod === 'monthly' && (
                            <select
                              value={rankingMonth}
                              onChange={(e) => setRankingMonth(Number(e.target.value))}
                              className="h-9 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                              {[
                                'Janeiro',
                                'Fevereiro',
                                'Março',
                                'Abril',
                                'Maio',
                                'Junho',
                                'Julho',
                                'Agosto',
                                'Setembro',
                                'Outubro',
                                'Novembro',
                                'Dezembro',
                              ].map((label, idx) => (
                                <option key={label} value={idx + 1}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          )}
                          {rankingPeriod === 'quarterly' && (
                            <select
                              value={Math.ceil(rankingMonth / 3)}
                              onChange={(e) => setRankingMonth((Number(e.target.value) - 1) * 3 + 1)}
                              className="h-9 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                              <option value="1">1º Trimestre</option>
                              <option value="2">2º Trimestre</option>
                              <option value="3">3º Trimestre</option>
                              <option value="4">4º Trimestre</option>
                            </select>
                          )}
                          {rankingPeriod === 'semiannual' && (
                            <select
                              value={Math.ceil(rankingMonth / 6)}
                              onChange={(e) => setRankingMonth((Number(e.target.value) - 1) * 6 + 1)}
                              className="h-9 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                              <option value="1">1º Semestre</option>
                              <option value="2">2º Semestre</option>
                            </select>
                          )}
                          <select
                            value={rankingYear}
                            onChange={(e) => setRankingYear(Number(e.target.value))}
                            className="h-9 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          >
                            {[2024, 2025, 2026, 2027].map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {bestSellerForSelectedYear && (
                      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                        <div className="text-xs font-semibold text-blue-900">Destaque de {rankingYear}</div>
                        <div className="mt-1 text-xs text-blue-800">
                          O corretor que mais vendeu em {rankingYear} foi <span className="font-semibold">{bestSellerForSelectedYear.corretor}</span> ({bestSellerForSelectedYear.totalVendas} vendas).
                        </div>
                      </div>
                    )}

                    {rankingMetricasIndividuais.length === 0 ? (
                      <div className="mt-7 flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-16 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                        Nenhum dado de ranking encontrado para o período selecionado.
                      </div>
                    ) : (
                      <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-6 items-end flex-1">
                        <div className="w-full">
                          {top3MetricasIndividuais[1] && (
                            <div className="text-center">
                              <div className="flex flex-col items-center">
                                <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">2º</div>
                                <Avatar className="mt-2 h-16 w-16 ring-1 ring-gray-200 shadow-sm">
                                  <AvatarImage src={(top3MetricasIndividuais[1] as any).fotoUrl} alt={top3MetricasIndividuais[1].corretor} />
                                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                                    {getInitials(top3MetricasIndividuais[1].corretor)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="mt-2 text-xs font-semibold text-gray-900 dark:text-slate-100 truncate max-w-[180px]">{top3MetricasIndividuais[1].corretor}</div>
                              </div>
                              <div
                                className="mt-3 rounded-2xl bg-sky-200/80 border border-sky-300 shadow-sm flex flex-col justify-end px-6 py-7 transition-[height] duration-500"
                                style={{ height: top3PodiumHeights.second }}
                              >
                                <div className="text-2xl font-extrabold tracking-tight leading-none text-sky-950">
                                  {top3MetricasIndividuais[1].comissaoCorretor == null
                                    ? '—'
                                    : `${(top3MetricasIndividuais[1].comissaoCorretor / 1000).toFixed(2)} Mil`}
                                </div>
                                <div className="text-xs mt-1 text-sky-900">Comissão do corretor</div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="w-full md:-mt-6">
                          {top3MetricasIndividuais[0] && (
                            <div className="text-center">
                              <div className="flex flex-col items-center">
                                <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">1º</div>
                                <Avatar className="mt-2 h-20 w-20 ring-1 ring-gray-200 shadow-sm">
                                  <AvatarImage src={(top3MetricasIndividuais[0] as any).fotoUrl} alt={top3MetricasIndividuais[0].corretor} />
                                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                                    {getInitials(top3MetricasIndividuais[0].corretor)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="mt-2 text-xs font-semibold text-gray-900 dark:text-slate-100 truncate max-w-[200px]">{top3MetricasIndividuais[0].corretor}</div>
                              </div>
                              <div
                                className="mt-3 rounded-2xl bg-blue-200/80 border border-blue-300 shadow-sm flex flex-col justify-end px-7 py-8 transition-[height] duration-500"
                                style={{ height: top3PodiumHeights.first }}
                              >
                                <div className="text-3xl font-extrabold tracking-tight leading-none text-blue-950">
                                  {top3MetricasIndividuais[0].comissaoCorretor == null
                                    ? '—'
                                    : `${(top3MetricasIndividuais[0].comissaoCorretor / 1000).toFixed(2)} Mil`}
                                </div>
                                <div className="text-xs mt-1 text-blue-900">Comissão do corretor</div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="w-full">
                          {top3MetricasIndividuais[2] && (
                            <div className="text-center">
                              <div className="flex flex-col items-center">
                                <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">3º</div>
                                <Avatar className="mt-2 h-16 w-16 ring-1 ring-gray-200 shadow-sm">
                                  <AvatarImage src={(top3MetricasIndividuais[2] as any).fotoUrl} alt={top3MetricasIndividuais[2].corretor} />
                                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                                    {getInitials(top3MetricasIndividuais[2].corretor)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="mt-2 text-xs font-semibold text-gray-900 dark:text-slate-100 truncate max-w-[180px]">{top3MetricasIndividuais[2].corretor}</div>
                              </div>
                              <div
                                className="mt-3 rounded-2xl bg-indigo-200/80 border border-indigo-300 shadow-sm flex flex-col justify-end px-6 py-7 transition-[height] duration-500"
                                style={{ height: top3PodiumHeights.third }}
                              >
                                <div className="text-2xl font-extrabold tracking-tight leading-none text-indigo-950">
                                  {top3MetricasIndividuais[2].comissaoCorretor == null
                                    ? '—'
                                    : `${(top3MetricasIndividuais[2].comissaoCorretor / 1000).toFixed(2)} Mil`}
                                </div>
                                <div className="text-xs mt-1 text-indigo-900">Comissão do corretor</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6 overflow-hidden h-full min-h-[640px] flex flex-col">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-gray-800">Ranking completo</h3>
                    </div>

                    <div className="mt-4 overflow-auto rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/70 flex-1">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-slate-800">
                          <tr className="text-xs">
                            <th className="text-left py-2.5 pl-3 pr-3 font-semibold text-gray-600 dark:text-slate-400">Corretores</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Ranking</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Comissão total</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Comissão do corretor</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Líquido imobiliária</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Imóveis vendidos</th>
                            <th className="text-right py-2.5 pr-3 font-semibold text-gray-600 dark:text-slate-400">Preço médio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankingMetricasIndividuais.length === 0 ? (
                            <tr className="bg-white dark:bg-slate-900">
                              <td colSpan={7} className="py-10 px-3 text-center text-xs text-gray-500 dark:text-slate-400">
                                Nenhum dado de ranking encontrado para o período selecionado.
                              </td>
                            </tr>
                          ) : (
                            <>
                              {rankingMetricasIndividuais
                                .slice((rankingCurrentPage - 1) * rankingItemsPerPage, rankingCurrentPage * rankingItemsPerPage)
                                .map((row, idx) => {
                                  const globalIdx = (rankingCurrentPage - 1) * rankingItemsPerPage + idx;
                                  return (
                                    <tr
                                      key={row.corretor}
                                      className={`${globalIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-950'} hover:bg-blue-50/40 transition-colors`}
                                    >
                                      <td className="py-2.5 pl-3 pr-3 text-xs font-semibold text-gray-900 dark:text-slate-100">
                                        <div className="flex items-center gap-2">
                                          <Avatar className="h-7 w-7 ring-1 ring-gray-200">
                                            <AvatarImage src={(row as any).fotoUrl} alt={row.corretor} />
                                            <AvatarFallback className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-[10px] font-semibold">
                                              {getInitials(row.corretor)}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="truncate">{row.corretor}</span>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-xs">
                                        <span className="inline-flex min-w-8 justify-center rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 font-semibold">
                                          {row.ranking}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-xs text-gray-800">{formatCurrencyBRL.format(row.valorComissao)}</td>
                                      <td className="py-2.5 px-3 text-right text-xs text-gray-800">
                                        {row.comissaoCorretor === null || row.comissaoCorretor === undefined
                                          ? <span title="Nível ou Líder Direto não cadastrado em Gestão de Equipe">—</span>
                                          : formatCurrencyBRL.format(row.comissaoCorretor)}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-xs text-gray-800">
                                        {row.comissaoImobiliaria === null || row.comissaoImobiliaria === undefined
                                          ? <span title="Nível ou Líder Direto não cadastrado em Gestão de Equipe">—</span>
                                          : formatCurrencyBRL.format(row.comissaoImobiliaria)}
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-xs text-gray-800">{row.vendasFeitas}</td>
                                      <td className="py-2.5 pr-3 text-right text-xs text-gray-800">{formatCurrencyBRL.format(row.precoMedio ?? 0)}</td>
                                    </tr>
                                  );
                                })}
                              <tr className="bg-gray-100 dark:bg-slate-800">
                                <td className="py-2.5 pl-3 pr-3 text-xs font-semibold text-gray-800">Total</td>
                                <td className="py-2.5 px-3" />
                                <td className="py-2.5 px-3 text-right text-xs font-semibold text-gray-800">
                                  {formatCurrencyBRL.format(totaisRanking.comissaoTotal)}
                                </td>
                                <td className="py-2.5 px-3 text-right text-xs font-semibold text-gray-800">
                                  {formatCurrencyBRL.format(totaisRanking.comissaoCorretor)}
                                </td>
                                <td className="py-2.5 px-3 text-right text-xs font-semibold text-gray-800">
                                  {formatCurrencyBRL.format(totaisRanking.comissaoImobiliaria)}
                                </td>
                                <td className="py-2.5 px-3 text-right text-xs font-semibold text-gray-800">
                                  {totaisRanking.vendas}
                                </td>
                                <td className="py-2.5 pr-3 text-right text-xs font-semibold text-gray-800">
                                  {formatCurrencyBRL.format(totaisRanking.precoMedio)}
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {totaisRanking.semRateio > 0 && (
                      <p className="mt-2 px-2 text-xs text-gray-500 dark:text-slate-400">
                        {totaisRanking.semRateio === 1
                          ? '1 corretor está sem nível de comissionamento ou Líder Direto cadastrado'
                          : `${totaisRanking.semRateio} corretores estão sem nível de comissionamento ou Líder Direto cadastrado`}
                        {' '}em Gestão de Equipe — o rateio deles aparece como “—” e não entra nos totais.
                      </p>
                    )}

                    {/* Pagination Controls */}
                    {rankingMetricasIndividuais.length > rankingItemsPerPage && (
                      <div className="mt-4 flex items-center justify-between px-2">
                        <div className="text-xs text-gray-600 dark:text-slate-400">
                          Mostrando {((rankingCurrentPage - 1) * rankingItemsPerPage) + 1} a {Math.min(rankingCurrentPage * rankingItemsPerPage, rankingMetricasIndividuais.length)} de {rankingMetricasIndividuais.length} corretores
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setRankingCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={rankingCurrentPage === 1}
                            className="h-8 w-8 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          
                          {Array.from({ length: Math.min(5, Math.ceil(rankingMetricasIndividuais.length / rankingItemsPerPage)) }, (_, i) => {
                            const totalPages = Math.ceil(rankingMetricasIndividuais.length / rankingItemsPerPage);
                            let pageNum;
                            
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (rankingCurrentPage <= 3) {
                              pageNum = i + 1;
                            } else if (rankingCurrentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = rankingCurrentPage - 2 + i;
                            }
                            
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setRankingCurrentPage(pageNum)}
                                className={`h-8 w-8 rounded-lg border text-xs transition-all flex items-center justify-center ${
                                  rankingCurrentPage === pageNum
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'border-gray-300 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          
                          <button
                            onClick={() => setRankingCurrentPage(prev => Math.min(Math.ceil(rankingMetricasIndividuais.length / rankingItemsPerPage), prev + 1))}
                            disabled={rankingCurrentPage === Math.ceil(rankingMetricasIndividuais.length / rankingItemsPerPage)}
                            className="h-8 w-8 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

          )}
        </>
      )}

      {/* SEÇÃO MÉTRICAS INDIVIDUAIS */}
      {activeSubArea === 'metricas-individuais' && (
        <>
            <div>
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 mb-6">
                <div className="flex flex-wrap gap-3">
                {([
                  { key: 'comissao-metas', label: 'Comissão e meta', Icon: DollarSign },
                  { key: 'metas', label: 'Meta', Icon: Target },
                  { key: 'leads', label: 'Leads', Icon: Users },
                  { key: 'vendas', label: 'Origens', Icon: TrendingUp },
                ] as const).map(({ key, label, Icon }) => {
                  const isActive = activeMetricasIndSubArea === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setActiveMetricasIndSubArea(key);
                        const params = new URLSearchParams(searchParams);
                        params.set('tab', 'metricas-individuais');
                        params.set('metricasIndSubArea', key);
                        window.history.replaceState(null, '', `?${params.toString()}`);
                      }}
                      className={`h-10 px-4 rounded-lg border transition-all flex items-center gap-2 font-medium text-sm ${
                        isActive
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
                </div>
              </div>


              {activeMetricasIndSubArea === 'comissao-metas' && (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 items-stretch">
                      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent overflow-hidden">
                        <div className="p-5">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-14 w-14 ring-1 ring-gray-200">
                              <AvatarImage
                                src={getCorretorPhoto(metricasIndCorretor) || `/avatars/${metricasIndCorretor.toLowerCase().replace(/\s+/g, '-')}.jpg`}
                                alt={metricasIndCorretor}
                              />
                              <AvatarFallback className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-xs font-semibold">
                                {getInitials(metricasIndCorretor)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Corretor</div>
                              <div className="text-base font-semibold truncate text-gray-900 dark:text-slate-100">{metricasIndCorretor}</div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <select
                              value={metricasIndCorretor}
                              onChange={(e) => setMetricasIndCorretor(e.target.value)}
                              className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                              {rankingMetricasIndividuais.map((c) => (
                                <option key={c.corretor} value={c.corretor} className="text-gray-900 dark:text-slate-100">
                                  {c.corretor}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">De</div>
                              <input
                                type="date"
                                value={metricasIndDataInicial}
                                onChange={(e) => setMetricasIndDataInicial(e.target.value)}
                                className="mt-1 h-10 w-full px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Até</div>
                              <input
                                type="date"
                                value={metricasIndDataFinal}
                                onChange={(e) => setMetricasIndDataFinal(e.target.value)}
                                className="mt-1 h-10 w-full px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="px-5 pb-5">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-4">
                              <div className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">LEADS NO PERÍODO</div>
                              <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                                {metricasIndComissaoMetasView.leadsAtivos}
                              </div>
                            </div>
                            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-4">
                              <div className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">VENDAS</div>
                              <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                                {metricasIndVendasView.vendasTotal}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6 flex flex-col gap-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Comissão do corretor</div>
                            <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                              {metricasIndComissaoMetasView.comissaoCorretor === null
                                ? '—'
                                : formatCompactCurrencyBRL(metricasIndComissaoMetasView.comissaoCorretor)}
                            </div>
                            <div className="mt-2 text-[11px] text-gray-500 dark:text-slate-400">
                              Comissão total das vendas (VGC): {formatCompactCurrencyBRL(metricasIndComissaoMetasView.comissaoVgc)}
                            </div>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">VGV do período</div>
                            <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                              {formatCompactCurrencyBRL(metricasIndComissaoMetasView.vgvRecebido)}
                            </div>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas assinadas</div>
                            <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                              {metricasIndVendasView.vendasTotal}
                            </div>
                            <div className="mt-2 text-[11px] text-gray-500 dark:text-slate-400">
                              Meta do corretor fica na aba <span className="font-semibold">Meta</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 flex-1">
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-sm font-semibold text-gray-800">Comissão recebida por mês</div>
                            <div className="mt-4 h-[420px]">
                              <Bar data={comissaoPorMesData as any} options={comissaoChartOptions as any} />
                            </div>
                          </div>

                          <div className="flex flex-col gap-4">
                            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                              <div className="text-sm font-semibold text-gray-800">Vendas por exclusividade</div>
                              <div className="mt-4 grid grid-cols-2 gap-3 items-end">
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Exclusivas</div>
                                  <div className="mt-2 h-32 rounded-xl bg-emerald-50 border border-emerald-200 flex items-end justify-center pb-3 font-extrabold text-emerald-700">
                                    {metricasIndVendasView.vendasExclusivas}
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Não exclusivas</div>
                                  <div className="mt-2 h-32 rounded-xl bg-blue-50 border border-blue-200 flex items-end justify-center pb-3 font-extrabold text-blue-700">
                                    {metricasIndVendasView.vendasNaoExclusivas}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                              <div className="text-sm font-semibold text-gray-800">Funil do corretor</div>
                              <div className="mt-4 grid grid-cols-2 gap-3 items-end">
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads</div>
                                  <div className="mt-2 h-32 rounded-xl bg-emerald-50 border border-emerald-200 flex items-end justify-center pb-3 font-extrabold text-emerald-700">
                                    {metricasIndLeadsView.totalLeads}
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Visitas</div>
                                  <div className="mt-2 h-32 rounded-xl bg-blue-50 border border-blue-200 flex items-end justify-center pb-3 font-extrabold text-blue-700">
                                    {metricasIndLeadsView.visitas}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 space-y-2">
                      <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">Painel do corretor</div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 max-w-lg">
                        Resumo das métricas individuais no período (dados reais do banco).
                      </p>
                      <div className="max-w-md">
                        <CorretorMetricCard
                          corretor={corretorIndividualDashboardModel}
                          isLoading={loadingMetricasInd}
                        />
                      </div>
                    </div>
                  </>
                  )}

              {/* Aba "Meta": Metas Individuais reais (feature Metas), somente-leitura */}
              {activeMetricasIndSubArea === 'metas' && <IndividualGoalsPanel />}

                  {activeMetricasIndSubArea !== 'comissao-metas' && activeMetricasIndSubArea !== 'metas' && activeMetricasIndSubArea !== 'leads' && activeMetricasIndSubArea !== 'vendas' && (
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6">
                      <h3 className="text-sm font-semibold text-gray-800">
                        {activeMetricasIndSubArea === 'leads' && 'Leads'}
                        {activeMetricasIndSubArea === 'vendas' && 'Vendas'}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400 mt-2">
                        Subárea criada a partir das prints. Próximo passo: implementar os gráficos/tabelas reais.
                      </p>
                    </div>
                  )}

              {activeMetricasIndSubArea === 'leads' && (
                <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 items-stretch">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 ring-1 ring-gray-200">
                          <AvatarImage
                            src={getCorretorPhoto(metricasIndCorretor) || `/avatars/${metricasIndCorretor.toLowerCase().replace(/\s+/g, '-')}.jpg`}
                            alt={metricasIndCorretor}
                          />
                          <AvatarFallback className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-xs font-semibold">
                            {getInitials(metricasIndCorretor)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Corretores</div>
                          <div className="text-base font-semibold truncate text-gray-900 dark:text-slate-100">{metricasIndCorretor}</div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <select
                          value={metricasIndCorretor}
                          onChange={(e) => setMetricasIndCorretor(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        >
                          {rankingMetricasIndividuais.map((c) => (
                            <option key={c.corretor} value={c.corretor} className="text-gray-900 dark:text-slate-100">
                              {c.corretor}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">De</div>
                          <input
                            type="date"
                            value={metricasIndDataInicial}
                            onChange={(e) => setMetricasIndDataInicial(e.target.value)}
                            className="mt-1 h-10 w-full px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Até</div>
                          <input
                            type="date"
                            value={metricasIndDataFinal}
                            onChange={(e) => setMetricasIndDataFinal(e.target.value)}
                            className="mt-1 h-10 w-full px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="px-5 pb-5">
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5 text-center">
                        <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads recebidos</div>
                        <div className="mt-3 text-5xl font-extrabold text-gray-900 dark:text-slate-100">
                          {metricasIndLeadsView.leadsRecebidos}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-slate-400">{metricasIndDataInicial} a {metricasIndDataFinal}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6 flex flex-col gap-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                        <div className="text-sm font-semibold text-gray-800">Leads</div>
                        <div className="mt-2 text-4xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndLeadsView.totalLeads}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                        <div className="text-sm font-semibold text-gray-800">Leads recebidos</div>
                        <div className="mt-3 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center px-4">
                          <div className="text-sm font-semibold text-blue-700">{metricasIndLeadsView.leadsRecebidos}</div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Visitas</div>
                            <div className="mt-2 text-xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndLeadsView.visitas}</div>
                          </div>
                          <div className="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas realizadas</div>
                            <div className="mt-2 text-xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndVendasView.vendasTotal}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                        <div className="text-sm font-semibold text-gray-800">Leads por fonte</div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-center">
                          <div className="h-[240px]">
                            <Doughnut data={leadsPorFonteData as any} options={leadsDarkCardOptions as any} />
                          </div>
                          <div className="rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-4">
                            <div className="text-xs font-semibold text-gray-700 dark:text-slate-300">Fonte</div>
                            <div className="mt-3 space-y-2 max-h-[190px] overflow-auto pr-1">
                              {leadsPorFonteLegend.map((item) => (
                                <div key={item.label} className="flex items-center gap-2">
                                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                  <span className="text-xs text-gray-700 dark:text-slate-300 truncate">
                                    {item.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                      <div className="text-sm font-semibold text-gray-800">Lead por imóvel</div>
                      <div className="mt-4 h-[220px]">
                        <Bar data={leadsPorImovelData as any} options={leadsBarOptions as any} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeMetricasIndSubArea === 'vendas' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Origens</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Filtros do período</div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-auto">
                        <div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">De</div>
                          <input
                            type="date"
                            value={metricasIndDataInicial}
                            onChange={(e) => setMetricasIndDataInicial(e.target.value)}
                            className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Até</div>
                          <input
                            type="date"
                            value={metricasIndDataFinal}
                            onChange={(e) => setMetricasIndDataFinal(e.target.value)}
                            className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-transparent p-5">
                      <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas assinadas</div>
                      <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndVendasView.vendasTotal}</div>
                      <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-blue-500"
                          style={{ width: `${Math.min(100, (metricasIndVendasView.vendasTotal / 25) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-transparent p-5">
                      <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas exclusivas</div>
                      <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndVendasView.vendasExclusivas}</div>
                      <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                        {metricasIndVendasView.vendasTotal > 0
                          ? `${Math.round((metricasIndVendasView.vendasExclusivas / metricasIndVendasView.vendasTotal) * 100)}% do total`
                          : '0% do total'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-transparent p-5">
                      <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas não exclusivas</div>
                      <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndVendasView.vendasNaoExclusivas}</div>
                      <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                        {metricasIndVendasView.vendasTotal > 0
                          ? `${Math.round((metricasIndVendasView.vendasNaoExclusivas / metricasIndVendasView.vendasTotal) * 100)}% do total`
                          : '0% do total'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent overflow-hidden flex flex-col min-h-[560px]">
                      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-gray-800">Vendas no período</div>
                            <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Código, exclusividade, fonte e valores</div>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            Mostrando {Math.min(25, metricasIndVendasView.rows.length)} de {metricasIndVendasView.rows.length}
                          </div>
                        </div>
                      </div>
                      <div className="overflow-auto flex-1 max-h-[560px]">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-950">
                            <tr className="text-xs">
                              <th className="text-left py-2.5 pl-4 pr-3 font-semibold text-gray-600 dark:text-slate-400">Código</th>
                              <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Exclusividade</th>
                              <th className="text-left py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Fonte</th>
                              <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Valor</th>
                              <th className="text-right py-2.5 pr-4 font-semibold text-gray-600 dark:text-slate-400">Data</th>
                            </tr>
                          </thead>
                          <tbody>
                            {metricasIndVendasView.rows.slice(0, 25).map((row, idx) => (
                              <tr
                                key={row.id}
                                className={`${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/50'} hover:bg-blue-50/40 transition-colors`}
                              >
                                <td className="py-2.5 pl-4 pr-3 text-xs font-semibold text-gray-900 dark:text-slate-100">{row.codigo_imovel}</td>
                                <td className="py-2.5 px-3 text-xs text-gray-800">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 border text-[11px] font-semibold ${
                                      row.exclusividade === 'exclusivo'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-gray-50 dark:bg-slate-950 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-800'
                                    }`}
                                  >
                                    {row.exclusividade}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-xs text-gray-800 max-w-[260px] truncate" title={row.fonte}>
                                  {row.fonte}
                                </td>
                                <td className="py-2.5 px-3 text-right text-xs text-gray-800">{formatCurrencyBRL.format(row.valor_imovel)}</td>
                                <td className="py-2.5 pr-4 text-right text-xs text-gray-800">{row.data}</td>
                              </tr>
                            ))}
                            {metricasIndVendasView.rows.length === 0 && (
                              <tr>
                                <td colSpan={5} className="py-10 text-center text-sm text-gray-500 dark:text-slate-400">
                                  Nenhuma venda encontrada no período.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-gray-800">Negócio fechado por fonte</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Ranking de origem no período selecionado</div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        {metricasIndVendasView.fonteBreakdown[0]
                          ? `Top: ${metricasIndVendasView.fonteBreakdown[0].fonte} (${metricasIndVendasView.fonteBreakdown[0].quantidade})`
                          : 'Sem dados'}
                      </div>
                    </div>

                    <div className="mt-5 h-[280px]">
                      <Bar data={vendasPorFonteData as any} options={vendasBarOptions as any} />
                    </div>

                    <div className="mt-5 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-4">
                      <div className="text-xs font-semibold text-gray-700 dark:text-slate-300">Top fontes</div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {metricasIndVendasView.fonteBreakdown.slice(0, 6).map((item) => (
                          <div key={item.fonte} className="flex items-center justify-between gap-3">
                            <div className="text-xs text-gray-700 dark:text-slate-300 truncate" title={item.fonte}>
                              {item.fonte}
                            </div>
                            <div className="text-xs font-semibold text-gray-900 dark:text-slate-100">{item.quantidade}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </>
      )}

      {/* SEÇÃO IMÓVEIS */}
      {activeSubArea === 'imoveis' && (
        <>
      <div className="mb-6 flex flex-col gap-3" />

      {tipoCliente === 'interessado' &&  (
        <div className="w-full space-y-4 mb-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
            <div className="w-full h-[750px] min-h-[750px] overflow-visible">
              <ErrorBoundary fallbackTitle="Portfolio de Imóveis">
                <ImoveisPortfolioChart leads={processedLeadsInteressado} />
              </ErrorBoundary>
            </div>

            <div className="w-full h-[750px] overflow-visible">
              <ErrorBoundary fallbackTitle="Bairros Mais Procurados">
                <BairrosChart leads={processedLeadsInteressado} />
              </ErrorBoundary>
            </div>
          </div>

          <ErrorBoundary fallbackTitle="Ranking de Imóveis">
            <ImoveisInterestTable leads={processedLeadsInteressado} />
          </ErrorBoundary>
        </div>
      )}

      {tipoCliente === 'proprietario' && (
        <div className="w-full space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {proprietariosKpis && (
              <>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                  <div className={`text-2xl font-bold ${proprietariosKpis.metric1.valueClass}`}>{proprietariosKpis.metric1.value}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric1.label}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                  <div className={`text-2xl font-bold ${proprietariosKpis.metric2.valueClass}`}>{proprietariosKpis.metric2.value}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric2.label}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                  <div className={`text-2xl font-bold ${proprietariosKpis.metric3.valueClass}`}>{proprietariosKpis.metric3.value}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric3.label}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                  <div className={`text-2xl font-bold ${proprietariosKpis.metric4.valueClass}`}>{proprietariosKpis.metric4.value}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric4.label}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                  <div className={`text-2xl font-bold ${proprietariosKpis.metric5.valueClass}`}>{proprietariosKpis.metric5.value}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric5.label}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                  <div className={`text-2xl font-bold ${proprietariosKpis.metric6.valueClass}`}>{proprietariosKpis.metric6.value}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric6.label}</div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="w-full h-[850px] overflow-visible">
              <ErrorBoundary fallbackTitle="Performance de Conversão">
                <FunnelStagesBubbleChart
                  leads={proprietariosLeadsParaExibir}
                  funnelType="vendedor"
                  proprietarioType={proprietariosSubTab}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {tipoCliente === 'nenhum' && (
        <>
          {/* KPIs Cards - Imóveis */}
          {/* O período destes 4 cards (e do VGV/VGC mensal) é o ANO CIVIL, não o
              filtro de data acima — buscarFinanceiroVendasComerciaisComFallback
              devolve os 12 meses do ano. Dito na tela para o número não ser lido
              como o do intervalo escolhido. */}
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
            Indicadores comerciais do ano de {new Date().getFullYear()} (não seguem o filtro de período).
          </p>
          <div data-export-layout="kpis" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">VGV Total</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">
                    {formatCompactCurrencyBRL(financeiroImoveisKpis.vgvTotal)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">VGC Total</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">
                    {formatCompactCurrencyBRL(financeiroImoveisKpis.vgcTotal)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Preço Médio</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">
                    {formatCompactCurrencyBRL(financeiroImoveisKpis.ticketMedio)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendidos</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">
                    {financeiroImoveisKpis.vendasTotal.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Evolução da carteira — o que estava em carteira ao fim de cada mês */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Evolução da Carteira (12 meses)</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
              Imóveis cadastrados ao fim de cada mês (entradas menos saídas). Passe o mouse para ver a movimentação do mês.
            </p>
            <div className="h-[280px]">
              {evolucaoCarteira.length > 0 ? (
                <Line data={carteiraChartData} options={carteiraChartOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-gray-400">
                  Sem dados de carteira.
                </div>
              )}
            </div>
          </div>

          {/* Grid de Gráficos - Imóveis */}
          <div data-export-layout="charts" className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* 1. VGV Mensal */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">VGV - Valor Geral de Vendas (Mensal)</h3>
              <div className="h-[280px]">
                <Bar data={vgvChartData} options={{...defaultBarOptions, plugins: {...defaultBarOptions.plugins, tooltip: { callbacks: { label: (context) => `R$ ${context.parsed.y.toLocaleString('pt-BR')}` }}}}} />
              </div>
            </div>

            {/* 2. VGC Mensal */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">VGC - Valor Geral de Comissionamento (Mensal)</h3>
              <div className="h-[280px]">
                <Bar data={vgcChartData} options={{...defaultBarOptions, plugins: {...defaultBarOptions.plugins, tooltip: { callbacks: { label: (context) => `R$ ${context.parsed.y.toLocaleString('pt-BR')}` }}}}} />
              </div>
            </div>

            {/* 3. Imóveis de Maior Interesse */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Imóveis de Maior Interesse</h3>
              <div className="h-[280px]">
                <Bar data={imoveisInteresseData} options={defaultBarOptions} />
              </div>
            </div>

            {/* 4. Vendas por Faixa de Valor */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Vendas por Faixa de Valor (12 meses)</h3>
              <div className="h-[280px]">
                <Bar data={vendasFaixaChartData} options={stackedBarOptions} />
              </div>
            </div>

            {/* 5. Distribuição Exclusivo/Ficha */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Distribuição Exclusivo/Ficha</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 -mt-3 mb-3">Etapa de captação dos leads de Proprietário.</p>
              <div className="h-[280px]">
                <Bar data={distribuicaoExclusivoFichaChartData} options={stackedBarOptions} />
              </div>
            </div>
          </div>

          {/* Funil por Unidade (tipo de imóvel) — relatório secundário, abaixo dos gráficos */}
          <div className="mt-10">
            <ErrorBoundary fallbackTitle="Funil por Unidade">
              <FunilPorUnidadeChart
                leads={processedLeadsInteressado}
                tipoMap={imovelTipoMap}
                isLoading={isLoadingTipoMap}
              />
            </ErrorBoundary>
          </div>

          <div className="mt-10">
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">Cliente interessado</h3>
            <div className="w-full space-y-4 mb-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                <div className="w-full h-[750px] min-h-[750px] overflow-visible">
                  <ErrorBoundary fallbackTitle="Portfolio de Imóveis">
                    <ImoveisPortfolioChart leads={processedLeadsInteressado} />
                  </ErrorBoundary>
                </div>

                <div className="w-full h-[750px] overflow-visible">
                  <ErrorBoundary fallbackTitle="Bairros Mais Procurados">
                    <BairrosChart leads={processedLeadsInteressado} />
                  </ErrorBoundary>
                </div>
              </div>

              <ErrorBoundary fallbackTitle="Ranking de Imóveis">
                <ImoveisInterestTable leads={processedLeadsInteressado} />
              </ErrorBoundary>
            </div>
          </div>

          <div className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Cliente proprietário</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-slate-400">Tipo</span>
                <select
                  value={proprietariosSubTab}
                  onChange={(e) => setProprietariosSubTab(e.target.value as 'vendedor' | 'locatario')}
                  className="h-9 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="locatario">Locatário</option>
                </select>
              </div>
            </div>

            <div className="w-full space-y-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {proprietariosKpis && (
                  <>
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                      <div className={`text-2xl font-bold ${proprietariosKpis.metric1.valueClass}`}>{proprietariosKpis.metric1.value}</div>
                      <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric1.label}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                      <div className={`text-2xl font-bold ${proprietariosKpis.metric2.valueClass}`}>{proprietariosKpis.metric2.value}</div>
                      <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric2.label}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                      <div className={`text-2xl font-bold ${proprietariosKpis.metric3.valueClass}`}>{proprietariosKpis.metric3.value}</div>
                      <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric3.label}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                      <div className={`text-2xl font-bold ${proprietariosKpis.metric4.valueClass}`}>{proprietariosKpis.metric4.value}</div>
                      <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric4.label}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                      <div className={`text-2xl font-bold ${proprietariosKpis.metric5.valueClass}`}>{proprietariosKpis.metric5.value}</div>
                      <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric5.label}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent px-4 py-3 flex flex-col items-center justify-center text-center">
                      <div className={`text-2xl font-bold ${proprietariosKpis.metric6.valueClass}`}>{proprietariosKpis.metric6.value}</div>
                      <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">{proprietariosKpis.metric6.label}</div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="w-full h-[850px] overflow-visible">
                  <ErrorBoundary fallbackTitle="Performance de Conversão">
                    <FunnelStagesBubbleChart
                      leads={proprietariosLeadsParaExibir}
                      funnelType="vendedor"
                      proprietarioType={proprietariosSubTab}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
        </>
      )}

      {/* SEÇÃO eNPS DE CORRETORES */}
      {activeSubArea === 'enps' && (
        <EnpsCorretoresSection tenantId={tenantId} />
      )}
      </div>
    </div>
  );
};

export default RelatoriosPage;
