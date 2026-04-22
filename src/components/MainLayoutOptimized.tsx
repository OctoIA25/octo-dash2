/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * MainLayout Otimizado com React Router
 * Cada seção agora tem sua própria rota para navegação mais rápida
 */

import React, { useState, memo, useRef, useEffect, useCallback } from 'react';
import { Outlet, useSearchParams, useLocation } from 'react-router-dom';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { useAuthContext } from '@/contexts/AuthContext';
import { useRouteSync } from '@/hooks/useRouteSync';
import { useTheme } from '@/hooks/useTheme';
import { 
  ChevronDown, 
  Check,
  Calendar, 
  Search, 
  Menu, 
  Plus, 
  Grid3x3, 
  Settings, 
  HelpCircle, 
  LogOut, 
  Bell, 
  BellOff, 
  Palette, 
  User,
  Home,
  Inbox,
  BarChart3,
  UsersRound,
  UserCheck,
  Users,
  Building2,
  Bot,
  ClipboardList,
  Headphones,
  Phone,
  TrendingUp,
  MessageCircle,
  Target,
  GraduationCap,
  UserPlus,
  Key,
  Plug
} from 'lucide-react';

// Tipo para subseções de Gestão de Equipe
export type GestaoEquipeSubSection = 'tarefas' | 'okrs' | 'pdi' | 'acessos-permissoes' | 'equipes';

// Tipo para subseções de Recrutamento
export type RecrutamentoSubSection = 'candidatos' | 'metricas';
import { useNavigate } from 'react-router-dom';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { 
  FixedSidebar, 
  SidebarSection,
  MetricasSubSection,
  ClienteInteressadoSubSection, 
  ClienteProprietarioSubSection, 
  CorretoresSubSection, 
  AgentesIaSubSection,
  EstudoMercadoSubSection
} from './FixedSidebar';

interface MainLayoutOptimizedProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children?: React.ReactNode;
}

export const MainLayoutOptimized = ({ leads, onRefresh, isRefreshing, children }: MainLayoutOptimizedProps) => {
  const { isGestao, isCorretor, user, isOwner } = useAuthContext();
  const { currentTheme, changeTheme } = useTheme();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const navigate = useNavigate();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [themeSubmenuOpen, setThemeSubmenuOpen] = useState(false);
  const profileButtonRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const isLightTheme = currentTheme === 'branco';
  const [secondarySidebarOpen, setSecondarySidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // Recuperar largura salva ou usar padrão
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved) : 80;
  });
  
  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedButton = profileButtonRef.current?.contains(target);
      const clickedMenu = profileMenuRef.current?.contains(target);
      if (!clickedButton && !clickedMenu) {
        setProfileDropdownOpen(false);
        setThemeSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Refs para atualização direta do DOM (performance)
  const mainRef = useRef<HTMLElement>(null);
  const topBarSpacerRef = useRef<HTMLDivElement>(null);
  const headerSpacerRef = useRef<HTMLDivElement>(null);
  
  // Handler otimizado para mudança da sidebar - SEM setState durante resize
  const handleSidebarChange = useCallback((isOpen: boolean, width?: number, isFinal?: boolean) => {
    if (width !== undefined) {
      // Atualizar DOM diretamente (sem React)
      if (mainRef.current) {
        mainRef.current.style.marginLeft = `${width + 16}px`;
      }
      if (topBarSpacerRef.current) {
        topBarSpacerRef.current.style.width = `${width}px`;
      }
      if (headerSpacerRef.current) {
        headerSpacerRef.current.style.width = `${width}px`;
      }
      // Só atualiza estado no FINAL do resize
      if (isFinal) {
        setSidebarWidth(width);
        setSecondarySidebarOpen(isOpen);
      }
    } else {
      setSecondarySidebarOpen(isOpen);
    }
  }, []);
  
  // Estados para navegação
  const [activeSection, setActiveSection] = useState<SidebarSection>(() => {
    const saved = localStorage.getItem('selectedSection');
    return (saved as SidebarSection) || 'leads';
  });

  const [activeMetricasSubSection, setActiveMetricasSubSection] = useState<MetricasSubSection>(() => {
    const saved = localStorage.getItem('selectedMetricasSubSection');
    return (saved as MetricasSubSection) || 'cliente-interessado';
  });

  const [activeClienteInteressadoSubSection, setActiveClienteInteressadoSubSection] = useState<ClienteInteressadoSubSection>(() => {
    const saved = localStorage.getItem('selectedClienteInteressadoSubSection');
    return (saved as ClienteInteressadoSubSection) || 'geral';
  });

  const [activeClienteProprietarioSubSection, setActiveClienteProprietarioSubSection] = useState<ClienteProprietarioSubSection>(() => {
    const saved = localStorage.getItem('selectedClienteProprietarioSubSection');
    return (saved as ClienteProprietarioSubSection) || 'cliente-proprietario';
  });

  const [activeCorretoresSubSection, setActiveCorretoresSubSection] = useState<CorretoresSubSection>(() => {
    const saved = localStorage.getItem('selectedCorretoresSubSection');
    return (saved as CorretoresSubSection) || 'meus-leads';
  });

  const [activeAgentesIaSubSection, setActiveAgentesIaSubSection] = useState<AgentesIaSubSection>(() => {
    const saved = localStorage.getItem('selectedAgentesIaSubSection');
    return (saved as AgentesIaSubSection) || 'agente-marketing';
  });

  const [activeEstudoMercadoSubSection, setActiveEstudoMercadoSubSection] = useState<EstudoMercadoSubSection>(() => {
    const saved = localStorage.getItem('selectedEstudoMercadoSubSection');
    return (saved as EstudoMercadoSubSection) || 'avaliacao';
  });

  const [activeGestaoEquipeSubSection, setActiveGestaoEquipeSubSection] = useState<GestaoEquipeSubSection>(() => {
    const saved = localStorage.getItem('selectedGestaoEquipeSubSection');
    if (saved === 'metricas') {
      return 'tarefas';
    }
    return (saved as GestaoEquipeSubSection) || 'tarefas';
  });

  const [activeRecrutamentoSubSection, setActiveRecrutamentoSubSection] = useState<RecrutamentoSubSection>(() => {
    const saved = localStorage.getItem('selectedRecrutamentoSubSection');
    return (saved as RecrutamentoSubSection) || 'candidatos';
  });

  // Mapeamento de seções com ícones e labels para o header
  const sectionConfig: Record<SidebarSection, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }> = {
    'leads': { icon: Home, label: 'Início' },
    'notificacoes': { icon: Bell, label: 'Notificações' },
    'meus-leads': { icon: Inbox, label: 'Meus Leads' },
    'metricas': { icon: BarChart3, label: 'Comercial' },
    'estudo-mercado': { icon: TrendingUp, label: 'Estudo de Mercado' },
    'recrutamento': { icon: UserCheck, label: 'Recrutamento' },
    'gestao-equipe': { icon: Users, label: 'Gestão de Equipe' },
    'bolsao': { icon: Inbox, label: 'Bolsão' },
    'imoveis': { icon: Building2, label: 'Imóveis' },
    'agentes-ia': { icon: Bot, label: 'Agentes de IA' },
    'octo-chat': { icon: MessageCircle, label: 'Octo Chat' },
    'integracoes': { icon: Plug, label: 'Integrações' },
    'central-leads': { icon: UsersRound, label: 'Central Leads' },
    'relatorios': { icon: BarChart3, label: 'Relatórios' },
    'configuracoes': { icon: Settings, label: 'Configurações' }
  };

  // Mapeamento de abas internas para cada área (nível 2 - dentro do conteúdo)
  const internalTabs: Record<string, { id: string; label: string; icon: React.ElementType }[]> = {
    // Quando está em Métricas > Cliente Interessado
    'metricas-cliente-interessado': [
      { id: 'geral', label: 'Visão Geral', icon: BarChart3 },
      { id: 'pre-atendimento', label: 'Pré-Atendimento', icon: Headphones },
      { id: 'atendimento', label: 'Atendimento', icon: Phone }
    ],
    // Quando está em Métricas > Cliente Proprietário
    'metricas-cliente-proprietario': [
      { id: 'cliente-proprietario', label: 'Visão Geral', icon: Building2 },
      { id: 'estudo-mercado', label: 'Estudo de Mercado', icon: TrendingUp }
    ],
    // Quando está em Métricas > Meus Leads (sem abas internas)
    'metricas-meus-leads': [],
    // Quando está em Métricas > Bolsão (sem abas internas)
    'metricas-bolsao': [],
    // Quando está em Métricas > Proposta (sem abas internas)
    'metricas-proposta': [],
    // Agentes IA
    'agentes-ia': [
      { id: 'agente-marketing', label: 'Marketing', icon: Bot },
      { id: 'agente-comportamental', label: 'Comportamental', icon: Headphones }
    ],
    // Gestão de Equipe
    'gestao-equipe': [
      { id: 'tarefas', label: 'Tarefas', icon: ClipboardList },
      { id: 'okrs', label: 'OKRs', icon: Target },
      { id: 'pdi', label: 'PDI', icon: GraduationCap },
      { id: 'equipes', label: 'Equipes', icon: Users },
      { id: 'acessos-permissoes', label: 'Acessos e Permissões', icon: Key }
    ],
    // Recrutamento
    'recrutamento': []
  };

  // Função para obter as abas internas baseado na seção e subseção atual
  const getInternalTabs = () => {
    if (activeSection === 'metricas') {
      const key = `metricas-${activeMetricasSubSection}`;
      return internalTabs[key] || [];
    }
    if (activeSection === 'agentes-ia') {
      return internalTabs['agentes-ia'] || [];
    }
    if (activeSection === 'recrutamento') {
      return internalTabs['recrutamento'] || [];
    }
    if (activeSection === 'gestao-equipe') {
      const tabs = internalTabs['gestao-equipe'] || [];
      // Filtrar aba "Acessos e Permissões" para corretores - apenas admin pode ver
      if (isCorretor) {
        return tabs.filter(tab => tab.id !== 'acessos-permissoes');
      }
      return tabs;
    }
    return [];
  };

  // Função para obter a aba interna ativa
  const getActiveInternalTab = () => {
    if (activeSection === 'metricas') {
      if (activeMetricasSubSection === 'cliente-interessado') {
        return activeClienteInteressadoSubSection;
      }
      if (activeMetricasSubSection === 'cliente-proprietario') {
        return activeClienteProprietarioSubSection;
      }
    }
    if (activeSection === 'agentes-ia') {
      return activeAgentesIaSubSection;
    }
    if (activeSection === 'estudo-mercado') {
      return activeEstudoMercadoSubSection;
    }
    if (activeSection === 'gestao-equipe') {
      return activeGestaoEquipeSubSection;
    }
    if (activeSection === 'recrutamento') {
      return activeRecrutamentoSubSection;
    }
    return null;
  };

  // Função para mudar a aba interna - navega para a rota correta
  const handleInternalTabChange = (tabId: string) => {
    if (activeSection === 'metricas') {
      if (activeMetricasSubSection === 'cliente-interessado') {
        // Atualizar estado local
        setActiveClienteInteressadoSubSection(tabId as ClienteInteressadoSubSection);
        localStorage.setItem('selectedClienteInteressadoSubSection', tabId);
        // Navegar para a rota correta dentro de métricas
        navigate(`/metricas/cliente-interessado/${tabId}`);
      } else if (activeMetricasSubSection === 'cliente-proprietario') {
        // Atualizar estado local
        setActiveClienteProprietarioSubSection(tabId as ClienteProprietarioSubSection);
        localStorage.setItem('selectedClienteProprietarioSubSection', tabId);
        // Navegar para a rota correta dentro de métricas
        navigate(`/metricas/cliente-proprietario/${tabId}`);
      }
    } else if (activeSection === 'agentes-ia') {
      handleAgentesIaSubSectionChange(tabId as AgentesIaSubSection);
    } else if (activeSection === 'estudo-mercado') {
      handleEstudoMercadoSubSectionChange(tabId as EstudoMercadoSubSection);
    } else if (activeSection === 'gestao-equipe') {
      // Atualizar estado local
      setActiveGestaoEquipeSubSection(tabId as GestaoEquipeSubSection);
      localStorage.setItem('selectedGestaoEquipeSubSection', tabId);
      // Navegar para a rota com query param para a aba
      navigate(`/gestao-equipe?tab=${tabId}`);
    } else if (activeSection === 'recrutamento') {
      // Atualizar estado local
      setActiveRecrutamentoSubSection(tabId as RecrutamentoSubSection);
      localStorage.setItem('selectedRecrutamentoSubSection', tabId);
      // Navegar para a rota com query param para a aba
      navigate(`/recrutamento?tab=${tabId}`);
    }
  };

  // Sincronizar rotas com sidebar
  const { navigateToSection } = useRouteSync({
    onSectionChange: setActiveSection,
    onMetricasSubSectionChange: setActiveMetricasSubSection,
    onClienteInteressadoSubSectionChange: setActiveClienteInteressadoSubSection,
    onClienteProprietarioSubSectionChange: setActiveClienteProprietarioSubSection,
    onAgentesIaSubSectionChange: setActiveAgentesIaSubSection,
    onEstudoMercadoSubSectionChange: setActiveEstudoMercadoSubSection
  });

  // Handler para mudança de seção - agora usa navegação por rota
  const handleSectionChange = (section: SidebarSection) => {
    setActiveSection(section);
    localStorage.setItem('selectedSection', section);
    navigateToSection(section);
  };

  // Handler para mudança de subsection - Métricas
  const handleMetricasSubSectionChange = (subsection: MetricasSubSection) => {
    setActiveMetricasSubSection(subsection);
    localStorage.setItem('selectedMetricasSubSection', subsection);
    navigateToSection('metricas', subsection);
  };

  // Handler para mudança de subsection - Cliente Interessado
  const handleClienteInteressadoSubSectionChange = (subsection: ClienteInteressadoSubSection) => {
    setActiveClienteInteressadoSubSection(subsection);
    localStorage.setItem('selectedClienteInteressadoSubSection', subsection);
    // Navega para métricas/cliente-interessado/{subsection}
    navigate(`/metricas/cliente-interessado/${subsection}`);
  };

  // Handler para mudança de subsection - Cliente Proprietário
  const handleClienteProprietarioSubSectionChange = (subsection: ClienteProprietarioSubSection) => {
    setActiveClienteProprietarioSubSection(subsection);
    localStorage.setItem('selectedClienteProprietarioSubSection', subsection);
    // Navega para métricas/cliente-proprietario/{subsection}
    navigate(`/metricas/cliente-proprietario/${subsection}`);
  };

  // Handler para mudança de subsection - Agentes IA
  const handleAgentesIaSubSectionChange = (subsection: AgentesIaSubSection) => {
    setActiveAgentesIaSubSection(subsection);
    localStorage.setItem('selectedAgentesIaSubSection', subsection);
    navigateToSection('agentes-ia', subsection);
  };

  // Handler para mudança de subsection - Estudo de Mercado
  const handleEstudoMercadoSubSectionChange = (subsection: EstudoMercadoSubSection) => {
    setActiveEstudoMercadoSubSection(subsection);
    localStorage.setItem('selectedEstudoMercadoSubSection', subsection);
    navigateToSection('estudo-mercado', subsection);
  };

  // Sincronizar estado de Gestão de Equipe e Recrutamento com query params da URL
  const [searchParams] = useSearchParams();
  const location = useLocation();
  
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    
    if (location.pathname === '/gestao-equipe') {
      if (tabParam === 'metricas') {
        setActiveGestaoEquipeSubSection('tarefas');
        localStorage.setItem('selectedGestaoEquipeSubSection', 'tarefas');
        navigate('/gestao-equipe?tab=tarefas');
      } else if (tabParam && ['tarefas', 'okrs', 'pdi', 'acessos-permissoes', 'equipes'].includes(tabParam)) {
        setActiveGestaoEquipeSubSection(tabParam as GestaoEquipeSubSection);
        localStorage.setItem('selectedGestaoEquipeSubSection', tabParam);
      }
    }
    
    if (location.pathname === '/recrutamento') {
      if (tabParam && ['candidatos', 'metricas'].includes(tabParam)) {
        setActiveRecrutamentoSubSection(tabParam as RecrutamentoSubSection);
        localStorage.setItem('selectedRecrutamentoSubSection', tabParam);
      }
    }
  }, [location.pathname, searchParams]);

  return (
    <div className="min-h-screen flex flex-col overflow-clip max-w-full bg-gray-50">
      {/* Barra Preta Superior - Toda a largura */}
      <div 
        className="fixed top-0 left-0 right-0 h-12 border-b z-[60] flex items-center px-4 gap-4"
        style={{ 
          backgroundColor: isLightTheme ? '#ffffff' : '#000000', 
          borderBottomColor: isLightTheme ? '#e5e7eb' : '#333333',
          background: isLightTheme ? '#ffffff' : '#000000'
        }}
      >
        {/* Logo Octo - Canto Esquerdo */}
        <div 
          className="flex items-center gap-2 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => {
            navigate('/');
            setActiveSection('leads');
          }}
          title="Ir para o início"
        >
          <img 
            src="https://i.ibb.co/tTQwnPKF/Octo-Dash-Logo-removebg-preview.png"
            alt="OctoDash"
            className="w-8 h-8 object-contain"
          />
        </div>
        
        {/* Espaço para a sidebar (ajustável) */}
        <div 
          ref={topBarSpacerRef}
          className="flex-shrink-0" 
          style={{ width: `${sidebarWidth - 28}px` }}
        ></div>
        
        {/* Barra de Busca - Centralizada */}
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="relative flex items-center">
            <div className="absolute left-3 flex items-center">
              <Search className={`h-4 w-4 ${isLightTheme ? 'text-gray-500' : 'text-gray-400'}`} />
            </div>
            <input
              type="text"
              placeholder="Pesquisar"
              className={`w-full h-9 pl-10 pr-4 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isLightTheme ? 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500' : 'bg-gray-800 border border-gray-700 text-white placeholder-gray-400'}`}
            />
          </div>
        </div>
        
        {/* Menu Direita */}
        <div className="flex items-center gap-2 ml-auto">
          <div className={`h-6 w-px ${isLightTheme ? 'bg-gray-300' : 'bg-gray-700'}`}></div>
          <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm ${isLightTheme ? 'text-gray-700 hover:text-gray-900 hover:bg-gray-100' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}>
            <Plus className="h-4 w-4" />
            <span>Novo</span>
          </button>
          <button className={`p-2 rounded-lg transition-colors ${isLightTheme ? 'text-gray-700 hover:text-gray-900 hover:bg-gray-100' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}>
            <Grid3x3 className="h-4 w-4" />
          </button>
          
          {/* Ícone de Perfil com Dropdown */}
          <div className="relative" ref={profileButtonRef}>
            <button 
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className={`flex items-center gap-1 cursor-pointer group ml-1 p-1 rounded-lg transition-colors ${isLightTheme ? 'hover:bg-gray-100' : 'hover:bg-gray-800'}`}
            >
              <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm group-hover:ring-2 group-hover:ring-green-400/50 transition-all">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <ChevronDown className={`h-3.5 w-3.5 transition-all ${isLightTheme ? 'text-gray-500 group-hover:text-gray-900' : 'text-gray-400 group-hover:text-white'} ${profileDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Dropdown Menu - Fora do container para evitar overflow issues */}
      {profileDropdownOpen && (
        <div 
          ref={profileMenuRef}
          className="fixed top-14 right-4 w-72 rounded-xl shadow-2xl border py-2 z-[9999]"
          style={{
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)'
          }}
        >
          {/* Header do Usuário */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {user?.name || 'Usuário'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {/* Role do usuário */}
                  {isOwner || user?.systemRole === 'admin' || user?.systemRole === 'owner' || user?.role === 'gestao' ? 'Administrador' : user?.systemRole === 'team_leader' ? 'Líder de Equipe' : 'Corretor'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Menu Items - Grupo 1 */}
          <div className="py-1">
            <button
              className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <User className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <span>Meu Perfil</span>
            </button>
            <button
              className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <Bell className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <span>Notificações</span>
              <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full flex-shrink-0">3</span>
            </button>
            <button
              onClick={() => setThemeSubmenuOpen((prev) => !prev)}
              className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
              type="button"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <Palette className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <span>Tema</span>
              <ChevronDown
                className={`h-4 w-4 ml-auto flex-shrink-0 transition-transform ${themeSubmenuOpen ? 'rotate-180' : ''}`}
                style={{ color: 'var(--text-secondary)' }}
              />
            </button>

            {themeSubmenuOpen && (
              <div
                className="mt-1 mx-2 rounded-lg border p-1"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    changeTheme('branco');
                    setThemeSubmenuOpen(false);
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm rounded-md flex items-center gap-2 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <span className="w-4 h-4 flex items-center justify-center">
                    {currentTheme === 'branco' ? <Check className="h-4 w-4 text-blue-600" /> : null}
                  </span>
                  <span>Claro</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    changeTheme('cinza');
                    setThemeSubmenuOpen(false);
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm rounded-md flex items-center gap-2 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <span className="w-4 h-4 flex items-center justify-center">
                    {currentTheme === 'cinza' ? <Check className="h-4 w-4 text-blue-600" /> : null}
                  </span>
                  <span>Escuro</span>
                </button>
              </div>
            )}
          </div>
          
          {/* Separador */}
          <div className="border-t my-1" style={{ borderColor: 'var(--border)' }}></div>
          
          {/* Menu Items - Grupo 2 */}
          <div className="py-1">
            <button 
              onClick={() => {
                setProfileDropdownOpen(false);
                handleSectionChange('configuracoes' as SidebarSection);
              }}
              className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <Settings className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <span>Configurações</span>
            </button>
            <button
              className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <HelpCircle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <span>Ajuda & Suporte</span>
            </button>
          </div>
          
          {/* Separador */}
          <div className="border-t my-1" style={{ borderColor: 'var(--border)' }}></div>
          
          {/* Sair */}
          <div className="py-1">
            <button 
              onClick={() => {
                setProfileDropdownOpen(false);
                setIsLogoutModalOpen(true);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-red-600 flex items-center gap-3 transition-colors"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Modal de confirmação de logout */}
      <LogoutConfirmModal 
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
      />
      
      {/* Header Superior - Workspace - Estilo Gmail */}
      {activeSection !== 'leads' && (
        <header className="fixed top-12 left-0 right-0 h-12 border-b border-gray-200 z-50 flex items-center px-4" style={{ backgroundColor: '#f5f5f5' }}>
          {/* Espaço para a sidebar (ajustável) */}
          <div 
            ref={headerSpacerRef}
            className="flex-shrink-0" 
            style={{ width: `${sidebarWidth}px` }}
          ></div>
          
          {/* Ícone e nome da seção atual + Abas internas */}
          <div 
            className="flex items-center h-full gap-6"
            style={{ backgroundColor: 'transparent' }}
          >
            {(() => {
              const config = sectionConfig[activeSection] || sectionConfig['leads'];
              const IconComponent = config.icon;
              const tabs = getInternalTabs();
              const activeTab = getActiveInternalTab();
              
              return (
                <>
                  {/* Nome da seção principal com ícone - mais escuro */}
                  <div 
                    className="flex items-center gap-2 h-full relative"
                    style={{ backgroundColor: 'transparent' }}
                  >
                    <IconComponent 
                      className="h-4 w-4 text-[#202124]"
                      style={{ backgroundColor: 'transparent', background: 'transparent' }}
                    />
                    <span className="text-sm text-[#202124] font-medium">{config.label}</span>
                  </div>
                  
                  {/* Se tem abas internas, mostra separador e abas */}
                  {tabs.length > 0 && (
                    <>
                      <span className="text-gray-300">|</span>
                      <div className="flex items-center h-full">
                        {tabs.map((tab) => {
                          const TabIcon = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => handleInternalTabChange(tab.id)}
                              className={`relative flex items-center gap-2 px-4 h-full text-sm transition-all ${
                                isActive 
                                  ? 'text-[#1a73e8] font-medium' 
                                  : 'text-[#5f6368] font-normal hover:text-[#202124] hover:bg-gray-100'
                              }`}
                              style={{ 
                                backgroundColor: isActive ? '#f5f5f5' : 'transparent',
                                background: isActive ? '#f5f5f5' : 'transparent'
                              }}
                            >
                              <TabIcon 
                                className={`h-4 w-4 ${isActive ? 'text-[#1a73e8]' : 'text-[#5f6368]'}`}
                                style={{ 
                                  backgroundColor: 'transparent', 
                                  background: 'transparent',
                                  backgroundImage: 'none'
                                }}
                              />
                              {tab.label}
                              {/* Sublinhado ativo estilo Gmail */}
                              {isActive && (
                                <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1a73e8] rounded-t-full"></span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
          
          {/* Ícone de Calendário à direita */}
          <div className="ml-auto">
            <Calendar 
              className="h-5 w-5 text-[#5f6368] cursor-pointer hover:text-[#202124] transition-colors"
              style={{ backgroundColor: 'transparent', background: 'transparent' }}
            />
          </div>
        </header>
      )}

      <div className={`flex flex-1 overflow-clip ${activeSection === 'leads' ? 'pt-[48px]' : 'pt-[96px]'}`}>
        {/* Sidebar Fixa - 80px + Secundária (240px quando aberta) */}
        <FixedSidebar
          key={`${user?.tenantId}-${user?.tenantAllowedFeatures?.length || 0}`}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          onSecondarySidebarChange={handleSidebarChange}
          activeMetricasSubSection={activeMetricasSubSection}
          onMetricasSubSectionChange={handleMetricasSubSectionChange}
          activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
          onClienteInteressadoSubSectionChange={handleClienteInteressadoSubSectionChange}
          activeClienteProprietarioSubSection={activeClienteProprietarioSubSection}
          onClienteProprietarioSubSectionChange={handleClienteProprietarioSubSectionChange}
          activeCorretoresSubSection={activeCorretoresSubSection}
          onCorretoresSubSectionChange={setActiveCorretoresSubSection}
          activeAgentesIaSubSection={activeAgentesIaSubSection}
          onAgentesIaSubSectionChange={handleAgentesIaSubSectionChange}
          activeEstudoMercadoSubSection={activeEstudoMercadoSubSection}
          onEstudoMercadoSubSectionChange={handleEstudoMercadoSubSectionChange}
          propTenantId={user?.tenantId}
          propTenantAllowedFeatures={user?.tenantAllowedFeatures}
        />
        
        {/* Conteúdo principal - Margem ajustável com espaçamento */}
        <main 
          ref={mainRef}
          className="flex-1 overflow-hidden min-w-0"
          style={{ 
            marginLeft: `${sidebarWidth + 16}px`
          }}
        >
          <div className="w-full h-full overflow-y-auto overflow-x-hidden">
            {/* Renderiza children (Routes) ou Outlet do React Router */}
            {children ? children : <Outlet context={{ leads, onRefresh, isRefreshing }} />}
          </div>
        </main>
      </div>
    </div>
  );
};

