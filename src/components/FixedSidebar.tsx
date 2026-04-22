/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 * 
 * 🎯 SIDEBAR FIXA - Nova barra lateral que permanece sempre visível
 * 
 * COMPORTAMENTO:
 * - Sempre visível (não recolhe)
 * - Largura fixa de 260px
 * - Design moderno e limpo
 * - Responsivo (recolhe apenas no mobile)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuthContext } from "@/contexts/AuthContext";
import { SidebarPermission, ADMIN_SIDEBAR_PERMISSIONS } from '@/types/permissions';
import { supabase } from '@/integrations/supabase/client';
import { verificarTestesCompletos } from '@/features/corretores/services/testesComportamentaisService';
import { buscarCorretorPorEmail } from '@/features/corretores/services/buscarCorretorPorEmailService';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/contexts/NotificationsContext';
import { 
  Building2, 
  Home, 
  Menu,
  X,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Users,
  UsersRound,
  UserCheck,
  ClipboardList,
  Headphones,
  Bot,
  Inbox,
  Camera,
  Pencil,
  MessageCircle,
  Plug,
  TrendingUp,
  Bell,
  FileText
} from 'lucide-react';

// Interface para configurações da imobiliária
interface CompanyConfig {
  name: string;
  logo: string | null; // URL da imagem ou null para usar inicial
  initial: string;
  color: string;
}

export type SidebarSection = 'leads' | 'notificacoes' | 'meus-leads' | 'metricas' | 'estudo-mercado' | 'recrutamento' | 'gestao-equipe' | 'bolsao' | 'imoveis' | 'agentes-ia' | 'octo-chat' | 'integracoes' | 'central-leads' | 'relatorios' | 'configuracoes';
export type MetricasSubSection = 'meus-leads' | 'bolsao' | 'cliente-interessado' | 'cliente-proprietario' | 'proposta';
export type ClienteInteressadoSubSection = 'geral' | 'pre-atendimento' | 'atendimento';
export type ClienteProprietarioSubSection = 'cliente-proprietario' | 'estudo-mercado';
export type CorretoresSubSection = 'meus-leads' | 'bolsao-imoveis' | 'estudo-mercado';
export type AgentesIaSubSection = 'agente-marketing' | 'agente-comportamental';
export type EstudoMercadoSubSection = 'avaliacao' | 'agente-ia' | 'metricas';

interface FixedSidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  onSecondarySidebarChange?: (isOpen: boolean, width?: number, isFinal?: boolean) => void; // Callback com largura opcional
  // Props para sub-navegação de Métricas
  activeMetricasSubSection?: MetricasSubSection;
  onMetricasSubSectionChange?: (section: MetricasSubSection) => void;
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
  // Props para sub-navegação de Estudo de Mercado
  activeEstudoMercadoSubSection?: EstudoMercadoSubSection;
  onEstudoMercadoSubSectionChange?: (section: EstudoMercadoSubSection) => void;
  // Props passadas do componente pai para garantir sincronização
  propTenantId?: string;
  propTenantAllowedFeatures?: SidebarPermission[];
}

export const FixedSidebar = ({ 
  activeSection, 
  onSectionChange,
  onSecondarySidebarChange,
  activeMetricasSubSection = 'cliente-interessado',
  onMetricasSubSectionChange,
  activeClienteInteressadoSubSection = 'geral',
  onClienteInteressadoSubSectionChange,
  activeClienteProprietarioSubSection = 'cliente-proprietario',
  onClienteProprietarioSubSectionChange,
  activeCorretoresSubSection = 'meus-leads',
  onCorretoresSubSectionChange,
  activeAgentesIaSubSection = 'agente-marketing',
  onAgentesIaSubSectionChange,
  activeEstudoMercadoSubSection = 'avaliacao',
  onEstudoMercadoSubSectionChange,
  propTenantId,
  propTenantAllowedFeatures
}: FixedSidebarProps) => {
  const { isGestao, isOwner, user, tenantId: authTenantId } = useAuthContext();
  const [corretorPodeVerAgentes, setCorretorPodeVerAgentes] = useState<boolean | null>(null);
  
  // Usar props se disponíveis, senão usar do contexto
  const tenantId = propTenantId || authTenantId;
  
  // Usar permissões: props do pai > contexto (AuthContext já carrega do banco)
  const tenantAllowedFeatures = propTenantAllowedFeatures ?? user?.tenantAllowedFeatures;
  
  
  // Verificação adicional: admin pelo systemRole (fallback para race conditions)
  const isAdminBySystemRole = user?.systemRole === 'admin' || user?.systemRole === 'team_leader';
  
  // Verificar se é um usuário de tenant (tem tenantId válido)
  const isTenantUser = !!tenantId && tenantId !== 'owner';
  const { unreadCount, loadNotifications } = useNotifications();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (tenantId && tenantId !== 'owner' && user?.id) {
      loadNotifications(tenantId, user.id);
    }
  }, [tenantId, user?.id, loadNotifications]);

  useEffect(() => {
    const carregarPermissaoAgentesCorretor = async () => {
      if (!user) {
        setCorretorPodeVerAgentes(null);
        return;
      }

      if (user.role !== 'corretor') {
        setCorretorPodeVerAgentes(true);
        return;
      }

      try {
        const identidade = await buscarCorretorPorEmail(user.email, user.name);

        if (!identidade?.id) {
          setCorretorPodeVerAgentes(false);
          return;
        }

        const testesCompletos = await verificarTestesCompletos(identidade.id.toString());
        setCorretorPodeVerAgentes(testesCompletos);
      } catch (error) {
        console.warn('⚠️ [FixedSidebar] Erro ao verificar testes do corretor para liberar agentes:', error);
        setCorretorPodeVerAgentes(false);
      }
    };

    carregarPermissaoAgentesCorretor();
  }, [user?.email, user?.name, user?.role]);
  
  // Email do owner para verificação direta
  const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
  
  // Verificação direta se é owner pelo email (fallback para race conditions)
  const isOwnerByEmail = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  
  // Verificação se tem owner-impersonation no localStorage (owner acessando imobiliária)
  const isOwnerImpersonating = (() => {
    try {
      const impersonation = localStorage.getItem('owner-impersonation');
      return !!impersonation;
    } catch {
      return false;
    }
  })();

  // Effective owner = qualquer uma das verificações
  const effectiveIsOwner = isOwner || isOwnerByEmail || isOwnerImpersonating;
  // Effective gestão = isGestao OU admin pelo systemRole (fallback)
  const effectiveIsGestao = isGestao || effectiveIsOwner || isAdminBySystemRole;
  
  // Obter permissões de sidebar do usuário logado
  // Se é owner, SEMPRE usar permissões de owner (acesso total)
  // Se é admin sem permissões customizadas, usar ADMIN_SIDEBAR_PERMISSIONS como fallback
  const userSidebarPermissions = useMemo(() => {
    if (effectiveIsOwner) {
      return ['leads', 'notificacoes', 'metricas', 'estudo-mercado', 'recrutamento', 'gestao-equipe', 'imoveis', 'agentes-ia', 'octo-chat', 'integracoes', 'central-leads', 'atividades', 'relatorios'] as SidebarPermission[];
    }
    
    // Se tem permissões customizadas, usar elas
    if (user?.sidebarPermissions && user.sidebarPermissions.length > 0) {
      return user.sidebarPermissions;
    }

    // Se tenantAllowedFeatures ainda não carregou e não é tenant, usar permissões padrão de admin
    // IMPORTANTE: quando tenantAllowedFeatures existir, a filtragem deve respeitar estritamente as permissões do tenant
    if (!isTenantUser && (tenantAllowedFeatures == null) && isAdminBySystemRole) {
      return ADMIN_SIDEBAR_PERMISSIONS;
    }
    
    // Fallback: array vazio (será filtrado depois)
    return [];
  }, [effectiveIsOwner, user?.sidebarPermissions, isAdminBySystemRole, isTenantUser, tenantAllowedFeatures]);

  const corretorTemLiberacaoManualAgentes = useMemo(() => {
    if (user?.role !== 'corretor') {
      return false;
    }

    return userSidebarPermissions.includes('agentes-ia');
  }, [user?.role, userSidebarPermissions]);
  
  // 🏢 Estados para configuração da imobiliária
  // IMPORTANTE: Sempre usar o nome do tenant (user.tenantName) como fonte principal
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => {
    const saved = localStorage.getItem('companyConfig');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback sem nome - será sobrescrito pelo useEffect
        return { name: '', logo: null, initial: '', color: '#22c55e' };
      }
    }
    return { name: '', logo: null, initial: '', color: '#22c55e' };
  });
  
  // 🔄 Atualizar nome da empresa sempre que o tenant mudar
  useEffect(() => {
    if (user?.tenantName) {
      setCompanyConfig(prev => ({
        ...prev,
        name: user.tenantName,
        initial: user.tenantName.charAt(0).toUpperCase()
      }));
    }
  }, [user?.tenantName]);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [editName, setEditName] = useState(companyConfig.name);
  const [editColor, setEditColor] = useState(companyConfig.color);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved) >= 160 : false;
  });
  // Estado visual para atualizar em tempo real durante resize
  const [visualExpanded, setVisualExpanded] = useState(isExpanded);
  const [hoveredItem, setHoveredItem] = useState<SidebarSection | null>(null);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [isPopupHovered, setIsPopupHovered] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 🆕 Estados para resize da sidebar
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // Recuperar largura salva ou usar padrão
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved) : 80; // 80px é o padrão (colapsada)
  });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  
  // Limites de largura
  const MIN_WIDTH = 80;   // Largura mínima (colapsada)
  const MAX_WIDTH = 280;  // Largura máxima
  const EXPANDED_THRESHOLD = 180; // Acima disso considera expandida (espaço suficiente para textos)
  
  // Estados para controlar expansão das sub-abas
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'metricas': true,
    'agentes-ia': false
  });
  
  // 🆕 Atualizar isExpanded e visualExpanded baseado na largura
  useEffect(() => {
    const expanded = sidebarWidth >= EXPANDED_THRESHOLD;
    setIsExpanded(expanded);
    setVisualExpanded(expanded);
  }, [sidebarWidth]);
  
  // 🆕 Ref para armazenar largura durante resize (evita re-renders)
  const currentWidthRef = useRef(sidebarWidth);
  const lastUpdateRef = useRef(0);
  
  // 🆕 Funções de resize - OTIMIZADO para performance
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    currentWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    // Calcular nova largura diretamente
    const deltaX = e.clientX - startXRef.current;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + deltaX));
    currentWidthRef.current = newWidth;
    
    // Atualizar sidebar DOM diretamente (sempre)
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${newWidth}px`;
    }
    
    // Atualizar estado visual expandido em tempo real
    const shouldBeExpanded = newWidth >= EXPANDED_THRESHOLD;
    setVisualExpanded(shouldBeExpanded);
    
    // Throttle: notificar parent apenas a cada 16ms (~60fps)
    const now = performance.now();
    if (now - lastUpdateRef.current >= 16) {
      lastUpdateRef.current = now;
      onSecondarySidebarChange?.(shouldBeExpanded, newWidth, false);
    }
  }, [isResizing, onSecondarySidebarChange]);
  
  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // Pegar a largura final
      let finalWidth = currentWidthRef.current;
      
      // Snap para larguras predefinidas se estiver próximo
      if (finalWidth < 100) {
        finalWidth = MIN_WIDTH;
      } else if (finalWidth > 220 && finalWidth < 280) {
        finalWidth = 256;
      }
      
      // Atualizar DOM com largura final (com snap)
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${finalWidth}px`;
      }
      
      // Agora sim atualizar o estado React (apenas no final)
      setSidebarWidth(finalWidth);
      localStorage.setItem('sidebarWidth', finalWidth.toString());
      
      // Notificar parent com isFinal=true para atualizar estados
      onSecondarySidebarChange?.(finalWidth >= EXPANDED_THRESHOLD, finalWidth, true);
    }
  }, [isResizing, onSecondarySidebarChange]);
  
  // 🆕 Event listeners para mouse move e up
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);
  
  // 🆕 Função para toggle rápido da sidebar
  const handleToggleExpand = () => {
    const newWidth = isExpanded ? MIN_WIDTH : 256;
    setSidebarWidth(newWidth);
    localStorage.setItem('sidebarWidth', newWidth.toString());
    
    // Atualizar DOM e notificar parent
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${newWidth}px`;
    }
    onSecondarySidebarChange?.(newWidth >= EXPANDED_THRESHOLD, newWidth, true);
  };

  // 🏢 Funções para configuração da empresa
  const handleSaveCompanyConfig = () => {
    const newConfig: CompanyConfig = {
      ...companyConfig,
      name: editName.trim() || 'Minha Empresa',
      initial: (editName.trim() || 'M').charAt(0).toUpperCase(),
      color: editColor
    };
    setCompanyConfig(newConfig);
    localStorage.setItem('companyConfig', JSON.stringify(newConfig));
    setIsEditingCompany(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tamanho (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert('Imagem muito grande. Máximo 2MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const newConfig = { ...companyConfig, logo: base64 };
        setCompanyConfig(newConfig);
        localStorage.setItem('companyConfig', JSON.stringify(newConfig));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    const newConfig = { ...companyConfig, logo: null };
    setCompanyConfig(newConfig);
    localStorage.setItem('companyConfig', JSON.stringify(newConfig));
  };

  const handleOpenEditModal = () => {
    setEditName(companyConfig.name);
    setEditColor(companyConfig.color);
    setIsEditingCompany(true);
  };

  // Auto-expandir quando ativo
  useEffect(() => {
    if (activeSection === 'metricas') {
      setExpandedSections(prev => ({ ...prev, 'metricas': true }));
    } else if (activeSection === 'agentes-ia') {
      setExpandedSections(prev => ({ ...prev, 'agentes-ia': true }));
    }
  }, [activeSection]);

  const allMenuItems = [
    // Início
    {
      id: 'leads' as SidebarSection,
      label: 'Início',
      icon: Home,
      description: 'Página inicial',
      hasSubMenu: false,
      permissionKey: 'leads' as SidebarPermission
    },
    // Notificações
    {
      id: 'notificacoes' as SidebarSection,
      label: 'Notificações',
      icon: Bell,
      description: 'Avisos e atualizações',
      hasSubMenu: false,
      permissionKey: 'notificacoes' as SidebarPermission
    },
    // Métricas - Nova seção consolidada
    {
      id: 'metricas' as SidebarSection,
      label: 'Comercial',
      icon: BarChart3,
      description: 'Análises e métricas de desempenho',
      hasSubMenu: true,
      permissionKey: 'metricas' as SidebarPermission
    },
    // Estudo de Mercado
    {
      id: 'estudo-mercado' as SidebarSection,
      label: 'Estudo de Mercado',
      icon: TrendingUp,
      description: 'Análise de mercado e tendências',
      hasSubMenu: true,
      permissionKey: 'estudo-mercado' as SidebarPermission
    },
    // Recrutamento
    {
      id: 'recrutamento' as SidebarSection,
      label: 'Recrutamento',
      icon: UserCheck,
      description: 'Gestão de recrutamento',
      hasSubMenu: false,
      permissionKey: 'recrutamento' as SidebarPermission
    },
    // Gestão de Equipe
    {
      id: 'gestao-equipe' as SidebarSection,
      label: 'Gestão de Equipe',
      icon: Users,
      description: 'Gestão completa da equipe',
      hasSubMenu: false,
      permissionKey: 'gestao-equipe' as SidebarPermission
    },
    // Imóveis
    {
      id: 'imoveis' as SidebarSection,
      label: 'Imóveis',
      icon: Building2,
      description: 'Gestão de imóveis',
      hasSubMenu: false,
      permissionKey: 'imoveis' as SidebarPermission
    },
    // Agentes de IA
    {
      id: 'agentes-ia' as SidebarSection,
      label: 'Agentes de IA',
      icon: Bot,
      description: 'Agentes inteligentes e automações',
      hasSubMenu: true,
      permissionKey: 'agentes-ia' as SidebarPermission
    },
    // Octo Chat - Nova seção principal
    {
      id: 'octo-chat' as SidebarSection,
      label: 'Octo Chat',
      icon: MessageCircle,
      description: 'Assistente de chat inteligente',
      hasSubMenu: false,
      permissionKey: 'octo-chat' as SidebarPermission
    },
    // Integrações
    {
      id: 'integracoes' as SidebarSection,
      label: 'Integrações',
      icon: Plug,
      description: 'Conectar fontes de leads',
      hasSubMenu: false,
      permissionKey: 'integracoes' as SidebarPermission
    },
    // Relatórios
    {
      id: 'relatorios' as SidebarSection,
      label: 'Relatórios',
      icon: BarChart3,
      description: 'Relatórios e análises',
      hasSubMenu: false,
      permissionKey: 'relatorios' as SidebarPermission
    }
  ];
  
  // 🔐 FILTRAR MENUS BASEADO NAS PERMISSÕES DO USUÁRIO E DO TENANT
  // Usar tenantAllowedFeatures que já combina props, local e user
  const currentTenantFeatures = tenantAllowedFeatures;
  const currentSystemRole = user?.systemRole;
  
  
  // Calcular menuItems diretamente (sem useMemo/useEffect para evitar problemas de sincronização)
  let menuItems = allMenuItems;
  
  if (!effectiveIsOwner) {
    if (isTenantUser && Array.isArray(currentTenantFeatures)) {
      // Para tenants, respeitar estritamente allowed_features, inclusive quando vier vazio
      const filteredByTenant = allMenuItems.filter(item => 
        currentTenantFeatures.includes(item.permissionKey)
      );

      if (currentSystemRole === 'admin' || currentSystemRole === 'team_leader') {
        menuItems = filteredByTenant;
      } else if (userSidebarPermissions.length > 0) {
        menuItems = filteredByTenant.filter(item => 
          userSidebarPermissions.includes(item.permissionKey)
        );
      } else {
        menuItems = filteredByTenant;
      }
    } else if (!isTenantUser && currentSystemRole === 'admin' && (!currentTenantFeatures || currentTenantFeatures.length === 0)) {
      menuItems = allMenuItems.filter(item => 
        ADMIN_SIDEBAR_PERMISSIONS.includes(item.permissionKey)
      );
    } else if (currentTenantFeatures && currentTenantFeatures.length > 0) {
      // Primeiro filtro: permissões do tenant
      let filteredByTenant = allMenuItems.filter(item => 
        currentTenantFeatures.includes(item.permissionKey)
      );
      
      // PARA ADMINS DE TENANT: respeitar estritamente as permissões do tenant
      // NÃO fazer intersecção com userSidebarPermissions
      if (isTenantUser && currentSystemRole === 'admin') {
        menuItems = filteredByTenant;
      } else if (userSidebarPermissions.length > 0) {
        // Para outros usuários, usar intersecção
        menuItems = filteredByTenant.filter(item => 
          userSidebarPermissions.includes(item.permissionKey)
        );
      } else if (isTenantUser) {
        // Se é usuário de tenant sem permissões customizadas, mostrar tudo do tenant
        menuItems = filteredByTenant;
      } else {
        // Bloquear áreas sensíveis
        menuItems = filteredByTenant.filter(item => 
          !['agentes-ia', 'integracoes', 'central-leads', 'relatorios', 'recrutamento', 'gestao-equipe'].includes(item.permissionKey)
        );
      }
    } else if (userSidebarPermissions.length > 0) {
      // Sem tenant features mas com permissões de usuário
      menuItems = allMenuItems.filter(item => 
        userSidebarPermissions.includes(item.permissionKey)
      );
    } else if (!isTenantUser) {
      // Não é tenant user, bloquear áreas sensíveis
      menuItems = allMenuItems.filter(item => 
        !['agentes-ia', 'integracoes', 'central-leads', 'relatorios', 'recrutamento', 'gestao-equipe'].includes(item.permissionKey)
      );
    }
  }

  if (user?.role === 'corretor' && !corretorTemLiberacaoManualAgentes && corretorPodeVerAgentes !== true) {
    menuItems = menuItems.filter(item => item.permissionKey !== 'agentes-ia');
  }

  const handleSectionClick = (sectionId: SidebarSection) => {
    const sectionWithSubMenu = menuItems.find(item => item.id === sectionId && item.hasSubMenu);
    
    if (sectionWithSubMenu) {
      // Toggle da expansão da seção
      setExpandedSections(prev => ({
        ...prev,
        [sectionId]: !prev[sectionId]
      }));
      
      // Se estiver expandindo, selecionar primeira subseção
      if (!expandedSections[sectionId]) {
        if (sectionId === 'metricas' && onMetricasSubSectionChange) {
          onMetricasSubSectionChange('meus-leads');
        } else if (sectionId === 'agentes-ia' && onAgentesIaSubSectionChange) {
          onAgentesIaSubSectionChange('agente-marketing');
        } else if (sectionId === 'estudo-mercado' && onEstudoMercadoSubSectionChange) {
          onEstudoMercadoSubSectionChange('avaliacao');
        }
      }
    }
    
    onSectionChange(sectionId);
    setIsMobileOpen(false); // Fechar no mobile após seleção
  };
  
  // Handler para cliques nas subseções
  const handleSubSectionClick = (parentSection: SidebarSection, subSection: string) => {
    if (parentSection === 'metricas' && onMetricasSubSectionChange) {
      onMetricasSubSectionChange(subSection as MetricasSubSection);
    } else if (parentSection === 'agentes-ia' && onAgentesIaSubSectionChange) {
      onAgentesIaSubSectionChange(subSection as AgentesIaSubSection);
    } else if (parentSection === 'estudo-mercado' && onEstudoMercadoSubSectionChange) {
      onEstudoMercadoSubSectionChange(subSection as EstudoMercadoSubSection);
    }
  };

  // Mapeamento de subseções
  const subSectionsMap: Record<string, { id: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }[]> = {
    'metricas': [
      { id: 'meus-leads', label: 'Meus Leads', icon: Inbox },
      { id: 'bolsao', label: 'Bolsão', icon: Inbox },
      { id: 'cliente-interessado', label: 'Funil Cliente Interessado', icon: Users },
      { id: 'cliente-proprietario', label: 'Cliente Proprietário', icon: Building2 },
      { id: 'proposta', label: 'Proposta', icon: FileText }
    ],
    'agentes-ia': [
      { id: 'agente-marketing', label: 'Marketing', icon: Bot },
      { id: 'agente-comportamental', label: 'Comportamental', icon: Headphones }
    ],
    'estudo-mercado': [
      { id: 'avaliacao', label: 'Avaliação', icon: TrendingUp },
      { id: 'agente-ia', label: 'Editar Estudo', icon: Pencil },
      { id: 'metricas', label: 'Métricas', icon: BarChart3 }
    ]
  };

  // Notificar largura inicial na montagem (apenas uma vez)
  useEffect(() => {
    onSecondarySidebarChange?.(sidebarWidth >= EXPANDED_THRESHOLD, sidebarWidth, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup do timeout ao desmontar
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

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

      {/* Sidebar Principal - Redimensionável */}
      <div 
        ref={sidebarRef}
        className={`
          fixed left-0 top-0 bottom-0 z-[55] flex flex-col overflow-hidden
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          shadow-sm select-none border-r
        `}
        style={{ 
          width: `${sidebarWidth}px`,
          willChange: isResizing ? 'width' : 'auto',
          contain: 'layout',
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)'
        }}
      >
        {/* Área Escura no Topo - Estilo ClickUp */}
        <div className="h-12 bg-gray-900 flex items-center justify-between px-3 flex-shrink-0 relative group">
          {/* Logo Octo */}
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            <img 
              src="https://i.ibb.co/tTQwnPKF/Octo-Dash-Logo-removebg-preview.png"
              alt="OctoDash Logo"
              className="w-5 h-5 object-contain octodash-logo"
            />
          </div>
          
          {/* Botão para expandir/recolher - Harmonioso e elegante */}
          <button
            onClick={handleToggleExpand}
            className={`
              flex items-center justify-center rounded-lg transition-all duration-300 flex-shrink-0
              ${visualExpanded 
                ? 'p-1.5 text-gray-400 hover:text-white hover:bg-gray-800/60' 
                : 'p-1.5 text-gray-400 hover:text-white hover:bg-gray-800/60'
              }
              focus:outline-none focus:ring-2 focus:ring-blue-500/30
            `}
            title={visualExpanded ? 'Recolher (ou arraste a borda)' : 'Expandir (ou arraste a borda)'}
            aria-label={visualExpanded ? 'Recolher sidebar' : 'Expandir sidebar'}
          >
            <div className="relative h-4 w-4 flex items-center justify-center">
              {visualExpanded ? (
                <ChevronLeft className="h-4 w-4 transition-all duration-300 group-hover:scale-110" />
              ) : (
                <ChevronRight className="h-4 w-4 transition-all duration-300 group-hover:scale-110" />
              )}
            </div>
          </button>
        </div>
        
        {/* Conteúdo da Sidebar - Área Clara */}
        <div className="flex-1 flex flex-col overflow-hidden sidebar-bg-gray" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {/* Botão Harmonioso para Expandir/Recolher - Com Logo e Nome */}
          <button 
            onClick={handleToggleExpand}
            className={`
              h-14 flex items-center gap-2 px-3 border-b overflow-hidden group relative flex-shrink-0
              transition-all duration-300 w-full
              ${visualExpanded ? 'justify-between' : 'justify-center'}
              focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/30
            `}
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            title={visualExpanded ? 'Recolher sidebar' : 'Expandir sidebar'}
            aria-label={visualExpanded ? 'Recolher sidebar' : 'Expandir sidebar'}
          >
            {/* Logo/Inicial da empresa */}
            <div 
              className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden shadow-sm transition-all duration-300"
              style={{ backgroundColor: companyConfig.logo ? '#f3f4f6' : companyConfig.color }}
            >
              {companyConfig.logo ? (
                <img src={companyConfig.logo} alt={companyConfig.name} className="w-full h-full object-cover" />
              ) : (
                companyConfig.initial
              )}
            </div>
            
            {/* Nome da empresa - Visível apenas quando expandido */}
            <span 
              className={`text-sm font-semibold truncate whitespace-nowrap transition-all duration-300 ${
                visualExpanded ? 'opacity-100 flex-1 min-w-0' : 'opacity-0 w-0 overflow-hidden'
              }`}
              style={{ color: 'var(--text-primary)' }}
            >
              {companyConfig.name}
            </span>
            
            {/* Ícone de edição para admin - Visível apenas quando expandido */}
            {isGestao && visualExpanded && (
              <Pencil 
                className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />
            )}
            
            {/* Ícone de expand/collapse */}
            <div className="flex-shrink-0 transition-all duration-300">
              {visualExpanded ? (
                <ChevronRight 
                  className="h-4 w-4 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                />
              ) : (
                <ChevronDown 
                  className="h-4 w-4 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                />
              )}
            </div>
          </button>

          {/* Navigation - Estilo ClickUp com Popup Lateral */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 sidebar-nav-scroll" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="space-y-0.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {menuItems.map((item) => (
              <div 
                key={item.id} 
                ref={(el) => {
                  if (el) itemRefs.current[item.id] = el;
                }}
                className="relative"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
                onMouseEnter={(e) => {
                  // Só mostrar popup se sidebar estiver recolhida e item tiver submenu
                  if (item.hasSubMenu && !visualExpanded) {
                    // Limpar timeout anterior se existir
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    // Garantir que o popup não saia da tela
                    const popupWidth = 200;
                    const popupLeft = rect.right + 12;
                    const maxLeft = window.innerWidth - popupWidth - 12;
                    
                    setPopupPosition({
                      top: Math.max(12, rect.top), // Mínimo 12px do topo
                      left: Math.min(popupLeft, maxLeft) // Não ultrapassar a largura da tela
                    });
                    setHoveredItem(item.id);
                    setIsPopupHovered(false);
                  }
                }}
                onMouseLeave={() => {
                  // Só fecha se o popup não estiver sendo hovered
                  if (!isPopupHovered) {
                    hoverTimeoutRef.current = setTimeout(() => {
                      if (!isPopupHovered) {
                        setHoveredItem(null);
                      }
                    }, 100); // Pequeno delay para permitir transição
                  }
                }}
              >
                {/* Item Principal */}
                <button
                  onClick={() => handleSectionClick(item.id)}
                  data-sidebar-active={activeSection === item.id ? 'true' : 'false'}
                  className={`
                    w-full transition-all duration-200 relative group rounded-lg
                    ${visualExpanded 
                      ? 'flex items-center gap-3 py-2 pl-5 pr-3' 
                      : 'flex flex-col items-center justify-center gap-1 py-2 px-2'
                    }
                  `}
                  style={{
                    backgroundColor: activeSection === item.id ? 'rgba(59, 130, 246, 0.10)' : 'var(--bg-secondary)',
                    color: activeSection === item.id ? '#2563eb' : 'var(--text-secondary)'
                  }}
                >
                  {/* Ícone com troca para ChevronDown no hover (apenas itens com submenu) */}
                  <div 
                    className="relative h-4 w-4 flex-shrink-0"
                  >
                    {/* Ícone principal - esconde no hover se tiver submenu */}
                    <item.icon 
                      className={`h-4 w-4 absolute inset-0 transition-all duration-200 ${item.hasSubMenu ? 'group-hover:opacity-0 group-hover:scale-75' : ''} ${activeSection === item.id ? 'text-blue-600' : 'text-[var(--text-secondary)] group-hover:text-blue-600'}`}
                    />
                    {/* ChevronDown - aparece no hover se tiver submenu */}
                    {item.hasSubMenu && (
                      <ChevronDown 
                        className={`h-4 w-4 absolute inset-0 transition-all duration-200 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 ${expandedSections[item.id] ? 'rotate-180' : ''} ${activeSection === item.id ? 'text-blue-600' : 'text-[var(--text-secondary)] group-hover:text-blue-600'}`}
                      />
                    )}

                    {/* Badge de notificações (apenas no item Notificações) */}
                    {item.id === 'notificacoes' && unreadCount > 0 && (
                      <span
                        className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center"
                        style={{ lineHeight: '16px' }}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  
                  {/* Nome */}
                  {visualExpanded ? (
                    <span 
                      className="text-sm font-medium text-left flex-1"
                      style={{ color: activeSection === item.id ? '#2563eb' : 'var(--text-secondary)' }}
                    >
                      {item.label}
                    </span>
                  ) : (
                    <span 
                      className="text-[9px] font-medium text-center leading-tight w-full"
                      style={{ color: activeSection === item.id ? '#2563eb' : 'var(--text-secondary)' }}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
                
                {/* Submenus inline quando expandida */}
                {visualExpanded && item.hasSubMenu && expandedSections[item.id] && (
                  <div className="pl-8 pr-2 py-1 space-y-0.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    {subSectionsMap[item.id]?.map((subSection) => {
                      const SubIcon = subSection.icon;
                      const isActive = 
                        activeSection === item.id && (
                          (item.id === 'metricas' && activeMetricasSubSection === subSection.id) ||
                          (item.id === 'agentes-ia' && activeAgentesIaSubSection === subSection.id) ||
                          (item.id === 'estudo-mercado' && activeEstudoMercadoSubSection === subSection.id)
                        );
                      
                      return (
                        <button
                          key={subSection.id}
                          type="button"
                          onClick={() => handleSubSectionClick(item.id, subSection.id)}
                          data-sidebar-sub-active={isActive ? 'true' : 'false'}
                          className={`
                            w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left group
                            transition-all duration-200 text-xs
                            ${isActive
                              ? 'font-medium' 
                              : ''
                            }
                          `}
                          style={{
                            backgroundColor: isActive ? 'rgba(59, 130, 246, 0.10)' : 'var(--bg-secondary)'
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = isActive
                              ? 'rgba(59, 130, 246, 0.10)'
                              : 'var(--bg-secondary)';
                          }}
                        >
                          <SubIcon 
                            className={`h-3 w-3 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-[var(--text-secondary)] group-hover:text-blue-600'}`}
                          />
                          <span 
                            className={`${isActive ? 'font-medium text-blue-600' : 'text-[var(--text-secondary)] group-hover:text-blue-600'}`}
                          >
                            {subSection.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>

          {/* Rodapé decorativo simples */}
          <div className="mt-auto flex-shrink-0 border-t border-gray-200" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="h-4"></div>
          </div>
        </div>
        
        {/* 🆕 Handle de Resize - Borda direita arrastável */}
        <div
          className={`
            absolute -right-1 top-0 bottom-0 w-3 cursor-ew-resize group z-[60]
          `}
          onMouseDown={handleMouseDown}
          title="Arraste para redimensionar a sidebar"
        >
          {/* Linha de divisão visível */}
          <div className={`
            absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3px] rounded-full
            transition-all duration-200
            ${isResizing 
              ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' 
              : 'bg-gray-300 group-hover:bg-blue-400 group-hover:shadow-[0_0_6px_rgba(59,130,246,0.3)]'
            }
          `} />
        </div>
      </div>

      {/* Popup Lateral Flutuante - Fora da sidebar para não ser cortado */}
      {hoveredItem && menuItems.find(item => item.id === hoveredItem)?.hasSubMenu && popupPosition.top > 0 && popupPosition.left > 0 && (
        <div 
          className="fixed bg-white border border-gray-200/60 rounded-xl shadow-lg py-2 px-2 min-w-[200px] z-[60] animate-in slide-in-from-left-2 fade-in duration-200"
          style={{ 
            top: `${popupPosition.top}px`,
            left: `${popupPosition.left}px`,
            willChange: 'transform, opacity'
          }}
          onMouseEnter={() => {
            setIsPopupHovered(true);
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={() => {
            setIsPopupHovered(false);
            hoverTimeoutRef.current = setTimeout(() => {
              setHoveredItem(null);
            }, 150);
          }}
        >
          {/* Título da seção */}
          <div className="px-3 py-2 mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {menuItems.find(item => item.id === hoveredItem)?.label}
            </span>
          </div>

          {/* Sub-menus */}
          <div className="space-y-0.5">
            {subSectionsMap[hoveredItem]?.map((subSection) => {
              const SubIcon = subSection.icon;
              const isActive =
                activeSection === hoveredItem && (
                  (hoveredItem === 'metricas' && activeMetricasSubSection === subSection.id) ||
                  (hoveredItem === 'agentes-ia' && activeAgentesIaSubSection === subSection.id) ||
                  (hoveredItem === 'estudo-mercado' && activeEstudoMercadoSubSection === subSection.id)
                );
              
              return (
                <button
                  key={subSection.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                    }
                    handleSubSectionClick(hoveredItem, subSection.id);
                    setHoveredItem(null);
                    setIsPopupHovered(false);
                  }}
                  data-sidebar-sub-active={isActive ? 'true' : 'false'}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left
                    transition-all duration-200 group
                    ${isActive
                      ? 'text-blue-600 bg-[rgba(59,130,246,0.10)]' 
                      : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }
                  `}
                >
                  <SubIcon className={`h-4 w-4 flex-shrink-0 ${
                    isActive ? 'text-blue-600' : 'text-gray-500 group-hover:text-blue-600'
                  }`} />
                  
                  <span className={`text-sm font-normal ${
                    isActive ? 'text-blue-600' : ''
                  }`}>
                    {subSection.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Modal de edição da empresa - Apenas para Admin */}
      {isEditingCompany && isGestao && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Personalizar Imobiliária
            </h2>
            
            {/* Upload de Logo */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo da Empresa
              </label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold overflow-hidden border-2 border-dashed border-gray-300 cursor-pointer hover:border-blue-400 transition-colors"
                  style={{ backgroundColor: companyConfig.logo ? 'transparent' : editColor }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {companyConfig.logo ? (
                    <img src={companyConfig.logo} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-6 h-6 text-white/70" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-[#1e3a8a] hover:text-[#1e40af] font-medium"
                  >
                    {companyConfig.logo ? 'Trocar imagem' : 'Enviar imagem'}
                  </button>
                  {companyConfig.logo && (
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

            {/* Nome da Empresa */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome da Imobiliária
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome da sua empresa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Cor do Badge */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cor do Badge (quando sem logo)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                />
                <div className="flex gap-2">
                  {['#22c55e', '#3b82f6', '#8b5cf6', '#ef4444', '#f97316', '#06b6d4'].map(color => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${editColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="mb-6 p-3 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 mb-2 block">Preview:</span>
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                  style={{ backgroundColor: companyConfig.logo ? 'transparent' : editColor }}
                >
                  {companyConfig.logo ? (
                    <img src={companyConfig.logo} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    (editName || 'M').charAt(0).toUpperCase()
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {editName || 'Nome da Empresa'}
                </span>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingCompany(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCompanyConfig}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

