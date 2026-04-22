/**
 * 🎯 LEAD SECTION - Área de Trabalho Principal
 * 
 * Design inspirado no Microsoft Fabric / Power BI
 * Com banner colorido, avatar e abas de navegação
 */

import { Card, CardContent } from '@/components/ui/card';
import { 
  TrendingUp,
  Target,
  BarChart3,
  GraduationCap,
  Users,
  CheckSquare2,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  Settings2,
  CalendarRange,
  RotateCcw,
  Calendar,
  ChevronDown,
  Home,
  Pencil,
  Camera,
  X,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLeadsData } from '../hooks/useLeadsData';
import { useLeadsMetrics } from '../hooks/useLeadsMetrics';
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from '@/hooks/useTheme';
import { useDashboardConfig, TabId } from '@/hooks/useDashboardConfig';
import { useMemo, useState, useRef, useEffect } from 'react';
import { DashboardCustomizer } from '@/components/DashboardCustomizer';
import { TaskManager } from '@/components/TaskManager';
import { WeekPlanner } from '@/components/WeekPlanner';
import { OKRManager } from '@/components/OKRManager';
import { PDIManager } from '@/components/PDIManager';
import { AdminDashboard } from '@/components/AdminDashboard';
import { AgendaCalendar } from '@/features/agenda/components/AgendaCalendar';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { LeadsFunnelChart } from './LeadsFunnelChart';
import { VendedoresFunnelChart } from '@/features/corretores/components/VendedoresFunnelChart';
import { supabase } from '@/integrations/supabase/client';
import {
  getCorretoresFromImoveis,
  getTenantCorretores,
  setTenantCorretores,
  type TenantCorretor,
} from '@/features/imoveis/services/imoveisXmlService';

// Interface para configuração do workspace
interface WorkspaceConfig {
  name: string;
  description: string;
  bannerColor: string;
  bannerImage: string | null;
  avatarColor: string;
  avatarLogo: string | null;
  avatarInitial: string;
}

const DEFAULT_WORKSPACE_BANNER_COLOR = '#E91E8C';
const DEFAULT_WORKSPACE_BANNER_IMAGE = 'https://i.ibb.co/kV00G6p2/Whats-App-Image-2026-02-11-at-11-51-18.jpg';

// Status que indicam lead tipo INTERESSADO (comprador/locatário)
const INTERESSADO_STATUS = [
  'Novos Leads', 'Novo Lead', 'novos leads', 'novo lead',
  'Interação', 'Interacao', 'interação', 'interacao',
  'Visita Agendada', 'visita agendada',
  'Visita Realizada', 'visita realizada',
  'Negociação', 'Negociacao', 'negociação', 'negociacao',
  'Proposta Criada', 'proposta criada',
  'Proposta Enviada', 'proposta enviada',
  'Proposta Assinada', 'proposta assinada',
  'Em Atendimento' // Status genérico que pode ser de interessado
];

// Status que indicam lead tipo PROPRIETÁRIO (vendedor/locador)
const PROPRIETARIO_STATUS = [
  'Novos Proprietários', 'Novo Proprietário', 'novos proprietários', 'novo proprietário',
  'Primeira Visita', 'primeira visita',
  'Criação do Estudo de Mercado', 'criação do estudo de mercado',
  'Apresentação Do Estudo de Mercado', 'apresentação do estudo de mercado',
  'Não Exclusivo', 'não exclusivo',
  'Exclusivo', 'exclusivo',
  'Cadastro', 'cadastro',
  'Plano de Marketing', 'plano de marketing',
  'Propostas Respondidas', 'propostas respondidas',
  'Feitura de Contrato', 'feitura de contrato'
];

const LeadSectionContent = () => {
  const { leads: legacyLeads } = useLeadsData();
  // Usar useLeadsMetrics para dados reais de leads (com filtros de tenant/agent)
  const { processedLeads: metricsLeads, isLoading: isLoadingMetrics, isAdmin } = useLeadsMetrics();
  // Usar leads do metrics se disponível, senão fallback para legacy
  const leads = metricsLeads.length > 0 ? metricsLeads : legacyLeads;
  const { user, isGestao, tenantId, isOwner } = useAuth();

  const OVERVIEW_VALUE = '__overview__';

  const [agendaCorretores, setAgendaCorretores] = useState<TenantCorretor[]>([]);
  const [agendaCorretorEmail, setAgendaCorretorEmail] = useState<string>('');

  const [agendaKpisLoading, setAgendaKpisLoading] = useState(false);
  const [agendaKpis, setAgendaKpis] = useState({
    pendentes: 0,
    atrasadas: 0,
    proximas: 0,
    concluidas: 0,
  });

  const agendaIsVisaoGeral = agendaCorretorEmail === OVERVIEW_VALUE;
  

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;

    const cached = getTenantCorretores(tenantId)
      .filter((c) => Boolean(c.email && c.email.trim() !== ''))
      .sort((a, b) => (a.nome || a.email || '').localeCompare((b.nome || b.email || ''), 'pt-BR'));

    if (cached.length > 0) {
      setAgendaCorretores(cached);
    }

    const recompute = () => {
      const lista = getCorretoresFromImoveis(tenantId)
        .filter((c) => Boolean(c.email && c.email.trim() !== ''))
        .sort((a, b) => (a.nome || a.email || '').localeCompare((b.nome || b.email || ''), 'pt-BR'));

      if (lista.length > 0) {
        setAgendaCorretores(lista);
        setTenantCorretores(tenantId, lista);
      }
    };

    let attempts = 0;
    const maxAttempts = 20;
    const intervalMs = 250;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      const lista = getCorretoresFromImoveis(tenantId)
        .filter((c) => Boolean(c.email && c.email.trim() !== ''))
        .sort((a, b) => (a.nome || a.email || '').localeCompare((b.nome || b.email || ''), 'pt-BR'));

      if (lista.length > 0) {
        setAgendaCorretores(lista);
        setTenantCorretores(tenantId, lista);
        window.clearInterval(intervalId);
      } else if (attempts >= maxAttempts) {
        window.clearInterval(intervalId);
      }
    }, intervalMs);

    const w = window as any;
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(recompute, { timeout: 800 });
    } else {
      setTimeout(recompute, 0);
    }

    return () => {
      window.clearInterval(intervalId);
    };
  }, [tenantId]);

  useEffect(() => {
    if (!user?.email) return;
    setAgendaCorretorEmail((prev) => prev || user.email);
  }, [user?.email]);

  useEffect(() => {
    const carregarKpis = async () => {
      if (!tenantId || tenantId === 'owner') return;
      if (!agendaCorretorEmail) return;
      if (agendaIsVisaoGeral) {
        setAgendaKpis({ pendentes: 0, atrasadas: 0, proximas: 0, concluidas: 0 });
        return;
      }

      setAgendaKpisLoading(true);
      try {
        const { data, error } = await supabase
          .from('agenda_eventos')
          .select('id, titulo, data, horario, status')
          .eq('tenant_id', tenantId)
          .eq('corretor_email', agendaCorretorEmail);

        if (error) throw error;

        const agora = new Date();
        const limiteProximas = new Date();
        limiteProximas.setDate(limiteProximas.getDate() + 7);

        const eventos = Array.isArray(data) ? data : [];

        const getDateTime = (evt: any) => {
          const base = new Date(evt.data);
          const horario = (evt.horario || '').toString();
          if (horario && /^\d{2}:\d{2}/.test(horario)) {
            const [hh, mm] = horario.split(':').map((n: string) => Number(n));
            base.setHours(hh || 0, mm || 0, 0, 0);
          } else {
            base.setHours(0, 0, 0, 0);
          }
          return base;
        };

        const isConcluida = (status: string) => status === 'concluido';
        const isCancelada = (status: string) => status === 'cancelado';
        const isPendente = (status: string) => status === 'pendente' || status === 'confirmado';

        let pendentes = 0;
        let atrasadas = 0;
        let proximas = 0;
        let concluidas = 0;

        for (const evt of eventos) {
          const status = String(evt.status || 'pendente');
          const dt = getDateTime(evt);

          if (isCancelada(status)) continue;
          if (isConcluida(status)) {
            concluidas += 1;
            continue;
          }

          if (isPendente(status)) {
            pendentes += 1;
            if (dt < agora) atrasadas += 1;
            if (dt >= agora && dt <= limiteProximas) proximas += 1;
          }
        }

        setAgendaKpis({ pendentes, atrasadas, proximas, concluidas });
      } catch {
        setAgendaKpis({ pendentes: 0, atrasadas: 0, proximas: 0, concluidas: 0 });
      } finally {
        setAgendaKpisLoading(false);
      }
    };
    carregarKpis();
  }, [tenantId, agendaCorretorEmail, agendaIsVisaoGeral]);
  
  // Filtrar leads por tipo baseado no status
  const leadsInteressado = useMemo(() => {
    return leads.filter(lead => {
      const status = lead.etapa_atual || '';
      // Lead é interessado se o status está na lista de interessado
      // OU se NÃO está na lista de proprietário (default = interessado)
      const isProprietario = PROPRIETARIO_STATUS.some(s => 
        status.toLowerCase().includes(s.toLowerCase())
      );
      return !isProprietario;
    });
  }, [leads]);
  
  const leadsProprietario = useMemo(() => {
    return leads.filter(lead => {
      const status = lead.etapa_atual || '';
      // Lead é proprietário se o status está na lista de proprietário
      return PROPRIETARIO_STATUS.some(s => 
        status.toLowerCase().includes(s.toLowerCase())
      );
    });
  }, [leads]);
  
  const { isSidebarOpen } = useSidebar();
  
  // 🏢 Estado do workspace (persistido no localStorage)
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig>(() => {
    const saved = localStorage.getItem('workspaceConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        const bannerImage = parsed.bannerImage || null;
        const bannerColor = parsed.bannerColor || DEFAULT_WORKSPACE_BANNER_COLOR;

        return {
          ...parsed,
          bannerColor,
          bannerImage: !bannerImage && bannerColor === DEFAULT_WORKSPACE_BANNER_COLOR ? DEFAULT_WORKSPACE_BANNER_IMAGE : bannerImage
        };
      } catch {
        return {
          name: 'Área de trabalho principal',
          description: '',
          bannerColor: DEFAULT_WORKSPACE_BANNER_COLOR,
          bannerImage: DEFAULT_WORKSPACE_BANNER_IMAGE,
          avatarColor: '#B91C4D',
          avatarLogo: null,
          avatarInitial: 'A'
        };
      }
    }
    return {
      name: 'Área de trabalho principal',
      description: '',
      bannerColor: DEFAULT_WORKSPACE_BANNER_COLOR,
      bannerImage: DEFAULT_WORKSPACE_BANNER_IMAGE,
      avatarColor: '#B91C4D',
      avatarLogo: null,
      avatarInitial: 'A'
    };
  });
  
  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
  const [editName, setEditName] = useState(workspaceConfig.name);
  const [editDescription, setEditDescription] = useState(workspaceConfig.description);
  const [editBannerColor, setEditBannerColor] = useState(workspaceConfig.bannerColor);
  const [editBannerImage, setEditBannerImage] = useState<string | null>(workspaceConfig.bannerImage);
  const [editAvatarColor, setEditAvatarColor] = useState(workspaceConfig.avatarColor);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  
  // TABS dinâmico baseado no role do usuário
  const TABS: { id: TabId; label: string; icon: any }[] = [
    { id: 'funil', label: 'Funil', icon: Filter },
    { id: 'okrs', label: 'OKRs', icon: Target },
    { id: 'kpis', label: 'KPIs', icon: BarChart3 },
    { id: 'pdi', label: 'PDI', icon: GraduationCap },
    { id: 'tarefas-semana', label: 'Tarefas da Semana', icon: CheckSquare2 },
    { id: 'agenda', label: 'Agenda', icon: Calendar }
  ];
  const { config, isLoading: isLoadingConfig } = useDashboardConfig();
  const [activeTab, setActiveTab] = useState<TabId>('funil');
  const [customizerOpen, setCustomizerOpen] = useState(false);
  
  // Funções para editar workspace
  const handleSaveWorkspace = () => {
    const newConfig: WorkspaceConfig = {
      ...workspaceConfig,
      name: editName.trim() || 'Área de trabalho principal',
      description: editDescription,
      bannerColor: editBannerColor,
      bannerImage: editBannerImage,
      avatarColor: editAvatarColor,
      avatarInitial: (editName.trim() || 'A').charAt(0).toUpperCase()
    };
    setWorkspaceConfig(newConfig);
    localStorage.setItem('workspaceConfig', JSON.stringify(newConfig));
    setIsEditingWorkspace(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Imagem muito grande. Máximo 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const newConfig = { ...workspaceConfig, avatarLogo: base64 };
        setWorkspaceConfig(newConfig);
        localStorage.setItem('workspaceConfig', JSON.stringify(newConfig));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Imagem muito grande. Máximo 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setEditBannerImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeBannerImage = () => {
    setEditBannerImage(null);
  };

  const handleRemoveLogo = () => {
    const newConfig = { ...workspaceConfig, avatarLogo: null };
    setWorkspaceConfig(newConfig);
    localStorage.setItem('workspaceConfig', JSON.stringify(newConfig));
  };

  const openEditModal = () => {
    setEditName(workspaceConfig.name);
    setEditDescription(workspaceConfig.description);
    setEditBannerColor(workspaceConfig.bannerColor);
    setEditAvatarColor(workspaceConfig.avatarColor);
    setIsEditingWorkspace(true);
  };
  
  // Estados para filtro de período em Meus Leads
  const [periodoFiltro, setPeriodoFiltro] = useState<'todos' | 'hoje' | '7dias' | '30dias' | '90dias' | 'personalizado'>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  // Estado para valores dos KPIs por atividade e semana
  const [kpiValues, setKpiValues] = useState<Record<string, Record<number, number>>>({});
  
  // Inicializar tema
  useTheme();

  // Calcular semanas do mês atual
  const semanasDoMes = useMemo(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    
    // Primeiro dia do mês
    const primeiroDia = new Date(ano, mes, 1);
    // Último dia do mês
    const ultimoDia = new Date(ano, mes + 1, 0);
    
    const semanas: { inicio: Date; fim: Date; label: string }[] = [];
    let inicioSemana = new Date(primeiroDia);
    
    while (inicioSemana <= ultimoDia) {
      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);
      
      // Não ultrapassar o último dia do mês
      const fimReal = fimSemana > ultimoDia ? ultimoDia : fimSemana;
      
      const formatDate = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      
      semanas.push({
        inicio: new Date(inicioSemana),
        fim: new Date(fimReal),
        label: `${formatDate(inicioSemana)} a ${formatDate(fimReal)}`
      });
      
      inicioSemana = new Date(fimSemana);
      inicioSemana.setDate(inicioSemana.getDate() + 1);
    }
    
    // Garantir exatamente 4 semanas (ou menos se o mês for curto)
    return semanas.slice(0, 4);
  }, []);

  // KPIs por semana
  const kpisSemanais = useMemo(() => {
    const calcularKPIsSemana = (inicio: Date, fim: Date) => {
      const leadsNaSemana = leads.filter(l => {
        const dataLead = new Date(l.data_lead);
        return dataLead >= inicio && dataLead <= fim;
      });
      
      const meusLeadsNaSemana = leadsNaSemana.filter(l => l.corretor_responsavel === user?.name);
      const leadsQuentes = leadsNaSemana.filter(l => l.status_temperatura === 'Quente').length;
      const convertidos = leadsNaSemana.filter(l => l.etapa_atual === 'Fechamento').length;
      const total = leadsNaSemana.length;
      const taxaConversao = total > 0 ? ((convertidos / total) * 100).toFixed(1) : '0';
      
      return {
        novosLeads: total,
        meusLeads: meusLeadsNaSemana.length,
        leadsQuentes,
        conversoes: convertidos,
        taxaConversao: `${taxaConversao}%`
      };
    };
    
    return semanasDoMes.map(semana => ({
      ...semana,
      kpis: calcularKPIsSemana(semana.inicio, semana.fim)
    }));
  }, [leads, user?.name, semanasDoMes]);

  // Atividades de acompanhamento para KPIs (metaMensal = meta numérica para cálculo de %)
  const atividadesKPI = [
    { id: 'contato-vendedores', label: 'Contato com vendedores', meta: 'Mínimo de 5 - 1 por dia', metaMensal: 20 },
    { id: '1a-visita', label: '1a visita', meta: 'Duas por semana', metaMensal: 8 },
    { id: 'apresentacao', label: 'Apresentação', meta: 'Uma por semana', metaMensal: 4 },
    { id: 'conversao-ficha', label: 'Conversão em ficha', meta: 'Duas por semana', metaMensal: 8 },
    { id: 'conversao-gestao', label: 'Conversão em gestão', meta: 'No inicio 1(um) mensal', metaMensal: 1 },
    { id: 'acoes-posicionamento', label: 'Ações de posicionamento', meta: 'Distribuição de sacolas e cartões', metaMensal: 4 },
    { id: 'plano-mkt', label: 'Plano de mkt e feedback', meta: 'A cada 15 dias (gestão)', metaMensal: 2 },
    { id: 'reunioes-preco', label: 'Reuniões de ajuste de preço', meta: 'Mensalmente os em (fichas)', metaMensal: 1 }
  ];

  // Função para calcular soma e cor baseada na porcentagem da meta
  const calcularTotalKPI = (atividadeId: string, metaMensal: number) => {
    const valores = kpiValues[atividadeId] || {};
    const soma = Object.values(valores).reduce((acc, val) => acc + (val || 0), 0);
    const porcentagem = metaMensal > 0 ? (soma / metaMensal) * 100 : 0;
    
    let corStyle: React.CSSProperties = {};
    if (soma === 0) {
      corStyle = { backgroundColor: '#f3f4f6', color: '#9ca3af' };
    } else if (porcentagem >= 100) {
      corStyle = { backgroundColor: '#22c55e', color: 'white' };
    } else if (porcentagem >= 70) {
      corStyle = { backgroundColor: '#eab308', color: 'white' };
    } else {
      corStyle = { backgroundColor: '#ef4444', color: 'white' };
    }
    
    return { soma, porcentagem, corStyle };
  };

  // Função para atualizar valor do KPI
  const handleKpiChange = (atividadeId: string, semanaIdx: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setKpiValues(prev => ({
      ...prev,
      [atividadeId]: {
        ...(prev[atividadeId] || {}),
        [semanaIdx]: numValue
      }
    }));
  };

  // Meus Leads - filtrados por corretor
  const meusLeadsBase = useMemo(() => {
    if (!user?.name) return [];
    return leads.filter(lead => lead.corretor_responsavel === user?.name);
  }, [leads, user?.name]);

  // Meus Leads - aplicar filtro de período
  const meusLeads = useMemo(() => {
    if (periodoFiltro === 'todos') return meusLeadsBase;

    const agora = new Date();
    let dataLimite: Date;

    switch (periodoFiltro) {
      case 'hoje':
        dataLimite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        return meusLeadsBase.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case '7dias':
        dataLimite = new Date(agora);
        dataLimite.setDate(agora.getDate() - 7);
        return meusLeadsBase.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case '30dias':
        dataLimite = new Date(agora);
        dataLimite.setDate(agora.getDate() - 30);
        return meusLeadsBase.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case '90dias':
        dataLimite = new Date(agora);
        dataLimite.setDate(agora.getDate() - 90);
        return meusLeadsBase.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case 'personalizado':
        if (!dataInicio && !dataFim) return meusLeadsBase;
        
        return meusLeadsBase.filter(lead => {
          const dataLead = new Date(lead.data_lead);
          const inicio = dataInicio ? new Date(dataInicio) : new Date(0);
          const fim = dataFim ? new Date(dataFim) : new Date();
          
          return dataLead >= inicio && dataLead <= fim;
        });
      
      default:
        return meusLeadsBase;
    }
  }, [meusLeadsBase, periodoFiltro, dataInicio, dataFim]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'funil':
        return (
          <div className="w-full">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 dark:text-slate-100">Funis de Conversão</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">
                Visualize os funis completos de Cliente Interessado e Cliente Proprietário
              </p>
            </div>
            
            {/* Grid de 2 colunas - Funis lado a lado */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Funil Cliente Interessado (Pré-Atendimento + Atendimento) */}
              <div className="w-full h-[900px]">
                <LeadsFunnelChart leads={leadsInteressado} />
              </div>
              
              {/* Funil Cliente Proprietário */}
              <div className="w-full h-[900px]">
                <VendedoresFunnelChart leads={leadsProprietario} />
              </div>
            </div>
          </div>
        );


      case 'okrs':
        return <OKRManager />;

      case 'kpis':
        return (
          <div className="w-full max-w-full">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 dark:text-slate-100">KPIs</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">
                Acompanhamento semanal de indicadores
              </p>
            </div>
            
            <Card>
              <CardContent className="p-0">
                {/* Tabela de KPIs por Semana */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800">
                        <th className="text-left py-3 px-4 font-semibold text-sm text-white border-r border-blue-500/30 dark:border-blue-400/30">
                          Atividades de acompanhamento
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-sm text-white border-r border-blue-500/30 dark:border-blue-400/30">
                          Metas e ações
                        </th>
                        {kpisSemanais.map((semana, idx) => (
                          <th 
                            key={idx} 
                            className="text-center py-3 px-4 font-semibold text-sm text-white border-r border-blue-500/30 dark:border-blue-400/30"
                          >
                            Visitas {semana.label}
                          </th>
                        ))}
                        <th className="text-center py-3 px-4 font-semibold text-sm text-white">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {atividadesKPI.map((atividade, rowIdx) => {
                        const { soma, porcentagem, corStyle } = calcularTotalKPI(atividade.id, atividade.metaMensal);
                        return (
                          <tr 
                            key={atividade.id} 
                            className={`${
                              rowIdx % 2 === 0 
                                ? 'bg-white dark:bg-gray-800' 
                                : 'bg-gray-50 dark:bg-gray-800/50'
                            } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                          >
                            <td className="py-3 px-4 border-r border-gray-200 dark:border-gray-700 dark:border-slate-800">
                              <span className="font-medium text-gray-900 dark:text-white dark:text-slate-100">
                                {atividade.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center border-r border-gray-200 dark:border-gray-700 dark:border-slate-800">
                              <span className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">
                                {atividade.meta}
                              </span>
                            </td>
                            {kpisSemanais.map((semana, colIdx) => (
                              <td 
                                key={colIdx} 
                                className="py-3 px-4 text-center border-r border-gray-200 dark:border-gray-700 dark:border-slate-800"
                              >
                                <Input 
                                  type="number"
                                  min="0"
                                  placeholder="-"
                                  value={kpiValues[atividade.id]?.[colIdx] || ''}
                                  onChange={(e) => handleKpiChange(atividade.id, colIdx, e.target.value)}
                                  className="w-16 h-8 text-center text-sm mx-auto"
                                />
                              </td>
                            ))}
                            <td className="py-3 px-4 text-center">
                              <div 
                                className="inline-flex flex-col items-center justify-center px-3 py-1 rounded-md"
                                style={corStyle}
                              >
                                <span className="font-bold text-sm">{soma}</span>
                                <span className="text-xs">({porcentagem.toFixed(0)}%)</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'pdi':
        return <PDIManager />;

      case 'meus-leads':
        return (
          <div className="w-full max-w-full">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 dark:text-slate-100">Meus Leads</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">
                    Leads atribuídos a você
                  </p>
                </div>
                <Badge variant="outline" className="text-lg font-semibold px-4 py-2">
                  {meusLeads.length} leads
                </Badge>
              </div>

              {/* Filtros */}
              <div className="flex items-center gap-3 flex-wrap p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-950 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-600 dark:text-gray-400 dark:text-slate-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-slate-300">Período:</span>
                </div>

                <Select value={periodoFiltro} onValueChange={(value) => setPeriodoFiltro(value as typeof periodoFiltro)}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="todos">Todo Período</SelectItem>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                    <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                    <SelectItem value="90dias">Últimos 90 dias</SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>

                {periodoFiltro === 'personalizado' && (
                  <>
                    <div className="flex items-center gap-2">
                      <CalendarRange className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">De:</span>
                      <Input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className="w-[150px] h-9"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">Até:</span>
                      <Input
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                        className="w-[150px] h-9"
                      />
                    </div>
                  </>
                )}

                {periodoFiltro !== 'todos' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPeriodoFiltro('todos');
                      setDataInicio('');
                      setDataFim('');
                    }}
                    className="h-9 ml-auto"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Limpar
                  </Button>
                )}
              </div>
            </div>
            
            {meusLeads.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Users className="h-20 w-20 text-gray-300 dark:text-gray-600 mx-auto mb-6" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 dark:text-slate-100">
                    Nenhum lead atribuído
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">
                    Você não tem leads atribuídos no momento
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {meusLeads.map((lead) => (
                  <Card key={lead.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1 dark:text-slate-100">
                            {lead.nome}
                          </h3>
                          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 dark:text-slate-400">
                            <span>{lead.etapa_atual || 'Novo Lead'}</span>
                            {lead.telefone && (
                              <>
                                <span>•</span>
                                <span>{lead.telefone}</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {lead.status_temperatura && (
                            <Badge className={`${
                              lead.status_temperatura === 'Quente' 
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                : lead.status_temperatura === 'Morno'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            }`}>
                              {lead.status_temperatura}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );

      case 'tarefas-semana':
        return <WeekPlanner />;

      case 'agenda':
        return (
          <div className="space-y-4">
            <div className="w-full sm:w-[320px]">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 dark:text-slate-400">Corretor</p>
              <Select value={agendaCorretorEmail} onValueChange={setAgendaCorretorEmail}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OVERVIEW_VALUE}>Visão geral</SelectItem>
                  {agendaCorretores.map((c) => (
                    <SelectItem key={c.email} value={c.email as string} className="text-gray-900 dark:text-white dark:text-slate-100">
                      {(c.nome || '').trim() || (c.email as string)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 dark:bg-slate-900 dark:border-slate-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 dark:text-slate-400">Atividades pendentes</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white dark:text-slate-100">
                  {agendaKpisLoading ? '--' : agendaKpis.pendentes}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 dark:bg-slate-900 dark:border-slate-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 dark:text-slate-400">Atrasadas</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white dark:text-slate-100">
                  {agendaKpisLoading ? '--' : agendaKpis.atrasadas}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 dark:bg-slate-900 dark:border-slate-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 dark:text-slate-400">Próximas (7 dias)</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white dark:text-slate-100">
                  {agendaKpisLoading ? '--' : agendaKpis.proximas}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 dark:bg-slate-900 dark:border-slate-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 dark:text-slate-400">Concluídas</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white dark:text-slate-100">
                  {agendaKpisLoading ? '--' : agendaKpis.concluidas}
                </p>
              </div>
            </div>

            <AgendaCalendar corretorEmail={agendaIsVisaoGeral ? undefined : agendaCorretorEmail} />
          </div>
        );

      default:
        return null;
    }
  };

  // Filtrar abas visíveis baseado na configuração do usuário
  const abasVisiveis = useMemo(() => {
    if (!config || isLoadingConfig) {
      return TABS; // Mostrar todas enquanto carrega
    }
    
    // Filtrar e ordenar abas baseado na configuração
    const abasOrdenadas = config.ordem_abas
      .map(tabId => TABS.find(t => t.id === tabId))
      .filter((tab): tab is typeof TABS[0] => 
        tab !== undefined && config.abas_visiveis.includes(tab.id)
      );
    
    return abasOrdenadas.length > 0 ? abasOrdenadas : TABS;
  }, [config, isLoadingConfig]);

  // Definir aba ativa inicial baseada na configuração
  useMemo(() => {
    if (config && !isLoadingConfig) {
      // Se a aba ativa não está visível, mudar para a aba padrão
      if (!config.abas_visiveis.includes(activeTab)) {
        setActiveTab(config.aba_padrao);
      }
    }
  }, [config, isLoadingConfig, activeTab]);

  return (
    <div className="min-h-screen w-full bg-white dark:bg-gray-900 dark:bg-slate-900">
      {/* 🎨 Banner Colorido - Estilo Power BI */}
      <div 
        className="w-full h-52 relative overflow-hidden"
        style={{ 
          backgroundColor: workspaceConfig.bannerImage ? 'transparent' : workspaceConfig.bannerColor 
        }}
      >
        {/* Imagem de Capa */}
        {workspaceConfig.bannerImage && (
          <img 
            src={workspaceConfig.bannerImage} 
            alt="Capa" 
            className="w-full h-full object-cover absolute inset-0"
          />
        )}
        {/* Botão Alterar Capa */}
        {isGestao && (
          <button 
            onClick={openEditModal}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded transition-colors z-10"
          >
            <Pencil className="w-3.5 h-3.5" />
            Alterar capa
          </button>
        )}
      </div>
      
      {/* Container Principal */}
      <div className="w-full px-8 bg-white dark:bg-gray-900 dark:bg-slate-900">
        {/* Header com Avatar e Info - Estilo Power BI */}
        <div className="flex items-start gap-5 mb-4">
          {/* Avatar/Logo do Workspace - sobe sobre o banner */}
          <div className="relative -mt-2">
            <div 
              className="w-[80px] h-[80px] rounded-2xl flex items-center justify-center text-white text-4xl font-normal shadow-lg border-4 border-white overflow-hidden cursor-pointer group"
              style={{ backgroundColor: workspaceConfig.avatarLogo ? 'transparent' : workspaceConfig.avatarColor }}
              onClick={isGestao ? openEditModal : undefined}
            >
              {workspaceConfig.avatarLogo ? (
                <img src={workspaceConfig.avatarLogo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                workspaceConfig.avatarInitial
              )}
              {/* Overlay de edição */}
              {isGestao && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            {/* Ícone de Home no canto inferior esquerdo */}
            <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-white rounded-md shadow-sm flex items-center justify-center border border-gray-200 dark:bg-slate-900 dark:border-slate-800">
              <Home className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
            </div>
          </div>
          
          {/* Info do Workspace */}
          <div className="flex-1 pt-3">
            <div className="flex items-center gap-1.5">
              <h1 
                className="text-2xl font-medium text-gray-900 dark:text-white cursor-pointer hover:text-gray-700 transition-colors dark:text-slate-100"
                onClick={isGestao ? openEditModal : undefined}
              >
                {workspaceConfig.name}
              </h1>
              <ChevronDown className="w-5 h-5 text-gray-400 dark:text-slate-500" />
            </div>
            <p 
              className={`text-sm mt-1 cursor-pointer ${
                workspaceConfig.description 
                  ? 'text-gray-600 dark:text-gray-400' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}
              onClick={isGestao ? openEditModal : undefined}
            >
              {workspaceConfig.description || 'Adicionar descrição da área de trabalho'}
            </p>
          </div>
          
        </div>
        
        {/* Abas horizontais - Estilo Power BI */}
        <div className="border-b border-gray-200 dark:border-gray-700 mt-3 dark:border-slate-800">
          <div className="flex items-center gap-8">
            {abasVisiveis.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 pb-3 text-sm font-normal whitespace-nowrap transition-colors relative
                    ${isActive 
                      ? 'text-gray-900 dark:text-white' 
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }
                  `}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0 0 12px 0',
                    margin: 0,
                    cursor: 'pointer'
                  }}
                >
                  <Icon 
                    className="h-4 w-4" 
                    style={{ 
                      background: 'none',
                      backgroundColor: 'transparent',
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 2
                    }} 
                  />
                  <span>{tab.label}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                         style={{ marginBottom: '-1px' }}></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conteúdo da aba ativa */}
        <div className="w-full py-6">
          {renderTabContent()}
        </div>
      </div>

      {/* Modal de Personalização do Dashboard */}
      <DashboardCustomizer 
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
      />
      
      {/* Modal de Edição do Workspace - Apenas para Admin */}
      {isEditingWorkspace && isGestao && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 dark:text-slate-100">
              Personalizar Área de Trabalho
            </h2>
            
            {/* Upload de Logo */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 dark:text-slate-300">
                Logo/Avatar
              </label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-xl font-bold overflow-hidden border-2 border-dashed border-gray-300 cursor-pointer hover:border-blue-400 transition-colors"
                  style={{ backgroundColor: workspaceConfig.avatarLogo ? 'transparent' : editAvatarColor }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {workspaceConfig.avatarLogo ? (
                    <img src={workspaceConfig.avatarLogo} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-6 h-6 text-white/70" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium dark:text-blue-400"
                  >
                    {workspaceConfig.avatarLogo ? 'Trocar imagem' : 'Enviar imagem'}
                  </button>
                  {workspaceConfig.avatarLogo && (
                    <button
                      onClick={handleRemoveLogo}
                      className="text-sm text-red-500 hover:text-red-600 font-medium"
                    >
                      Remover imagem
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
            </div>

            {/* Nome do Workspace */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 dark:text-slate-300">
                Nome da Área de Trabalho
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ex: Área de trabalho principal"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            
            {/* Descrição */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 dark:text-slate-300">
                Descrição (opcional)
              </label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Adicione uma descrição..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Cor do Banner */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 dark:text-slate-300">
                Cor do Banner
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editBannerColor}
                  onChange={(e) => setEditBannerColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                />
                <div className="flex gap-2 flex-wrap">
                  {['#E91E8C', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#6366F1'].map(color => (
                    <button
                      key={color}
                      onClick={() => setEditBannerColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${editBannerColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Imagem de Capa */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 dark:text-slate-300">
                Imagem de Capa (opcional)
              </label>
              <div className="flex flex-col gap-3">
                {editBannerImage ? (
                  <div className="relative w-full h-24 rounded-lg overflow-hidden border border-gray-300">
                    <img src={editBannerImage} alt="Capa" className="w-full h-full object-cover" />
                    <button
                      onClick={removeBannerImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div 
                    className="w-full h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer flex items-center justify-center gap-2 text-gray-500 hover:text-blue-500 transition-colors dark:text-slate-400"
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-sm">Clique para enviar uma imagem de capa</span>
                  </div>
                )}
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerImageUpload}
                />
                <p className="text-xs text-gray-500 dark:text-slate-400">Recomendado: 1920x400px. Máximo 5MB.</p>
              </div>
            </div>
            
            {/* Cor do Avatar */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 dark:text-slate-300">
                Cor do Avatar (quando sem logo)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editAvatarColor}
                  onChange={(e) => setEditAvatarColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                />
                <div className="flex gap-2 flex-wrap">
                  {['#B91C4D', '#1E40AF', '#047857', '#B45309', '#6D28D9', '#B91C1C', '#0E7490', '#4338CA'].map(color => (
                    <button
                      key={color}
                      onClick={() => setEditAvatarColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${editAvatarColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="mb-6 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 dark:border-slate-800">
              <div className="h-16 relative" style={{ backgroundColor: editBannerImage ? 'transparent' : editBannerColor }}>
                {editBannerImage && (
                  <img src={editBannerImage} alt="Preview capa" className="w-full h-full object-cover absolute inset-0" />
                )}
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 -mt-6 dark:bg-slate-950">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold border-2 border-white shadow-md overflow-hidden"
                    style={{ backgroundColor: workspaceConfig.avatarLogo ? 'transparent' : editAvatarColor }}
                  >
                    {workspaceConfig.avatarLogo ? (
                      <img src={workspaceConfig.avatarLogo} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      (editName || 'A').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white dark:text-slate-100">{editName || 'Nome da área'}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{editDescription || 'Descrição...'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingWorkspace(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium dark:text-slate-300 dark:hover:bg-slate-800/60"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveWorkspace}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};

export const LeadSection = () => {
  
  try {
    return (
      <SidebarProvider>
        <LeadSectionContent />
      </SidebarProvider>
    );
  } catch (error) {
    console.error('❌ Erro ao renderizar LeadSection:', error);
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold mb-4">Erro ao carregar LeadSection</h2>
        <p className="text-red-400">{error instanceof Error ? error.message : 'Erro desconhecido'}</p>
      </div>
    );
  }
};
