/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * RelatoriosPage - Página de Relatórios e Análises
 * Utiliza Chart.js para visualização de dados
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Bar, Pie, Doughnut } from 'react-chartjs-2';
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
  Building2,
  DollarSign,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { MetricsDashboard } from '@/features/metricas/components/MetricsDashboard';
import { ImoveisPortfolioChart } from '@/features/imoveis/components/ImoveisPortfolioChart';
import { BairrosChart } from '@/features/imoveis/components/BairrosChart';
import { ImoveisInterestTable } from '@/features/imoveis/components/ImoveisInterestTable';
import { FunnelStagesBubbleChart } from '@/features/leads/components/FunnelStagesBubbleChart';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import { useAuth } from '@/hooks/useAuth';
import { fetchTenantMembers, type TenantMember } from '@/features/corretores/services/tenantMembersService';
import { LEAD_TYPE_INTERESSADO, LEAD_TYPE_PROPRIETARIO } from '@/features/leads/services/leadsService';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { getRankingColor } from '@/utils/colors';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRelatorios } from '../hooks/useRelatorios';
import { buscarValorTotal, formatarValorMonetario, buscarImoveisAtivos } from '../services/relatoriosService';

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

function leadsByMonth(leads: ProcessedLead[], months: number = 12): { labels: string[]; values: number[] } {
  const now = new Date();
  const labels: string[] = [];
  const values: number[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    labels.push(label.charAt(0).toUpperCase() + label.slice(1));
    values.push(leads.filter(l => (l.data_entrada || '').startsWith(yearMonth)).length);
  }
  return { labels, values };
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

  const { vendasCriadas, vendasAssinadas, metricasEquipes, totalLeadsMensal, valorTotal, imoveisAtivos, kpis: kpisRelatorios} = useRelatorios();

  const reportRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  // Estados dos filtros
  const [empresa, setEmpresa] = useState('todas');
  const [usuario, setUsuario] = useState('meu-usuario');
  const [dataInicial, setDataInicial] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dataFinal, setDataFinal] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [exibirValores, setExibirValores] = useState(true);
  const _tab = searchParams.get('tab');
  const activeSubArea: 'marketing' | 'metricas' | 'metricas-individuais' | 'imoveis' =
    _tab === 'metricas' || _tab === 'imoveis' || _tab === 'metricas-individuais' ? _tab : 'marketing';

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
      fromQuery === 'leads' ||
      fromQuery === 'vendas'
    ) {
      return fromQuery;
    }
    return 'comissao-metas';
  }, [searchParams]);

  const [activeMetricasIndSubArea, setActiveMetricasIndSubArea] = useState<
    'comissao-metas' | 'leads' | 'vendas'
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

  const [metricasIndCorretor, setMetricasIndCorretor] = useState('ANA E KARLA');
  const [metricasIndDataInicial, setMetricasIndDataInicial] = useState('2026-01-01');
  const [metricasIndDataFinal, setMetricasIndDataFinal] = useState('2026-01-31');

  const initialRankingYear = useMemo(() => new Date().getFullYear(), []);
  const initialRankingMonth = useMemo(() => new Date().getMonth() + 1, []);
  const [rankingYear, setRankingYear] = useState<number>(initialRankingYear);
  const [rankingMonth, setRankingMonth] = useState<number>(initialRankingMonth);
  const [rankingPeriod, setRankingPeriod] = useState<'monthly' | 'quarterly' | 'semiannual' | 'yearly'>('monthly');
  const [rankingCurrentPage, setRankingCurrentPage] = useState<number>(1);
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

  const getCorretorPhoto = (name: string) => {
    const byName = corretorPhotoMap.get(normalizeName(name));
    return byName || null;
  };

  const { processedLeads: processedLeadsInteressado } = useLeadsMetrics({
    leadType: LEAD_TYPE_INTERESSADO
  });
  const { processedLeads: processedLeadsProprietario } = useLeadsMetrics({
    leadType: LEAD_TYPE_PROPRIETARIO
  });

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

  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [activeChartModal, setActiveChartModal] = useState<
    | 'tempo_interacao_usuario'
    | 'atividades_aberto_usuario'
    | 'leads_interagidos_usuario'
    | 'leads_convertidos_usuario'
    | null
  >(null);

  // Dados calculados para KPIs - usando dados reais do useRelatorios
  const kpisCalculados = useMemo(() => ({
    totalLeadsRecebidos: totalLeadsMensal || 0,
    totalLeadsInteragidos: vendasCriadas || 0,
    mediaInteracaoDia: vendasCriadas ? Math.round((vendasCriadas / 30) * 100) / 100 : 0,
    mediaTempoPrimeiraInteracao: 0, // Precisa implementar
    totalLeadsConvertidos: vendasAssinadas || 0,
  }), [totalLeadsMensal, vendasCriadas, vendasAssinadas]);

  const rankingMetricasIndividuais = useMemo(() => {
    const slugify = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const seeded01 = (seed: string) => {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const x = (h >>> 0) / 4294967295;
      return x;
    };

    const computeRow = (corretor: string, base: { valorComissao: number; vendasFeitas: number; gestaoAtiva: number }, year: number, month: number, period: 'monthly' | 'quarterly' | 'semiannual' | 'yearly') => {
      let seed = `${corretor}|${year}`;
      
      if (period === 'monthly') {
        seed += `-${String(month).padStart(2, '0')}`;
      } else if (period === 'quarterly') {
        seed += `-Q${Math.ceil(month / 3)}`;
      } else if (period === 'semiannual') {
        seed += `-S${Math.ceil(month / 6)}`;
      }
      // yearly doesn't add anything to the seed

      const r1 = seeded01(`${seed}|a`);
      const r2 = seeded01(`${seed}|b`);
      const r3 = seeded01(`${seed}|c`);

      // Ajuste dos valores baseado no período
      let periodMultiplier = 1;
      if (period === 'quarterly') periodMultiplier = 3;
      else if (period === 'semiannual') periodMultiplier = 6;
      else if (period === 'yearly') periodMultiplier = 12;

      // Variação intencionalmente mais forte por competência para que o Top 3 mude ao trocar mês/ano.
      // Mantém determinístico (mesmo corretor + ano + mês => mesmos números).
      const vendas = Math.max(0, Math.round(base.vendasFeitas * periodMultiplier + (r1 - 0.5) * 10 * periodMultiplier + r3 * 3 * periodMultiplier));

      const multiplier = 0.55 + r2 * 1.35; // 0.55 .. 1.90
      const spike = r3 > 0.82 ? 1.18 : 1; // pico ocasional
      const comissao = Math.max(0, Math.round(base.valorComissao * multiplier * spike * periodMultiplier * 100) / 100);

      return {
        corretor,
        valorComissao: comissao,
        vendasFeitas: vendas,
        gestaoAtiva: base.gestaoAtiva,
      };
    };

    const base = [
      { corretor: 'ANA E KARLA', valorComissao: 42005, vendasFeitas: 4, gestaoAtiva: 0 },
      { corretor: 'BARBARA FABRICIO', valorComissao: 26380, vendasFeitas: 3, gestaoAtiva: 0 },
      { corretor: 'FELIPE MARTINS', valorComissao: 19050, vendasFeitas: 5, gestaoAtiva: 0 },
      { corretor: 'FELIPE CAMARGO', valorComissao: 16012.5, vendasFeitas: 4, gestaoAtiva: 0 },
      { corretor: 'CAIO VINICIUS ZORIGNANI', valorComissao: 14602.5, vendasFeitas: 1, gestaoAtiva: 0 },
      { corretor: 'EDNA SILVA', valorComissao: 10192.5, vendasFeitas: 2, gestaoAtiva: 0 },
      { corretor: 'CARLOS EDUARDO DOS SANTOS', valorComissao: 8750, vendasFeitas: 0, gestaoAtiva: 0 },
      { corretor: 'RENATO FARAÇO', valorComissao: 8691.75, vendasFeitas: 0, gestaoAtiva: 0 },
      { corretor: 'GUSTAVO TEO', valorComissao: 7416.75, vendasFeitas: 1, gestaoAtiva: 0 },
      { corretor: 'GISELLE ALVES', valorComissao: 5100, vendasFeitas: 0, gestaoAtiva: 0 },
    ];

    return base
      .slice()
      .map((item) => computeRow(item.corretor, item, rankingYear, rankingMonth, rankingPeriod))
      .sort((a, b) => b.valorComissao - a.valorComissao)
      .map((item, index) => ({
        ...item,
        ranking: index + 1,
        fotoUrl: getCorretorPhoto(item.corretor) || `/avatars/${slugify(item.corretor)}.jpg`,
      }));
  }, [rankingMonth, rankingYear, rankingPeriod, corretorPhotoMap]);

  const bestSellerForSelectedYear = useMemo(() => {
    if (rankingYear >= 2026) return null;

    const base = [
      { corretor: 'ANA E KARLA', valorComissao: 42005, vendasFeitas: 4, gestaoAtiva: 0 },
      { corretor: 'BARBARA FABRICIO', valorComissao: 26380, vendasFeitas: 3, gestaoAtiva: 0 },
      { corretor: 'FELIPE MARTINS', valorComissao: 19050, vendasFeitas: 5, gestaoAtiva: 0 },
      { corretor: 'FELIPE CAMARGO', valorComissao: 16012.5, vendasFeitas: 4, gestaoAtiva: 0 },
      { corretor: 'CAIO VINICIUS ZORIGNANI', valorComissao: 14602.5, vendasFeitas: 1, gestaoAtiva: 0 },
      { corretor: 'EDNA SILVA', valorComissao: 10192.5, vendasFeitas: 2, gestaoAtiva: 0 },
      { corretor: 'CARLOS EDUARDO DOS SANTOS', valorComissao: 8750, vendasFeitas: 0, gestaoAtiva: 0 },
      { corretor: 'RENATO FARAÇO', valorComissao: 8691.75, vendasFeitas: 0, gestaoAtiva: 0 },
      { corretor: 'GUSTAVO TEO', valorComissao: 7416.75, vendasFeitas: 1, gestaoAtiva: 0 },
      { corretor: 'GISELLE ALVES', valorComissao: 5100, vendasFeitas: 0, gestaoAtiva: 0 },
    ];

    const seeded01 = (seed: string) => {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const x = (h >>> 0) / 4294967295;
      return x;
    };

    const computeVendas = (corretor: string, baseVendas: number, year: number, month: number) => {
      const seed = `${corretor}|${year}-${String(month).padStart(2, '0')}`;
      const r1 = seeded01(`${seed}|a`);
      const r3 = seeded01(`${seed}|c`);
      return Math.max(0, Math.round(baseVendas + (r1 - 0.5) * 10 + r3 * 3));
    };

    const totals = base.map((c) => {
      let totalVendas = 0;
      for (let m = 1; m <= 12; m += 1) {
        totalVendas += computeVendas(c.corretor, c.vendasFeitas, rankingYear, m);
      }
      return { corretor: c.corretor, totalVendas };
    });

    totals.sort((a, b) => b.totalVendas - a.totalVendas);
    return totals[0] ?? null;
  }, [rankingYear]);

  const metricasIndLeadsMock = useMemo(() => {
    const seeded01 = (seed: string) => {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) / 4294967295;
    };

    const start = new Date(metricasIndDataInicial);
    const end = new Date(metricasIndDataFinal);
    const startOk = !Number.isNaN(start.getTime());
    const endOk = !Number.isNaN(end.getTime());
    const days = startOk && endOk ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 30;
    const periodoFactor = Math.max(0.6, Math.min(1.8, days / 30));

    const seedBase = `${metricasIndCorretor}|${metricasIndDataInicial}|${metricasIndDataFinal}`;
    const rTotal = seeded01(`${seedBase}|total`);
    const totalLeads = Math.max(1, Math.round((8 + rTotal * 28) * periodoFactor));

    const allocate = (labels: string[], total: number, seedKey: string) => {
      const weights = labels.map((_, i) => seeded01(`${seedKey}|w|${i}`) + 0.15);
      const sum = weights.reduce((a, b) => a + b, 0);
      const raw = weights.map((w) => (w / sum) * total);
      const values = raw.map((x) => Math.floor(x));
      let remainder = total - values.reduce((a, b) => a + b, 0);
      const order = raw
        .map((x, i) => ({ i, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac);
      for (let k = 0; k < order.length && remainder > 0; k += 1) {
        values[order[k].i] += 1;
        remainder -= 1;
      }
      return labels.map((label, i) => ({ label, value: values[i] }));
    };

    const porBairroLabels = [
      'Parque Residencial Japi',
      'Centro',
      'Fazenda Grande',
      'Condomínio Nature',
      'Vila Aparecida',
      'Outros',
    ];
    const porFonteLabels = ['Chaves na Mão', 'ImovelWeb', 'Grupo Zap', 'Leads 4Sale', 'Plugimóveis'];

    const porBairro = allocate(porBairroLabels, totalLeads, `${seedBase}|bairro`);
    const porFonte = allocate(porFonteLabels, totalLeads, `${seedBase}|fonte`);

    // Imóveis: mantém uma lista base, mas a distribuição muda por corretor/período.
    const imoveisLabels = ['AP0681', 'CA0145', 'CA0580', 'CA0664', 'CA0710', 'CA0408', 'AP0123', 'CA0990'];
    const rawPorImovel = allocate(imoveisLabels, totalLeads, `${seedBase}|imovel`);
    // Mostrar apenas os mais relevantes (como em um ranking de imóveis do período)
    const porImovel = rawPorImovel
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const rVisitas = seeded01(`${seedBase}|visitas`);
    const visitas = Math.max(0, Math.round(totalLeads * (0.05 + rVisitas * 0.35)));

    const rVendas = seeded01(`${seedBase}|vendas`);
    const vendasRealizadas = Math.max(0, Math.min(visitas, Math.round(visitas * (0.02 + rVendas * 0.22))));

    return {
      totalLeads,
      leadsRecebidos: totalLeads,
      visitas,
      vendasRealizadas,
      porBairro,
      porFonte,
      porImovel,
    };
  }, [metricasIndDataFinal, metricasIndDataInicial]);

  const leadsPieColors = useMemo(
    () => ['#22d3ee', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#10b981', '#a3e635', '#f59e0b'],
    []
  );

  const leadsPorBairroData = useMemo(() => {
    return {
      labels: metricasIndLeadsMock.porBairro.map((x) => x.label),
      datasets: [
        {
          data: metricasIndLeadsMock.porBairro.map((x) => x.value),
          backgroundColor: metricasIndLeadsMock.porBairro.map((_, i) => leadsPieColors[i % leadsPieColors.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [metricasIndLeadsMock, leadsPieColors]);

  const leadsPorBairroLegend = useMemo(() => {
    return metricasIndLeadsMock.porBairro.map((item, i) => ({
      label: item.label,
      value: item.value,
      color: leadsPieColors[i % leadsPieColors.length],
    }));
  }, [metricasIndLeadsMock, leadsPieColors]);

  const leadsPorFonteData = useMemo(() => {
    return {
      labels: metricasIndLeadsMock.porFonte.map((x) => x.label),
      datasets: [
        {
          data: metricasIndLeadsMock.porFonte.map((x) => x.value),
          backgroundColor: metricasIndLeadsMock.porFonte.map((_, i) => leadsPieColors[(i + 2) % leadsPieColors.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [metricasIndLeadsMock, leadsPieColors]);

  const leadsPorFonteLegend = useMemo(() => {
    return metricasIndLeadsMock.porFonte.map((item, i) => ({
      label: item.label,
      value: item.value,
      color: leadsPieColors[(i + 2) % leadsPieColors.length],
    }));
  }, [metricasIndLeadsMock, leadsPieColors]);

  const leadsPorImovelData = useMemo(() => {
    return {
      labels: metricasIndLeadsMock.porImovel.map((x) => x.label),
      datasets: [
        {
          label: 'Leads',
          data: metricasIndLeadsMock.porImovel.map((x) => x.value),
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          borderRadius: 8,
          maxBarThickness: 48,
        },
      ],
    };
  }, [metricasIndLeadsMock]);

  const metricasIndVendasMock = useMemo(() => {
    const seeded01 = (seed: string) => {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) / 4294967295;
    };

    const start = new Date(metricasIndDataInicial);
    const end = new Date(metricasIndDataFinal);
    const startOk = !Number.isNaN(start.getTime());
    const endOk = !Number.isNaN(end.getTime());
    const days = startOk && endOk ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 30;
    const periodoFactor = Math.max(0.6, Math.min(1.8, days / 30));

    const seedBase = `${metricasIndDataInicial}|${metricasIndDataFinal}|vendas`;
    const rVendas = seeded01(`${seedBase}|count`);
    const vendasTotal = Math.max(0, Math.round((3 + rVendas * 16) * periodoFactor));

    const rExcl = seeded01(`${seedBase}|excl`);
    const vendasExclusivas = Math.max(0, Math.min(vendasTotal, Math.round(vendasTotal * (0.25 + rExcl * 0.55))));
    const vendasNaoExclusivas = Math.max(0, vendasTotal - vendasExclusivas);

    const fontes = ['PARCERIA IMÓVEL NOSSO', 'CHAVES NA MÃO', 'CLIENTE ANTIGO', 'IMOVEL WEB', 'INDICAÇÃO', 'INSTAGRAM LEADS', 'LEAD 4 SALE', 'VIP/PLACAS'];
    const fontesWeights = fontes.map((_, i) => seeded01(`${seedBase}|fonte|${i}`) + 0.2);
    const fontesSum = fontesWeights.reduce((a, b) => a + b, 0);
    const fontesRaw = fontesWeights.map((w) => (w / fontesSum) * Math.max(1, vendasTotal));
    const fontesValues = fontesRaw.map((x) => Math.floor(x));
    let fontesRem = vendasTotal - fontesValues.reduce((a, b) => a + b, 0);
    const fontesOrder = fontesRaw
      .map((x, i) => ({ i, frac: x - Math.floor(x) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < fontesOrder.length && fontesRem > 0; k += 1) {
      fontesValues[fontesOrder[k].i] += 1;
      fontesRem -= 1;
    }

    const fonteBreakdown = fontes
      .map((fonte, i) => ({ fonte, quantidade: fontesValues[i] }))
      .filter((x) => x.quantidade > 0)
      .sort((a, b) => b.quantidade - a.quantidade);

    const imoveis = ['AP0359', 'AP0608', 'TE0105', 'CA0598', 'AP0868', 'TE0110', 'AP0549', 'AP0888', 'AP0242', 'CA0661', 'CA0710', 'AP0123', 'CA0990'];
    const exclusividades = ['exclusivo', 'não exclusivo'] as const;

    const rows = Array.from({ length: vendasTotal }).map((_, idx) => {
      const rRow = seeded01(`${seedBase}|row|${idx}`);
      const rRow2 = seeded01(`${seedBase}|row2|${idx}`);
      const rRow3 = seeded01(`${seedBase}|row3|${idx}`);

      const codigo_imovel = imoveis[Math.floor(rRow * imoveis.length) % imoveis.length];
      const exclusividade = exclusividades[rRow2 > 0.5 ? 0 : 1];
      const fonte = fonteBreakdown[Math.floor(rRow3 * fonteBreakdown.length) % fonteBreakdown.length]?.fonte ?? fontes[0];

      const valor_imovel = Math.round((220000 + rRow2 * 980000) / 1000) * 1000;
      const comissao = Math.round(valor_imovel * (0.02 + rRow3 * 0.02));

      // data dentro do range (ou mês atual se inválido)
      const baseStart = startOk ? start.getTime() : new Date().getTime();
      const baseEnd = endOk ? end.getTime() : baseStart + 1000 * 60 * 60 * 24 * 30;
      const t = baseStart + Math.floor((baseEnd - baseStart) * rRow);
      const data = new Date(t);
      const dataStr = data.toISOString().slice(0, 10);

      return {
        id: `${seedBase}|${idx}`,
        codigo_imovel,
        exclusividade,
        fonte,
        valor_imovel,
        comissao,
        data: dataStr,
      };
    });

    const vgvTotal = rows.reduce((acc, r) => acc + r.valor_imovel, 0);
    const comissaoTotal = rows.reduce((acc, r) => acc + r.comissao, 0);
    const ticketMedio = vendasTotal > 0 ? vgvTotal / vendasTotal : 0;

    return {
      vendasTotal,
      vendasExclusivas,
      vendasNaoExclusivas,
      vgvTotal,
      comissaoTotal,
      ticketMedio,
      rows,
      fonteBreakdown,
    };
  }, [metricasIndCorretor, metricasIndDataFinal, metricasIndDataInicial]);

  const vendasPorFonteData = useMemo(() => {
    return {
      labels: metricasIndVendasMock.fonteBreakdown.map((x) => x.fonte),
      datasets: [
        {
          label: 'Vendas',
          data: metricasIndVendasMock.fonteBreakdown.map((x) => x.quantidade),
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          borderRadius: 8,
          maxBarThickness: 44,
        },
      ],
    };
  }, [metricasIndVendasMock]);

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

  const top3MetricasIndividuais = useMemo(() => rankingMetricasIndividuais.slice(0, 3), [rankingMetricasIndividuais]);

  const top3PodiumHeights = useMemo(() => {
    const values = top3MetricasIndividuais.map((x) => x.valorComissao);
    const max = Math.max(1, ...values);

    const heightFor = (value: number, min: number, maxH: number) => {
      const t = Math.max(0, Math.min(1, value / max));
      return Math.round(min + t * (maxH - min));
    };

    return {
      first: top3MetricasIndividuais[0] ? heightFor(top3MetricasIndividuais[0].valorComissao, 260, 420) : 380,
      second: top3MetricasIndividuais[1] ? heightFor(top3MetricasIndividuais[1].valorComissao, 220, 360) : 280,
      third: top3MetricasIndividuais[2] ? heightFor(top3MetricasIndividuais[2].valorComissao, 200, 330) : 250,
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

  const metricasIndComissaoMetasMock = useMemo(() => {
    const seeded01 = (seed: string) => {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) / 4294967295;
    };

    const start = new Date(metricasIndDataInicial);
    const end = new Date(metricasIndDataFinal);
    const startOk = !Number.isNaN(start.getTime());
    const endOk = !Number.isNaN(end.getTime());
    const days = startOk && endOk ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1) : 30;
    const periodoFactor = Math.max(0.6, Math.min(1.6, days / 30));

    const seedBase = `${metricasIndCorretor}|${metricasIndDataInicial}|${metricasIndDataFinal}`;
    const r1 = seeded01(`${seedBase}|meta`);
    const r2 = seeded01(`${seedBase}|comissao`);
    const r3 = seeded01(`${seedBase}|prod`);
    const r4 = seeded01(`${seedBase}|port`);

    const metaAnual = Math.round(180000 + r1 * 160000);
    const comissaoRecebida = Math.round((9000 + r2 * 75000) * periodoFactor);
    const faltaParaMeta = Math.max(metaAnual - comissaoRecebida, 0);
    const percentual = metaAnual > 0 ? (comissaoRecebida / metaAnual) * 100 : 0;

    const metaExclusivo = Math.max(1, Math.round(2 + r3 * 6));
    const exclusivos = Math.max(0, Math.round(metaExclusivo * (0.25 + r2 * 0.9)));

    const metaFicha = Math.max(1, Math.round(4 + r4 * 10));
    const ficha = Math.max(0, Math.round(metaFicha * (0.3 + r1 * 0.85)));

    const imoveisFichaAtivos = Math.max(0, Math.round(10 + r2 * 55));
    const imoveisExclusivosAtivos = Math.max(0, Math.round(r3 * 10));

    return {
      metaAnual,
      comissaoRecebida,
      faltaParaMeta,
      percentual,
      exclusivos,
      metaExclusivo,
      ficha,
      metaFicha,
      imoveisFichaAtivos,
      imoveisExclusivosAtivos,
    };
  }, [metricasIndCorretor, metricasIndDataFinal, metricasIndDataInicial]);

  const comissaoVsMetaData = useMemo(() => {
    const start = new Date(metricasIndDataInicial);
    const startOk = !Number.isNaN(start.getTime());
    const month = startOk ? String(start.getMonth() + 1).padStart(2, '0') : '01';
    const year = startOk ? String(start.getFullYear()) : '2026';

    return {
      labels: [`${month}/${year}`],
      datasets: [
        {
          label: 'Comissão recebida',
          data: [metricasIndComissaoMetasMock.comissaoRecebida / 1000],
          backgroundColor: 'rgba(59, 130, 246, 0.95)',
          borderRadius: 10,
          maxBarThickness: 80,
        },
        {
          label: 'Meta',
          data: [metricasIndComissaoMetasMock.metaAnual / 1000],
          backgroundColor: 'rgba(34, 197, 94, 0.55)',
          borderRadius: 10,
          maxBarThickness: 80,
        },
      ],
    };
  }, [metricasIndComissaoMetasMock, metricasIndDataInicial]);

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
  const allLeadsEarly = useMemo(() => [...processedLeadsInteressado, ...processedLeadsProprietario], [processedLeadsInteressado, processedLeadsProprietario]);
  const convertidosEarly = useMemo(() => allLeadsEarly.filter(l => {
    const etapa = (l.etapa_atual || '').toLowerCase();
    return etapa.includes('assinada') || etapa.includes('fechamento') || etapa.includes('contrato');
  }), [allLeadsEarly]);

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
  const allCorretorCounts = useMemo(() => countByField(allLeadsEarly, 'corretor_responsavel'), [allLeadsEarly]);
  const allCorretorTop = useMemo(() => topN(allCorretorCounts, 30), [allCorretorCounts]);
  const ALL_CORRETORES = allCorretorTop.labels;

  const modalLeadsInteragidosUsuarioData = useMemo(() => ({
    labels: ALL_CORRETORES,
    datasets: [
      {
        label: 'Interagidos',
        data: ALL_CORRETORES.map(nome => allLeadsEarly.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() !== 'novos leads').length),
        backgroundColor: CHART_COLORS.primary,
        borderRadius: 6,
      },
      {
        label: 'Não Interagidos',
        data: ALL_CORRETORES.map(nome => allLeadsEarly.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() === 'novos leads').length),
        backgroundColor: CHART_COLORS.primaryLight,
        borderRadius: 6,
      },
    ],
  }), [allLeadsEarly, ALL_CORRETORES]);

  const modalLeadsConvertidosUsuarioData = useMemo(() => ({
    labels: ALL_CORRETORES,
    datasets: [{
      label: 'Leads Convertidos',
      data: ALL_CORRETORES.map(nome => convertidosEarly.filter(l => l.corretor_responsavel === nome).length),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }],
  }), [convertidosEarly, ALL_CORRETORES]);

  const modalTempoInteracaoUsuarioData = useMemo(() => {
    const temposPorCorretor = ALL_CORRETORES.map(nome => {
      const leadsDoCorretor = allLeadsEarly.filter(l => l.corretor_responsavel === nome);
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
  }, [allLeadsEarly, ALL_CORRETORES]);

  const modalAtividadesAbertoUsuarioData = useMemo(() => {
    const visitaData = ALL_CORRETORES.map(nome =>
      allLeadsEarly.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('visita')).length
    );
    const propostaData = ALL_CORRETORES.map(nome =>
      allLeadsEarly.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('proposta')).length
    );
    return {
      labels: ALL_CORRETORES,
      datasets: [
        { label: 'Visitas', data: visitaData, backgroundColor: CHART_COLORS.primaryDark, borderRadius: 6 },
        { label: 'Propostas', data: propostaData, backgroundColor: CHART_COLORS.primaryLight, borderRadius: 6 },
      ],
    };
  }, [allLeadsEarly, ALL_CORRETORES]);

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
  const allLeads = useMemo(() => [...processedLeadsInteressado, ...processedLeadsProprietario], [processedLeadsInteressado, processedLeadsProprietario]);

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

  // Usar leadsPorOrigemData também como "por canal" (mesmo dado, visão diferente)
  const leadsPorCanalData = leadsPorOrigemData;

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

  const leadsConvertidosCanalData = leadsConvertidosOrigemData;

  // 4. Leads por Corretor (dados reais)
  const corretorCounts = useMemo(() => countByField(allLeads, 'corretor_responsavel'), [allLeads]);
  const corretorTop = useMemo(() => topN(corretorCounts, 15), [corretorCounts]);
  const REAL_CORRETORES = corretorTop.labels;

  const leadsInteragidosUsuarioData = useMemo(() => {
    const interagidos = REAL_CORRETORES.map(nome => {
      return allLeads.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() !== 'novos leads').length;
    });
    const naoInteragidos = REAL_CORRETORES.map(nome => {
      return allLeads.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase() === 'novos leads').length;
    });
    return {
      labels: REAL_CORRETORES,
      datasets: [
        { label: 'Interagidos', data: interagidos, backgroundColor: CHART_COLORS.primaryDark, borderRadius: 6 },
        { label: 'Não Interagidos', data: naoInteragidos, backgroundColor: CHART_COLORS.primaryLight, borderRadius: 6 },
      ]
    };
  }, [allLeads, REAL_CORRETORES]);

  // 5. Leads convertidos por Usuário
  const leadsConvertidosUsuarioData = {
    labels: REAL_CORRETORES,
    datasets: [{
      label: 'Leads Convertidos',
      data: REAL_CORRETORES.map(nome => convertidos.filter(l => l.corretor_responsavel === nome).length),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 6,
    }]
  };

  // 6. Tempo de primeira interação por Usuário (dados reais)
  const tempoInteracaoData = useMemo(() => {
    const temposPorCorretor = REAL_CORRETORES.map(nome => {
      const leadsDoCorretor = allLeads.filter(l => l.corretor_responsavel === nome);
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
  }, [allLeads, REAL_CORRETORES]);

  const atividadesAbertoData = useMemo(() => {
    const visitaData = REAL_CORRETORES.map(nome =>
      allLeads.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('visita')).length
    );
    const negociacaoData = REAL_CORRETORES.map(nome =>
      allLeads.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('negociação')).length
    );
    const propostaData = REAL_CORRETORES.map(nome =>
      allLeads.filter(l => l.corretor_responsavel === nome && (l.etapa_atual || '').toLowerCase().includes('proposta')).length
    );
    return {
      labels: REAL_CORRETORES,
      datasets: [
        { label: 'Visitas', data: visitaData, backgroundColor: CHART_COLORS.primaryDark, borderRadius: 4 },
        { label: 'Negociação', data: negociacaoData, backgroundColor: CHART_COLORS.primary, borderRadius: 4 },
        { label: 'Propostas', data: propostaData, backgroundColor: CHART_COLORS.primaryLight, borderRadius: 4 },
      ]
    };
  }, [allLeads, REAL_CORRETORES]);

  // 7. Leads por Temperatura (distribuição real)
  const tempCounts = useMemo(() => countByField(allLeads, 'status_temperatura'), [allLeads]);

  // 8. Leads por Etapa do Funil
  const etapaCounts = useMemo(() => countByField(allLeads, 'etapa_atual'), [allLeads]);
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

  // 9. Leads por Mês (últimos 12 meses, dados reais)
  const mensalData = useMemo(() => leadsByMonth(allLeads, 12), [allLeads]);

  const vendasFaixaChartData = {
    labels: mensalData.labels,
    datasets: [{
      label: 'Leads por mês',
      data: mensalData.values,
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 4,
    }]
  };

  // 10. Tempo Médio de Resposta por Equipe (dados reais)
  const tempoRespostaChartData = {
    labels: metricasEquipes.map(d => d.equipe),
    datasets: [{
      label: 'Tempo (min)',
      data: metricasEquipes.map(d => d.tempoMedio),
      backgroundColor: metricasEquipes.map(d => d.cor),
      borderRadius: 6,
    }]
  };

  // 11. Taxa de Conversão por Origem
  const taxaConversaoChartData = useMemo(() => {
    const origens = origemTop.labels.slice(0, 6);
    const taxas = origens.map(origem => {
      const total = allLeads.filter(l => l.origem_lead === origem).length;
      const conv = convertidos.filter(l => l.origem_lead === origem).length;
      return total > 0 ? Math.round((conv / total) * 1000) / 10 : 0;
    });
    return {
      labels: origens,
      datasets: [{ label: 'Taxa (%)', data: taxas, backgroundColor: CHART_COLORS.primary, borderRadius: 6 }]
    };
  }, [allLeads, convertidos, origemTop.labels]);

  // 12. Exclusivo vs Não Exclusivo (dados reais)
  const exclusivoCount = allLeads.filter(l => l.etapa_atual?.toLowerCase().includes('exclusivo')).length;
  const naoExclusivoCount = allLeads.length - exclusivoCount;

  const distribuicaoExclusivoFichaChartData = {
    labels: ['Exclusivo', 'Ficha'],
    datasets: [{
      label: 'Quantidade',
      data: [exclusivoCount || 0, naoExclusivoCount || allLeads.length],
      backgroundColor: [CHART_COLORS.primaryLight, CHART_COLORS.primaryDark],
      borderRadius: 6,
    }]
  };

  // 13. Leads por Mês (VGV e VGC usam os mesmos dados mensais como proxy)
  const vgvChartData = {
    labels: mensalData.labels,
    datasets: [{
      label: 'Leads recebidos',
      data: mensalData.values,
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 4,
    }]
  };

  const vgcChartData = {
    labels: mensalData.labels,
    datasets: [{
      label: 'Leads convertidos',
      data: mensalData.labels.map((_, idx) => {
        const monthStr = (() => {
          const now = new Date();
          const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();
        return convertidos.filter(l => (l.data_entrada || '').startsWith(monthStr)).length;
      }),
      backgroundColor: CHART_COLORS.primary,
      borderRadius: 4,
    }]
  };

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

  const bairrosInteresseData = {
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

  const handleExportar = async () => {
    try {
      const el = exportRef.current;
      if (!el) {
        console.error('Elemento de exportação não encontrado');
        return;
      }
      

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 5;
      const usableWidth = pdfWidth - (margin * 2);

      // Função auxiliar para capturar um elemento
      const captureElement = async (element: HTMLElement): Promise<HTMLCanvasElement> => {
        return await html2canvas(element, {
          scale: 1.5,
          useCORS: false,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        });
      };

      // Função para adicionar imagem ao PDF
      const addImageToPdf = (canvas: HTMLCanvasElement, yPos: number, maxHeight?: number): number => {
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const ratio = usableWidth / canvas.width;
        let imgHeight = canvas.height * ratio;
        
        if (maxHeight && imgHeight > maxHeight) {
          imgHeight = maxHeight;
        }
        
        pdf.addImage(imgData, 'JPEG', margin, yPos, usableWidth, imgHeight);
        return imgHeight;
      };

      // ========== PÁGINA ÚNICA: KPIs + 9 gráficos + Motivo de arquivamento ==========
      
      // Capturar KPIs
      const kpisEl = el.querySelector('[data-export-layout="kpis"]') as HTMLElement;
      if (kpisEl) {
        const kpisCanvas = await captureElement(kpisEl);
        addImageToPdf(kpisCanvas, margin, 18);
      }

      // Capturar os gráficos individualmente
      const chartsContainer = el.querySelector('[data-export-layout="charts"]') as HTMLElement;
      const chartCards = chartsContainer ? Array.from(chartsContainer.children) as HTMLElement[] : [];
      
      let currentY = 24; // Posição Y após KPIs
      const chartHeight = 22; // Altura bem menor para caber tudo
      const chartGap = 1; // Espaço mínimo entre gráficos
      const chartWidth = (usableWidth / 3) - 2; // 3 colunas
      
      // Todos os 9 gráficos em 3 colunas x 3 linhas
      for (let i = 0; i < Math.min(9, chartCards.length); i++) {
        const chartCanvas = await captureElement(chartCards[i]);
        const col = i % 3;
        const row = Math.floor(i / 3);
        const xPos = margin + (col * (usableWidth / 3 + 1));
        const yPos = currentY + (row * (chartHeight + chartGap));
        
        const imgData = chartCanvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', xPos, yPos, chartWidth, chartHeight);
      }
      
      // Motivo de arquivamento - abaixo dos gráficos
      const motivosEl = el.querySelector('[data-export-item="motivos"]') as HTMLElement;
      if (motivosEl) {
        const motivosY = currentY + (3 * (chartHeight + chartGap)) + 2;
        const motivosCanvas = await captureElement(motivosEl);
        const imgData = motivosCanvas.toDataURL('image/jpeg', 0.95);
        const ratio = usableWidth / motivosCanvas.width;
        const motivosHeight = Math.min(motivosCanvas.height * ratio, pdfHeight - motivosY - margin);
        pdf.addImage(imgData, 'JPEG', margin, motivosY, usableWidth, motivosHeight);
      }

      pdf.setProperties({
        title: 'Relatórios atualizados',
      });

      
      // Abrir nova janela ANTES de gerar o PDF (para evitar bloqueio de pop-ups)
      const newWindow = window.open('', '_blank');
      
      if (newWindow) {
        // Gerar PDF como data URI
        const pdfDataUri = pdf.output('datauristring');
        
        // Escrever conteúdo HTML na nova janela
        newWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>Relatórios atualizados</title>
              <style>
                * { margin: 0; padding: 0; }
                html, body { width: 100%; height: 100%; }
                body { display: flex; align-items: center; justify-content: center; background: #f0f0f0; }
                iframe { width: 100%; height: 100%; border: none; }
              </style>
            </head>
            <body>
              <iframe src="${pdfDataUri}" type="application/pdf"></iframe>
            </body>
          </html>
        `);
        newWindow.document.close();
      } else {
        console.error('Não foi possível abrir nova janela. Tentando download...');
        // Fallback: baixar o arquivo
        pdf.save('Relatórios atualizados.pdf');
      }
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      alert('Erro ao exportar PDF. Verifique o console para mais detalhes.');
    }
  };

  return (
    <div ref={reportRef} className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary, #f5f5f5)' }}>

      {/* Área de Filtros */}
      {activeSubArea === 'metricas' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Filtro de Empresa/Equipe */}
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <label className="text-xs font-medium text-gray-600 dark:text-slate-400 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Empresa/Equipe
              </label>
              <select
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className="h-10 px-3 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value="todas">Todas - Imobiliária JAPI</option>
                <option value="equipe-verde">Equipe Verde</option>
                <option value="equipe-azul">Equipe Azul</option>
                <option value="equipe-vermelha">Equipe Vermelha</option>
                <option value="equipe-amarela">Equipe Amarela</option>
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
              <button
                onClick={handleExportar}
                className="h-10 px-5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg font-medium text-sm flex items-center gap-2 transition-all border border-gray-300"
              >
                <Download className="h-4 w-4" />
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}
      <div ref={exportRef}>
      {/* SEÇÃO MARKETING */}
      {activeSubArea === 'marketing' && (
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
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisCalculados.totalLeadsRecebidos.toLocaleString()}</p>
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
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisCalculados.totalLeadsInteragidos.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Média Interação/Dia</p>
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisCalculados.mediaInteracaoDia}%</p>
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
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisCalculados.mediaTempoPrimeiraInteracao} min</p>
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
              <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{kpisCalculados.totalLeadsConvertidos.toLocaleString()}</p>
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
              <div data-export-layout="kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas Criadas</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{vendasCriadas}</p>
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
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{vendasAssinadas}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Imóveis Ativos</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{imoveisAtivos}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Total de Leads/Mês</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{totalLeadsMensal}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Valor Total/Mês</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{formatarValorMonetario(valorTotal)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid de Gráficos - Métricas (Gestão de Equipe) */}
              <div data-export-layout="charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Leads por Equipe */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-4">Leads por Equipe</h3>
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
                                {(top3MetricasIndividuais[1].valorComissao / 1000).toFixed(2)} Mil
                              </div>
                              <div className="text-xs mt-1 text-sky-900">Comissão</div>
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
                                {(top3MetricasIndividuais[0].valorComissao / 1000).toFixed(2)} Mil
                              </div>
                              <div className="text-xs mt-1 text-blue-900">Comissão</div>
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
                                {(top3MetricasIndividuais[2].valorComissao / 1000).toFixed(2)} Mil
                              </div>
                              <div className="text-xs mt-1 text-indigo-900">Comissão</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6 overflow-hidden h-full min-h-[640px] flex flex-col">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-gray-800">Ranking completo</h3>
                    </div>

                    <div className="mt-4 overflow-auto rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/70 flex-1">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-slate-800">
                          <tr className="text-xs">
                            <th className="text-left py-2.5 pl-3 pr-3 font-semibold text-gray-600 dark:text-slate-400">Corretores</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Ranking</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Valor comissão</th>
                            <th className="text-right py-2.5 px-3 font-semibold text-gray-600 dark:text-slate-400">Vendas feitas</th>
                            <th className="text-right py-2.5 pr-3 font-semibold text-gray-600 dark:text-slate-400">Gestão ativa</th>
                          </tr>
                        </thead>
                        <tbody>
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
                                  <td className="py-2.5 px-3 text-right text-xs text-gray-800">{row.vendasFeitas}</td>
                                  <td className="py-2.5 pr-3 text-right text-xs text-gray-800">{row.gestaoAtiva}</td>
                                </tr>
                              );
                            })}
                          <tr className="bg-gray-100 dark:bg-slate-800">
                            <td className="py-2.5 pl-3 pr-3 text-xs font-semibold text-gray-800">Total</td>
                            <td className="py-2.5 px-3" />
                            <td className="py-2.5 px-3 text-right text-xs font-semibold text-gray-800">
                              {formatCurrencyBRL.format(rankingMetricasIndividuais.reduce((acc, item) => acc + item.valorComissao, 0))}
                            </td>
                            <td className="py-2.5 px-3 text-right text-xs font-semibold text-gray-800">
                              {rankingMetricasIndividuais.reduce((acc, item) => acc + item.vendasFeitas, 0)}
                            </td>
                            <td className="py-2.5 pr-3" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    
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
              <div className="mb-6 flex justify-center">
                <div className="w-full max-w-5xl flex flex-wrap justify-center gap-4">
                {([
                  { key: 'comissao-metas', label: 'Comissão e meta', count: 0, Icon: DollarSign },
                  { key: 'leads', label: 'Leads', count: 0, Icon: Users },
                  { key: 'vendas', label: 'Origens', count: 0, Icon: TrendingUp },
                ] as const).map(({ key, label, count, Icon }) => {
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
                      className={`h-14 px-6 rounded-2xl border transition-all flex items-center gap-4 shadow-sm ${
                        isActive
                          ? 'bg-white dark:bg-slate-900 border-blue-600'
                          : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className={`text-base font-semibold ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                        {label}
                      </div>
                      <div
                        className={`ml-1 min-w-7 h-7 px-2 rounded-full text-sm font-semibold flex items-center justify-center ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : 'bg-gray-50 dark:bg-slate-950 text-gray-600 dark:text-slate-400 border border-gray-100 dark:border-slate-800'
                        }`}
                      >
                        {count}
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>


              {activeMetricasIndSubArea === 'comissao-metas' && (
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
                              <div className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">IMÓVEIS FICHA (ATIVOS)</div>
                              <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                                {metricasIndComissaoMetasMock.imoveisFichaAtivos}
                              </div>
                            </div>
                            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-4">
                              <div className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">IMÓVEIS EXCLUSIVOS (ATIVOS)</div>
                              <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                                {metricasIndComissaoMetasMock.imoveisExclusivosAtivos}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-4">
                            <div className="text-sm font-semibold text-gray-800">Imóveis fechados</div>
                            <div className="mt-2 h-10 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800" />
                          </div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6 flex flex-col gap-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">% anual</div>
                            <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                              {metricasIndComissaoMetasMock.percentual.toFixed(1)}%
                            </div>
                            <div className="mt-3 w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className="h-2 rounded-full bg-blue-500"
                                style={{ width: `${Math.min(metricasIndComissaoMetasMock.percentual, 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">META ANUAL</div>
                            <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                              {(metricasIndComissaoMetasMock.metaAnual / 1000).toFixed(0)} Mil
                            </div>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Ainda falta para meta</div>
                            <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">
                              {(metricasIndComissaoMetasMock.faltaParaMeta / 1000).toFixed(0)} Mil
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 flex-1">
                          <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                            <div className="text-sm font-semibold text-gray-800">Comissão recebida x Meta</div>
                            <div className="mt-4 h-[420px]">
                              <Bar data={comissaoVsMetaData as any} options={comissaoChartOptions as any} />
                            </div>
                          </div>

                          <div className="flex flex-col gap-4">
                            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                              <div className="text-sm font-semibold text-gray-800">Exclusivos x Meta exclusivo</div>
                              <div className="mt-4 grid grid-cols-2 gap-3 items-end">
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Exclusivos</div>
                                  <div className="mt-2 h-32 rounded-xl bg-emerald-50 border border-emerald-200 flex items-end justify-center pb-3 font-extrabold text-emerald-700">
                                    {metricasIndComissaoMetasMock.exclusivos}
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Meta</div>
                                  <div className="mt-2 h-32 rounded-xl bg-blue-50 border border-blue-200 flex items-end justify-center pb-3 font-extrabold text-blue-700">
                                    {metricasIndComissaoMetasMock.metaExclusivo}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                              <div className="text-sm font-semibold text-gray-800">Ficha x Meta ficha</div>
                              <div className="mt-4 grid grid-cols-2 gap-3 items-end">
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Ficha</div>
                                  <div className="mt-2 h-32 rounded-xl bg-emerald-50 border border-emerald-200 flex items-end justify-center pb-3 font-extrabold text-emerald-700">
                                    {metricasIndComissaoMetasMock.ficha}
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Meta</div>
                                  <div className="mt-2 h-32 rounded-xl bg-blue-50 border border-blue-200 flex items-end justify-center pb-3 font-extrabold text-blue-700">
                                    {metricasIndComissaoMetasMock.metaFicha}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeMetricasIndSubArea !== 'comissao-metas' && (
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
                          {metricasIndLeadsMock.leadsRecebidos}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-slate-400">janeiro</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-6 flex flex-col gap-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                        <div className="text-sm font-semibold text-gray-800">Leads</div>
                        <div className="mt-2 text-4xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndLeadsMock.totalLeads}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                        <div className="text-sm font-semibold text-gray-800">Leads recebidos</div>
                        <div className="mt-3 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center px-4">
                          <div className="text-sm font-semibold text-blue-700">{metricasIndLeadsMock.leadsRecebidos}</div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Visitas</div>
                            <div className="mt-2 text-xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndLeadsMock.visitas}</div>
                          </div>
                          <div className="rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3">
                            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas realizadas</div>
                            <div className="mt-2 text-xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndLeadsMock.vendasRealizadas}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-5">
                        <div className="text-sm font-semibold text-gray-800">Leads por bairro</div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-center">
                          <div className="h-[240px]">
                            <Doughnut data={leadsPorBairroData as any} options={leadsDarkCardOptions as any} />
                          </div>
                          <div className="rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-4">
                            <div className="text-xs font-semibold text-gray-700 dark:text-slate-300">Bairro</div>
                            <div className="mt-3 space-y-2 max-h-[190px] overflow-auto pr-1">
                              {leadsPorBairroLegend.map((item) => (
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
                      <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndVendasMock.vendasTotal}</div>
                      <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-blue-500"
                          style={{ width: `${Math.min(100, (metricasIndVendasMock.vendasTotal / 25) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-transparent p-5">
                      <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas exclusivas</div>
                      <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndVendasMock.vendasExclusivas}</div>
                      <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                        {metricasIndVendasMock.vendasTotal > 0
                          ? `${Math.round((metricasIndVendasMock.vendasExclusivas / metricasIndVendasMock.vendasTotal) * 100)}% do total`
                          : '0% do total'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-transparent p-5">
                      <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Vendas não exclusivas</div>
                      <div className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-slate-100">{metricasIndVendasMock.vendasNaoExclusivas}</div>
                      <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">
                        {metricasIndVendasMock.vendasTotal > 0
                          ? `${Math.round((metricasIndVendasMock.vendasNaoExclusivas / metricasIndVendasMock.vendasTotal) * 100)}% do total`
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
                            Mostrando {Math.min(25, metricasIndVendasMock.rows.length)} de {metricasIndVendasMock.rows.length}
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
                            {metricasIndVendasMock.rows.slice(0, 25).map((row, idx) => (
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
                            {metricasIndVendasMock.rows.length === 0 && (
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
                        {metricasIndVendasMock.fonteBreakdown[0]
                          ? `Top: ${metricasIndVendasMock.fonteBreakdown[0].fonte} (${metricasIndVendasMock.fonteBreakdown[0].quantidade})`
                          : 'Sem dados'}
                      </div>
                    </div>

                    <div className="mt-5 h-[280px]">
                      <Bar data={vendasPorFonteData as any} options={vendasBarOptions as any} />
                    </div>

                    <div className="mt-5 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 p-4">
                      <div className="text-xs font-semibold text-gray-700 dark:text-slate-300">Top fontes</div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {metricasIndVendasMock.fonteBreakdown.slice(0, 6).map((item) => (
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

      {tipoCliente === 'interessado' && (
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
          <div data-export-layout="kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Imóveis Ativos</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">448</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">VGV Total</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">R$ 68.9M</p>
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
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">R$ 5.2M</p>
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
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">R$ 850K</p>
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
                  <p className="text-xl font-bold text-gray-900 dark:text-slate-100">187</p>
                </div>
              </div>
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

            {/* 3. Bairros de Maior Interesse de Venda */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Bairros de Maior Interesse de Venda</h3>
              <div className="h-[280px]">
                <Bar data={bairrosInteresseData} options={defaultBarOptions} />
              </div>
            </div>

            {/* 4. Vendas por Faixa de Valor */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Vendas por Faixa de Valor</h3>
              <div className="h-[280px]">
                <Bar data={vendasFaixaChartData} options={stackedBarOptions} />
              </div>
            </div>

            {/* 5. Distribuição Exclusivo/Ficha */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Distribuição Exclusivo/Ficha</h3>
              <div className="h-[280px]">
                <Bar data={distribuicaoExclusivoFichaChartData} options={stackedBarOptions} />
              </div>
            </div>
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
      </div>
    </div>
  );
};

export default RelatoriosPage;