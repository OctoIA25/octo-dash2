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
  | 'juridico'        // Jurídico (Visão Geral + Propostas)
  | 'estudo-mercado'  // Estudo de Mercado
  | 'recrutamento'    // Recrutamento
  | 'gestao-equipe'   // Gestão de Equipe
  | 'imoveis'         // Imóveis
  | 'agentes-ia'      // Agentes de IA
  | 'comunicacao'     // Comunicação (Disparador, Públicos, Templates...)
  | 'octo-chat'       // Octo Chat
  | 'chat'            // Chat (WhatsApp Oficial)
  | 'integracoes'     // Integrações
  | 'central-leads'   // Central de Leads
  | 'atividades'      // Atividades
  | 'relatorios'      // Relatórios
  | 'metas'           // Metas comerciais
  | 'excel' // Excel

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
  | 'configuracoes'
  | 'excel';

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

// ========== ATUAÇÃO DO CORRETOR (lançamentos / prontos / alugados) ==========

// Guardada em tenant_memberships.permissions.atuacao (JSONB). Formato atual:
// array multi-seleção. Formato legado (2026-08-11/12, ainda no banco): string
// 'lancamentos' | 'prontos' | 'ambos'.
export type AtuacaoTipo = 'lancamentos' | 'prontos' | 'alugados';

export const ATUACAO_TIPOS: readonly AtuacaoTipo[] = ['lancamentos', 'prontos', 'alugados'];

export const ATUACAO_LABELS: Record<AtuacaoTipo, string> = {
  lancamentos: 'Lançamentos',
  prontos: 'Imóveis prontos',
  alugados: 'Alugados',
};

/**
 * Normaliza `permissions.atuacao` para a lista de tipos que o corretor atende.
 * Fail-open: ausente, vazio ou lixo = todos — dado estranho no JSONB não pode
 * esconder lead nem tirar corretor da roleta. Legado: 'prontos' era "tudo que
 * não é lançamento", então expande para prontos+alugados. Mesma regra existe
 * no servidor (leadAssignment.js / api-server.js) — ao mexer aqui, mexa lá.
 */
export const atuacoesDe = (permissions?: Record<string, unknown> | null): AtuacaoTipo[] => {
  const valor = permissions?.atuacao;
  if (valor === 'lancamentos') return ['lancamentos'];
  if (valor === 'prontos') return ['prontos', 'alugados'];
  if (Array.isArray(valor)) {
    const validos = ATUACAO_TIPOS.filter((t) => valor.includes(t));
    if (validos.length > 0) return validos;
  }
  return [...ATUACAO_TIPOS];
};

// ========== PERMISSÕES DE SIDEBAR POR TIPO DE USUÁRIO ==========

// Owner: Acesso total a tudo
export const OWNER_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'recrutamento', 'gestao-equipe',
  'imoveis', 'agentes-ia', 'comunicacao', 'octo-chat', 'chat', 'integracoes', 'central-leads', 'atividades', 'relatorios', 'metas', 'excel'
];

// Admin: Acesso total ao tenant
export const ADMIN_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'recrutamento', 'gestao-equipe',
  'imoveis', 'agentes-ia', 'comunicacao', 'octo-chat', 'chat', 'integracoes', 'central-leads', 'atividades', 'relatorios', 'metas', 'excel'
];

// Team Leader: Acesso intermediário
// 'relatorios' incluído porque a Importação de Planilhas Excel passou a ser uma
// aba dentro de /relatorios (guardada por canAccess('relatorios')); o team_leader
// já tinha 'excel' e precisa de 'relatorios' para alcançar a aba.
export const TEAM_LEADER_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'gestao-equipe', 'imoveis', 'octo-chat', 'chat', 'metas', 'excel', 'relatorios'
];

// Corretor: Acesso restrito (bloqueado por padrão em várias áreas)
// 'excel' removido: a aba expõe receita de TODOS os corretores (dado financeiro) e o
// acesso é restrito a admin/team_leader/owner também no RLS de excel_imports.
export const CORRETOR_SIDEBAR_PERMISSIONS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'imoveis', 'octo-chat', 'chat'
];

// Abas bloqueadas por padrão para corretores
export const CORRETOR_BLOCKED_SECTIONS: SidebarPermission[] = [
  'agentes-ia',      // ❌ Agentes de IA
  'comunicacao',     // ❌ Comunicação (envio em massa — só owner/admin)
  'integracoes',     // ❌ Integrações
  'central-leads',   // ❌ Central de Leads
  'relatorios',      // ❌ Relatórios
  'recrutamento',    // ❌ Recrutamento
  'gestao-equipe',   // ❌ Gestão de Equipe
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
  'configuracoes': 'Configurações',
  'excel' : 'Excel',
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
  'configuracoes': 'Settings',
  'excel': 'FileSpreadsheet'
};


// ========== PERMISSÕES NÃO EDITÁVEIS NO MODAL DE EQUIPE ==========

/**
 * Abas que o modal de Equipe (EquipeSection) expõe como checkbox.
 *
 * O salvamento reconstrói `permissions.sidebar_permissions` a partir desses
 * checkboxes — então TODA aba fora desta lista era apagada a cada salvamento.
 * Foi assim que 'chat' (WhatsApp) sumiu de 88 membros: nunca teve checkbox.
 * Ao adicionar uma aba nova ao menu, ou ela ganha checkbox e entra aqui, ou
 * fica fora e passa a seguir o padrão do cargo (`sidebarPermissionsDoCargo`).
 *
 * Ao MOVER uma aba para cá, as listas já gravadas sem ela deixam de ser curadas
 * na leitura — precisa de backfill (ver migration 20260822_backfill_chat_sidebar).
 */
export const SIDEBAR_PERMISSIONS_EDITAVEIS: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'recrutamento',
  'gestao-equipe', 'imoveis', 'agentes-ia', 'chat', 'integracoes', 'central-leads', 'relatorios', 'excel',
];

export const sidebarPermissionsDoCargo = (role: string): SidebarPermission[] => {
  switch (role) {
    case 'owner': return [...OWNER_SIDEBAR_PERMISSIONS];
    case 'admin': return [...ADMIN_SIDEBAR_PERMISSIONS];
    case 'team_leader': return [...TEAM_LEADER_SIDEBAR_PERMISSIONS];
    case 'corretor':
    default: return [...CORRETOR_SIDEBAR_PERMISSIONS];
  }
};

/**
 * Completa a lista salva com as abas que o editor não gerencia, usando o padrão
 * do cargo. Aplicado na leitura (AuthContext/useAuth) e na escrita
 * (EquipeSection) — na leitura porque cura sozinho as linhas já gravadas sem
 * 'chat', sem precisar reabrir cada membro. O tenant continua sendo o gate
 * final: `allowed_features` ainda pode esconder a aba.
 */
export const comPermissoesNaoEditaveis = (
  salvas: SidebarPermission[],
  role: string,
): SidebarPermission[] => {
  const naoEditaveis = sidebarPermissionsDoCargo(role).filter(
    (p) => !SIDEBAR_PERMISSIONS_EDITAVEIS.includes(p),
  );
  return [...new Set([...salvas, ...naoEditaveis])];
};

// ============================================================
// Quais áreas da barra lateral este usuário alcança.
//
// FONTE ÚNICA. Isto era calculado em DOIS lugares com regras diferentes:
// `DashboardLayout` (que libera a ROTA) ignorava as permissões salvas do
// membro quando ele é admin ou team_leader; `NovaSidebar` (que desenha o
// MENU) não abria essa exceção. A rota deixava entrar, o menu escondia o
// caminho.
//
// A regra aqui é a do DashboardLayout, ramo a ramo, porque a rota é quem de
// fato manda. NENHUM acesso novo é concedido: a exceção de admin/team_leader
// existe desde o commit inicial e já regia as rotas.
//
// O QUE MUDA, medido em produção em 18/09/2026: o menu passa a mostrar o que
// a rota já liberava. De 15 memberships admin/team_leader, 12 ganham pelo
// menos um item de menu; 2 ganham o link de Imóveis; 3 team_leaders passam a
// ver Integrações, 2 veem Agentes de IA e 2 veem Comunicação (disparo em
// massa). Ninguém perde link e nenhum corretor muda.
//
// PERGUNTA EM ABERTO PARA O NEGÓCIO: tirar "imoveis" de um admin na tela de
// Acessos hoje não restringe nada, porque a rota ignora a escolha — a tela
// promete uma restrição que o app não cumpre. Ou a tela para de oferecer
// isso, ou a rota passa a respeitar. A segunda opção TIRA acesso que 9
// pessoas têm hoje, então precisa de decisão antes de virar código.
// ============================================================

/** A ordem em que as áreas aparecem no menu. */
export const SIDEBAR_PERMISSION_ORDER: SidebarPermission[] = [
  'leads', 'notificacoes', 'metricas', 'juridico', 'estudo-mercado', 'recrutamento',
  'gestao-equipe', 'imoveis', 'agentes-ia', 'comunicacao', 'octo-chat', 'chat',
  'integracoes', 'central-leads', 'relatorios', 'metas', 'excel',
];

export interface ContextoDePermissao {
  isOwner: boolean;
  /** `true` quando há um tenant real selecionado (não a visão de dono). */
  isTenantUser: boolean;
  systemRole?: string | null;
  /** O que a imobiliária contratou. `undefined` quando ainda não carregou. */
  tenantAllowedFeatures?: SidebarPermission[] | null;
  /** O que foi salvo para este membro na tela de Acessos. */
  sidebarPermissions?: SidebarPermission[] | null;
}

export function permissoesDeSidebar(ctx: ContextoDePermissao): SidebarPermission[] {
  const salvas = ctx.sidebarPermissions ?? [];
  const naOrdem = (permitidas: SidebarPermission[]) =>
    SIDEBAR_PERMISSION_ORDER.filter((p) => permitidas.includes(p));

  if (ctx.isOwner) return [...SIDEBAR_PERMISSION_ORDER];

  if (ctx.isTenantUser && Array.isArray(ctx.tenantAllowedFeatures)) {
    const doTenant = ctx.tenantAllowedFeatures;
    // Admin e team_leader não são limitados pelas permissões salvas.
    if (ctx.systemRole === 'admin' || ctx.systemRole === 'team_leader') return naOrdem(doTenant);
    if (salvas.length > 0) return naOrdem(doTenant.filter((p) => salvas.includes(p)));
    return naOrdem(doTenant);
  }

  // Sem o que a imobiliária contratou, vale o padrão do cargo.
  if (ctx.systemRole === 'admin') return naOrdem(ADMIN_SIDEBAR_PERMISSIONS);
  if (ctx.systemRole === 'team_leader') return naOrdem(TEAM_LEADER_SIDEBAR_PERMISSIONS);
  if (salvas.length > 0) return naOrdem(salvas);
  return naOrdem(CORRETOR_SIDEBAR_PERMISSIONS);
}
