/**
 * 🔐 Sistema de Permissões de Usuários - Multi-tenant
 * Controle granular de acesso às funcionalidades do CRM
 * 
 * 4 TIPOS DE USUÁRIO:
 * - owner: Dono do sistema (acesso total a todos os tenants)
 * - admin: Administrador de uma imobiliária (acesso total ao tenant)
 * - team_leader: Líder de equipe (acesso à sua equipe + algumas funções admin)
 * - corretor: Corretor (acesso restrito apenas às suas funcionalidades)
 */

// Tipos de usuário do sistema
export type UserRole = 'owner' | 'admin' | 'team_leader' | 'corretor';

// Equipes disponíveis
export type TeamColor = 'vermelha' | 'verde' | 'amarela' | 'azul';

// Permissões de menu baseadas nas seções do sidebar
export type SidebarPermission = 
  | 'leads'           // Início/Leads
  | 'notificacoes'    // Notificações
  | 'metricas'        // Comercial/Métricas
  | 'estudo-mercado'  // Estudo de Mercado
  | 'recrutamento'    // Recrutamento
  | 'gestao-equipe'   // Gestão de Equipe
  | 'imoveis'         // Imóveis
  | 'agentes-ia'      // Agentes de IA
  | 'octo-chat'       // Octo Chat
  | 'integracoes'     // Integrações
  | 'central-leads'   // Central de Leads
  | 'atividades'      // Atividades
  | 'relatorios';     // Relatórios

// Mantendo compatibilidade com MenuPermission antiga
export type MenuPermission = 
  | 'dashboard-gestao'
  | 'dashboard-corretor'
  | 'cliente-interessado'
  | 'cliente-proprietario'
  | 'imoveis'
  | 'corretores-gestao'
  | 'corretores'
  | 'agentes-ia'
  | 'configuracoes';

export interface UserPermissions {
  userId: string;
  userName: string;
  userEmail?: string;
  userRole: UserRole; // Expandido para 4 tipos
  team?: TeamColor; // Equipe do usuário
  tenantId?: string; // ID do tenant (imobiliária)
  
  // Permissões de sidebar (novas)
  sidebarPermissions: SidebarPermission[];
  
  // Permissões de menu (legado - mantido para compatibilidade)
  menuPermissions: MenuPermission[];
  
  // Permissões granulares
  canEditLeads: boolean;
  canDeleteLeads: boolean;
  canAssignLeads: boolean;
  canViewAllLeads: boolean;
  canExportData: boolean;
  canManageTeams: boolean;
  canManageMembers: boolean; // Novo: pode gerenciar membros
  canViewReports: boolean; // Novo: pode ver relatórios
  
  createdAt: string;
  updatedAt: string;
}

export interface PermissionsConfig {
  users: UserPermissions[];
  defaultCorretorPermissions: MenuPermission[];
}

// ========== PERMISSÕES DE SIDEBAR POR TIPO DE USUÁRIO ==========

// Owner: Acesso total a tudo
export const OWNER_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'estudo-mercado', 'recrutamento', 'gestao-equipe',
  'imoveis', 'agentes-ia', 'octo-chat', 'integracoes', 'central-leads', 'atividades', 'relatorios'
];

// Admin: Acesso total ao tenant
export const ADMIN_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'estudo-mercado', 'recrutamento', 'gestao-equipe',
  'imoveis', 'agentes-ia', 'octo-chat', 'integracoes', 'central-leads', 'atividades', 'relatorios'
];

// Team Leader: Acesso intermediário
export const TEAM_LEADER_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'estudo-mercado', 'gestao-equipe', 'imoveis', 'octo-chat'
];

// Corretor: Acesso restrito (bloqueado por padrão em várias áreas)
export const CORRETOR_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'estudo-mercado', 'imoveis', 'octo-chat'
];

// Abas bloqueadas por padrão para corretores
export const CORRETOR_BLOCKED_SECTIONS: SidebarPermission[] = [
  'agentes-ia',      // ❌ Agentes de IA
  'integracoes',     // ❌ Integrações
  'central-leads',   // ❌ Central de Leads
  'relatorios',      // ❌ Relatórios
  'recrutamento',    // ❌ Recrutamento
  'gestao-equipe'    // ❌ Gestão de Equipe
];

// ========== PERMISSÕES LEGADAS (compatibilidade) ==========

// Permissões padrão para Administrador (acesso total)
export const ADMIN_DEFAULT_PERMISSIONS: MenuPermission[] = [
  'dashboard-gestao',
  'dashboard-corretor',
  'cliente-interessado',
  'cliente-proprietario',
  'imoveis',
  'corretores-gestao',
  'corretores',
  'agentes-ia',
  'configuracoes'
];

// Permissões padrão para Corretor (acesso limitado)
export const CORRETOR_DEFAULT_PERMISSIONS: MenuPermission[] = [
  'dashboard-corretor',
  'cliente-interessado',
  'cliente-proprietario',
  'imoveis'
];

// Permissões padrão para Team Leader
export const TEAM_LEADER_DEFAULT_PERMISSIONS: MenuPermission[] = [
  'dashboard-gestao',
  'dashboard-corretor',
  'cliente-interessado',
  'cliente-proprietario',
  'imoveis',
  'corretores'
];

// Labels amigáveis para os menus
export const MENU_LABELS: Record<MenuPermission, string> = {
  'dashboard-gestao': 'Dashboard de Gestão',
  'dashboard-corretor': 'Dashboard do Corretor',
  'cliente-interessado': 'Cliente Interessado',
  'cliente-proprietario': 'Cliente Proprietário',
  'imoveis': 'Imóveis',
  'corretores-gestao': 'Corretores',
  'corretores': 'Corretores Gráficos',
  'agentes-ia': 'Agentes de IA',
  'configuracoes': 'Configurações'
};

// Ícones para os menus (usando nome dos ícones do lucide-react)
export const MENU_ICONS: Record<MenuPermission, string> = {
  'dashboard-gestao': 'LayoutDashboard',
  'dashboard-corretor': 'User',
  'cliente-interessado': 'UserPlus',
  'cliente-proprietario': 'Home',
  'imoveis': 'Building2',
  'corretores-gestao': 'Users',
  'corretores': 'UserCheck',
  'agentes-ia': 'Bot',
  'configuracoes': 'Settings'
};

