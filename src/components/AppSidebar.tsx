/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 * 
 * 🎯 SISTEMA DE AUTO-HIDE INTELIGENTE DA SIDEBAR:
 * 
 * COMPORTAMENTO:
 * - 🖱️ Hover: Ao passar o mouse na lateral, a sidebar expande automaticamente
 * - 📤 Auto-hide: Ao tirar o mouse, a sidebar recolhe automaticamente
 * - 🔒 Modo Manual: Clicar no botão de toggle desativa auto-hide por 1 minuto
 * - 🔄 Reset: Mudar de aba ou aguardar 1 minuto restaura o modo auto-hide
 * - ⚡ Sincronizado: Ao expandir/recolher automaticamente, notifica o layout principal
 * 
 * ESTADOS:
 * - isAutoHideEnabled: Controla se o modo auto-hide está ativo
 * - isHovering: Detecta quando o mouse está sobre a sidebar
 * - manualModeTimeout: Timer de 1 minuto para voltar ao auto-hide
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@/hooks/useAuth";
import { Button } from '@/components/ui/button';
import { SessionInfo } from '@/components/SessionInfo';
import { LogoutConfirmModal } from '@/components/LogoutConfirmModal';
import { 
  Building2, 
  User, 
  Home, 
  LogOut,
  Menu,
  X,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Users,
  UserCheck,
  TrendingUp,
  ShoppingCart,
  Key,
  ClipboardList,
  Headphones,
  UserCircle,
  LineChart,
  Settings,
  Bot,
  Inbox,
  MessageCircle,
  Plug
} from 'lucide-react';

export type SidebarSection = 'leads' | 'meus-leads' | 'cliente-interessado' | 'cliente-proprietario' | 'corretores' | 'imoveis' | 'agentes-ia' | 'integracoes' | 'configuracoes';
export type ClienteInteressadoSubSection = 'geral' | 'pre-atendimento' | 'bolsao' | 'atendimento';
export type ClienteProprietarioSubSection = 'cliente-proprietario' | 'estudo-mercado';
export type CorretoresSubSection = 'meus-leads' | 'bolsao-imoveis' | 'estudo-mercado';
export type AgentesIaSubSection = 'caio-kotler' | 'elaine';

interface AppSidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  onCollapseChange?: (collapsed: boolean) => void;
  // Props para sub-navegação de Cliente Interessado
  activeClienteInteressadoSubSection?: ClienteInteressadoSubSection;
  onClienteInteressadoSubSectionChange?: (section: ClienteInteressadoSubSection) => void;
  // Props para sub-navegação de Cliente Proprietário
  activeClienteProprietarioSubSection?: ClienteProprietarioSubSection;
  onClienteProprietarioSubSectionChange?: (section: ClienteProprietarioSubSection) => void;
  // Props para sub-navegação de Corretores
  activeCorretoresSubSection?: CorretoresSubSection;
  onCorretoresSubSectionChange?: (section: CorretoresSubSection) => void;
  // Props para sub-navegação de Agentes de IA
  activeAgentesIaSubSection?: AgentesIaSubSection;
  onAgentesIaSubSectionChange?: (section: AgentesIaSubSection) => void;
}

export const AppSidebar = ({ 
  activeSection, 
  onSectionChange, 
  onCollapseChange,
  activeClienteInteressadoSubSection = 'geral',
  onClienteInteressadoSubSectionChange,
  activeClienteProprietarioSubSection = 'cliente-proprietario',
  onClienteProprietarioSubSectionChange,
  activeCorretoresSubSection = 'meus-leads',
  onCorretoresSubSectionChange,
  activeAgentesIaSubSection = 'caio-kotler',
  onAgentesIaSubSectionChange
}: AppSidebarProps) => {
  const navigate = useNavigate();
  const { user, isGestao, isCorretor } = useAuth();
  // 🆕 Sidebar COLAPSADA por padrão (fina)
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  
  // 🎯 Detectar hover para expandir/recolher automaticamente
  const [isHovering, setIsHovering] = useState(false);
  
  // 🆕 Estados para Sidebar Secundária (ClickUp Style)
  const [secondarySidebarOpen, setSecondarySidebarOpen] = useState(false);
  const [activeParentSection, setActiveParentSection] = useState<SidebarSection | null>(null);
  
  // Estados para controlar expansão das sub-abas COM TOGGLE (DEPRECATED - Mantidos para compatibilidade)
  const [isClienteInteressadoExpanded, setIsClienteInteressadoExpanded] = useState(true);
  const [isClienteProprietarioExpanded, setIsClienteProprietarioExpanded] = useState(false);
  const [isAgentesIaExpanded, setIsAgentesIaExpanded] = useState(false);
  
  // Auto-expandir quando ativo
  useEffect(() => {
    if (activeSection === 'cliente-interessado') {
      setIsClienteInteressadoExpanded(true);
    } else if (activeSection === 'cliente-proprietario') {
      setIsClienteProprietarioExpanded(true);
    } else if (activeSection === 'agentes-ia') {
      setIsAgentesIaExpanded(true);
    }
  }, [activeSection]);

  // 🔄 Ao mudar de aba, recolher a sidebar
  useEffect(() => {
    if (!isHovering) {
      setIsCollapsed(true);
    }
  }, [activeSection, isHovering]);

  // 🎯 CONTROLE DE HOVER - Expandir ao fazer hover sobre a sidebar
  useEffect(() => {
    if (isHovering && isCollapsed) {
      setIsCollapsed(false); // Expandir quando hover
      onCollapseChange?.(false); // Notificar expansão
    } else if (!isHovering && !isCollapsed) {
      // Apenas recolher se não estiver em hover
      // Aguardar 300ms para evitar flickering
      const timer = setTimeout(() => {
        if (!isHovering) {
          setIsCollapsed(true); // Recolher quando mouse sai
          onCollapseChange?.(true); // Notificar recolhimento
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isHovering, isCollapsed, onCollapseChange]);

  // Notificar mudança de estado do collapse
  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapseChange?.(newCollapsed);
    
  };

  // 🧹 CLEANUP do timeout quando componente desmonta
  useEffect(() => {
    return () => {
      // manualModeTimeout foi removido, então não há mais timeout para limpar
    };
  }, []);

  const menuItems = [
    // Início
    {
      id: 'leads' as SidebarSection,
      label: 'Início',
      icon: Home,
      description: 'Página inicial',
      hasSubMenu: false
    },
    // Meus Leads
    {
      id: 'meus-leads' as SidebarSection,
      label: 'Meus Leads',
      icon: Inbox,
      description: 'Meus leads atribuídos',
      hasSubMenu: false
    },
    // Cliente Interessado
    {
      id: 'cliente-interessado' as SidebarSection,
      label: 'Cliente Interessado',
      icon: Users,
      description: 'Gestão de clientes interessados',
      hasSubMenu: true
    },
    // Cliente Proprietário
    {
      id: 'cliente-proprietario' as SidebarSection,
      label: 'Cliente Proprietário',
      icon: Building2,
      description: 'Gestão de proprietários',
      hasSubMenu: true
    },
    // Imóveis
    {
      id: 'imoveis' as SidebarSection,
      label: 'Imóveis',
      icon: Building2,
      description: 'Gestão de imóveis',
      hasSubMenu: false
    },
    // Agentes de IA
    {
      id: 'agentes-ia' as SidebarSection,
      label: 'Agentes de IA',
      icon: Bot,
      description: 'Agentes inteligentes e automações',
      hasSubMenu: true
    },
    // Integrações
    {
      id: 'integracoes' as SidebarSection,
      label: 'Integrações',
      icon: Plug,
      description: 'Conectar fontes de leads',
      hasSubMenu: false
    }
  ];

  const handleSectionClick = (sectionId: SidebarSection) => {
    // 🆕 Para seções com submenu, abrir sidebar secundária (ClickUp Style)
    const sectionWithSubMenu = menuItems.find(item => item.id === sectionId && item.hasSubMenu);
    
    if (sectionWithSubMenu) {
      // Se clicar na mesma seção, toggle da sidebar secundária
      if (activeParentSection === sectionId && secondarySidebarOpen) {
        setSecondarySidebarOpen(false);
        setActiveParentSection(null);
      } else {
        // Abrir sidebar secundária com a seção clicada
        setActiveParentSection(sectionId);
        setSecondarySidebarOpen(true);
        
        // Selecionar primeira subseção automaticamente
        if (sectionId === 'cliente-interessado' && onClienteInteressadoSubSectionChange) {
          onClienteInteressadoSubSectionChange('geral');
        } else if (sectionId === 'cliente-proprietario' && onClienteProprietarioSubSectionChange) {
          onClienteProprietarioSubSectionChange('cliente-proprietario');
        } else if (sectionId === 'agentes-ia' && onAgentesIaSubSectionChange) {
          onAgentesIaSubSectionChange('caio-kotler');
        }
      }
    } else {
      // Para seções sem submenu, fechar sidebar secundária
      setSecondarySidebarOpen(false);
      setActiveParentSection(null);
    }
    
    onSectionChange(sectionId);
    setIsMobileOpen(false); // Fechar no mobile após seleção
  };
  
  // Handler para cliques nas subseções
  const handleSubSectionClick = (subSection: string) => {
    if (activeParentSection === 'cliente-interessado' && onClienteInteressadoSubSectionChange) {
      onClienteInteressadoSubSectionChange(subSection as ClienteInteressadoSubSection);
    } else if (activeParentSection === 'cliente-proprietario' && onClienteProprietarioSubSectionChange) {
      onClienteProprietarioSubSectionChange(subSection as ClienteProprietarioSubSection);
    } else if (activeParentSection === 'agentes-ia' && onAgentesIaSubSectionChange) {
      onAgentesIaSubSectionChange(subSection as AgentesIaSubSection);
    }
  };

  // Mapeamento de subseções
  const subSectionsMap: Record<string, { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[]> = {
    'cliente-interessado': [
      { id: 'geral', label: 'Geral', icon: BarChart3 },
      { id: 'pre-atendimento', label: 'Pré-Atendimento', icon: ClipboardList },
      { id: 'bolsao', label: 'Bolsão', icon: Inbox },
      { id: 'atendimento', label: 'Atendimento', icon: Headphones }
    ],
    'cliente-proprietario': [
      { id: 'cliente-proprietario', label: 'Cliente Proprietário', icon: Building2 },
      { id: 'estudo-mercado', label: 'Estudo de Mercado', icon: TrendingUp }
    ],
    'agentes-ia': [
      { id: 'agente-marketing', label: 'Marketing', icon: Bot },
      { id: 'agente-comportamental', label: 'Comportamental', icon: Headphones }
    ]
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-40 sidebar-mobile-backdrop animate-in fade-in duration-300"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="bg-neutral-800/80 border-gray-600 text-text-primary hover:bg-neutral-700/80"
        >
          {isMobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar - Design ClickUp Style - Colada na lateral */}
      <div 
        className={`
          app-sidebar-main fixed left-0 top-0 h-full
          transition-all duration-300 ease-in-out z-40 flex flex-col overflow-hidden
          ${isCollapsed ? 'w-16' : 'w-[240px]'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        onMouseEnter={() => {
          setIsHovering(true);
        }}
        onMouseLeave={() => {
          setIsHovering(false);
        }}
      >
        
        {/* Header com Logo/Título - Design ClickUp Style */}
        <div 
          className={`transition-all duration-300 ${isCollapsed ? 'p-3' : 'px-4 py-4'} border-b border-gray-200`}
        >
          {/* Layout quando sidebar está aberta */}
          {!isCollapsed && (
            <div className="flex items-center justify-between">
              <div 
                className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  navigate('/');
                  onSectionChange('leads');
                }}
                title="Ir para o início"
              >
                {/* Logo */}
                <div className="w-9 h-9 flex items-center justify-center">
                  <img 
                    src="https://i.ibb.co/tTQwnPKF/Octo-Dash-Logo-removebg-preview.png"
                    alt="OctoDash Logo"
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div>
                  <span className="font-semibold text-base" style={{ color: '#111827' }}>OctoDash</span>
                </div>
              </div>
              
              {/* Collapse button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapse}
                className="hidden md:flex h-7 w-7 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all duration-200 rounded"
                title="Recolher sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* Layout quando sidebar está colapsada */}
          {isCollapsed && (
            <div className="flex items-center justify-center w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapse}
                className="hidden md:flex h-9 w-9 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all duration-200 rounded"
                title="Expandir sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Navigation - ClickUp Style */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'p-2' : 'px-2 py-3'} sidebar-nav-scroll`}>
          {/* Navegação Principal - Design Clean */}
          <div className="space-y-0.5">
            {menuItems.map((item, index) => (
              <div 
                key={item.id} 
                style={index > 0 ? { borderTop: '1px solid #f3f4f6', marginTop: '4px', paddingTop: '4px' } : {}}
              >
                <Button
                  variant="ghost"
                  onClick={() => handleSectionClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`
                    w-full transition-all duration-200 rounded-md relative group
                    ${isCollapsed 
                      ? 'h-10 w-10 p-0 justify-center mx-auto' 
                      : 'h-9 px-3 py-2 justify-start text-left'
                    }
                  `}
                  style={{
                    backgroundColor: activeSection === item.id ? '#eff6ff' : 'transparent',
                    color: activeSection === item.id ? '#2563eb' : '#4b5563'
                  }}
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} w-full`}>
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                      <item.icon 
                        className="h-[18px] w-[18px] flex-shrink-0"
                        style={{ color: activeSection === item.id ? '#2563eb' : '#6b7280' }}
                      />
                      {!isCollapsed && (
                        <span className="font-medium text-[13px] truncate">{item.label}</span>
                      )}
                    </div>
                    
                    {/* Indicador para seções com sub-menus */}
                    {!isCollapsed && item.hasSubMenu && (
                      <ChevronRight 
                        className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ml-auto ${
                          activeParentSection === item.id && secondarySidebarOpen ? 'rotate-90' : ''
                        }`}
                        style={{ color: '#9ca3af' }}
                      />
                    )}
                  </div>
                  
                  {/* Tooltip quando recolhido */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </Button>
                
                {/* Subseções */}
                {!isCollapsed && item.hasSubMenu && activeParentSection === item.id && secondarySidebarOpen && (
                  <div 
                    className="ml-6 mt-1 space-y-0.5 pl-3 py-1"
                    style={{ borderLeft: '1px solid #e5e7eb' }}
                  >
                    {subSectionsMap[item.id]?.map((subSection) => {
                      const SubIcon = subSection.icon;
                      const isActive = 
                        (item.id === 'cliente-interessado' && activeClienteInteressadoSubSection === subSection.id) ||
                        (item.id === 'cliente-proprietario' && activeClienteProprietarioSubSection === subSection.id) ||
                        (item.id === 'agentes-ia' && activeAgentesIaSubSection === subSection.id);
                      
                      return (
                        <button
                          key={subSection.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSubSectionClick(subSection.id);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs font-medium transition-all duration-150"
                          style={{
                            backgroundColor: isActive ? '#eff6ff' : 'transparent',
                            color: isActive ? '#2563eb' : '#6b7280'
                          }}
                        >
                          <SubIcon 
                            className="h-3.5 w-3.5 flex-shrink-0"
                            style={{ color: isActive ? '#2563eb' : '#9ca3af' }}
                          />
                          <span className="truncate">{subSection.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>

        {/* Footer - Configurações & User info */}
        <div 
          className={`transition-all duration-300 ${isCollapsed ? 'p-2' : 'px-2 py-3'} border-t border-gray-200`}
        >
          {/* Botão de Configurações */}
          <Button
            variant="ghost"
            onClick={() => handleSectionClick('configuracoes')}
            title={isCollapsed ? 'Configurações' : undefined}
            className={`
              w-full transition-all duration-200 rounded-md relative group mb-2
              ${isCollapsed 
                ? 'h-10 w-10 p-0 justify-center mx-auto' 
                : 'h-9 px-3 py-2 justify-start text-left'
              }
            `}
            style={{
              backgroundColor: activeSection === 'configuracoes' ? '#eff6ff' : 'transparent',
              color: activeSection === 'configuracoes' ? '#2563eb' : '#4b5563'
            }}
          >
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full`}>
              <Settings 
                className="h-[18px] w-[18px] flex-shrink-0"
                style={{ color: activeSection === 'configuracoes' ? '#2563eb' : '#6b7280' }}
              />
              {!isCollapsed && (
                <span className="font-medium text-[13px] truncate">Configurações</span>
              )}
            </div>
            
            {/* Tooltip */}
            {isCollapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                Configurações
              </div>
            )}
          </Button>
          
          {/* Separador */}
          <div className="h-px bg-gray-200 my-2" />
          
          {/* Informações do usuário */}
          {!isCollapsed && user && (
            <div className="px-1 py-1">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => handleSectionClick('configuracoes')}
                  className="flex items-center gap-2 flex-1 min-w-0 hover:bg-gray-100 rounded-md px-2 py-1.5 transition-all duration-200 group cursor-pointer"
                >
                  <div 
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: '#22c55e' }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: '#4b5563' }}>
                      {user.systemRole === 'admin' || user.systemRole === 'owner' || user.role === 'gestao' ? 'Admin' : user.systemRole === 'team_leader' ? 'Líder' : 'Corretor'}
                    </p>
                  </div>
                </button>
                
                {/* Botão Sair */}
                <Button
                  variant="ghost"
                  onClick={() => setIsLogoutModalOpen(true)}
                  className="h-7 w-7 p-0 hover:bg-red-50 rounded transition-all duration-200 flex-shrink-0"
                  style={{ color: '#9ca3af' }}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          
          {/* Quando colapsado */}
          {isCollapsed && user && (
            <div className="space-y-1 flex flex-col items-center">
              <button
                onClick={() => handleSectionClick('configuracoes')}
                className="flex justify-center group relative w-10 h-10 hover:bg-gray-100 rounded-md transition-all duration-200"
              >
                <div 
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold m-auto"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                {/* Tooltip */}
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                  {user.systemRole === 'admin' || user.systemRole === 'owner' || user.role === 'gestao' ? 'Administrador' : user.systemRole === 'team_leader' ? 'Líder de Equipe' : 'Corretor'}
                </div>
              </button>
              
              <Button
                variant="ghost"
                onClick={() => setIsLogoutModalOpen(true)}
                title="Sair"
                className="h-10 w-10 p-0 hover:bg-red-50 rounded-md transition-all duration-200 group relative"
                style={{ color: '#9ca3af' }}
              >
                <LogOut className="h-4 w-4" />
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                  Sair
                </div>
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal de confirmação de logout */}
      <LogoutConfirmModal 
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
      />
    </>
  );
};
