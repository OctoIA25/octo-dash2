/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  SidebarPermission, 
  OWNER_SIDEBAR_PERMISSIONS,
  ADMIN_SIDEBAR_PERMISSIONS,
  CORRETOR_SIDEBAR_PERMISSIONS,
  TEAM_LEADER_SIDEBAR_PERMISSIONS
} from '@/types/permissions';

export type UserRole = 'gestao' | 'corretor';

// Tipos de role do sistema multi-tenant
export type SystemRole = 'owner' | 'admin' | 'team_leader' | 'corretor';

const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

const OWNER_IMPERSONATION_KEY = 'owner-impersonation';

// Lista completa de corretores do Supabase (36 corretores)
export type CorretorName = 
  | 'Alexandra Niero'
  | 'Alexandre Faggian'
  | 'André Marcondes'
  | 'Andrea Abrao'
  | 'Ana Cristina Delgado Fontes'
  | 'Ana Giglio'
  | 'Ana Lucia Brito'
  | 'Angelica Andrade'
  | 'Bárbara Fabrício'
  | 'Catia Oliveira'
  | 'Celina Yamamoto'
  | 'Caio Zomignani'
  | 'Edna Silva'
  | 'Emerson Pavan'
  | 'Felipe Camargo'
  | 'Fernanda Cristina Lanfranchi Sanchez'
  | 'Felipe Martins'
  | 'Gabriele Fávaro'
  | 'Gustavo Teo'
  | 'Vanessa'
  | 'Jeferson Santos'
  | 'Karla Paulovic'
  | 'Jose Rosalem'
  | 'Mariana Mamede'
  | 'Renato Faraco'
  | 'Rose Braga'
  | 'Wilson Peres'
  | 'Josismar de Barros'
  | 'André Coelho'
  | 'Felipe'
  | 'Jeniffer Arcos'
  | 'Paulo Inacio'
  | 'Pâmela Hashimoto'
  | 'Isabel Cristina'
  | 'Julia Castro'
  | 'contato';

export type TeamColor = 'verde' | 'vermelha' | 'amarela' | 'azul' | 'admin';

interface AuthUser {
  role: UserRole;
  systemRole: SystemRole; // Novo: role do sistema (owner, admin, team_leader, corretor)
  name: string;
  email: string;
  id: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  isOwner?: boolean;
  corretor?: CorretorName;
  telefone?: number;
  equipe?: TeamColor;
  sidebarPermissions: SidebarPermission[]; // Novo: permissões de sidebar
  tenantAllowedFeatures?: SidebarPermission[]; // Módulos permitidos para o tenant
  permissions?: Record<string, boolean>; // Permissões granulares
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
}

type MembershipRow = {
  user_id: string;
  role: 'admin' | 'corretor' | 'team_leader';
  tenant_id: string;
  code: string;
  name: string;
  permissions?: Record<string, any>; // Novo: permissões do membro
};

// Função para obter permissões de sidebar baseado no role e permissões customizadas
function getSidebarPermissions(
  role: string, 
  isOwner: boolean, 
  customPermissions?: Record<string, any>
): SidebarPermission[] {
  // Owner tem acesso total
  if (isOwner) {
    return [...OWNER_SIDEBAR_PERMISSIONS];
  }
  
  // Se tem permissões customizadas salvas, usar elas
  if (customPermissions?.sidebar_permissions && Array.isArray(customPermissions.sidebar_permissions)) {
    return customPermissions.sidebar_permissions as SidebarPermission[];
  }
  
  // Senão, usar permissões padrão baseado no role
  switch (role) {
    case 'admin':
      return [...ADMIN_SIDEBAR_PERMISSIONS];
    case 'team_leader':
      return [...TEAM_LEADER_SIDEBAR_PERMISSIONS];
    case 'corretor':
    default:
      return [...CORRETOR_SIDEBAR_PERMISSIONS];
  }
}

// 📋 Lista completa de corretores com telefones e equipes (dados do Supabase)
export const CORRETORES_DATA: Array<{nome: CorretorName, telefone: number, equipe: TeamColor}> = [
  { nome: 'Alexandra Niero', telefone: 5511981156551, equipe: 'verde' },
  { nome: 'Alexandre Faggian', telefone: 5511988417574, equipe: 'vermelha' },
  { nome: 'André Marcondes', telefone: 5511999593700, equipe: 'amarela' },
  { nome: 'Andrea Abrao', telefone: 5511994216315, equipe: 'azul' },
  { nome: 'Ana Cristina Delgado Fontes', telefone: 5511999111661, equipe: 'verde' },
  { nome: 'Ana Giglio', telefone: 5511976022447, equipe: 'vermelha' },
  { nome: 'Ana Lucia Brito', telefone: 5511942202550, equipe: 'amarela' },
  { nome: 'Angelica Andrade', telefone: 5511956636322, equipe: 'azul' },
  { nome: 'Bárbara Fabrício', telefone: 5511999651393, equipe: 'verde' },
  { nome: 'Catia Oliveira', telefone: 5511994583827, equipe: 'vermelha' },
  { nome: 'Celina Yamamoto', telefone: 5511980069340, equipe: 'amarela' },
  { nome: 'Caio Zomignani', telefone: 5511995713126, equipe: 'azul' },
  { nome: 'Edna Silva', telefone: 5511986495044, equipe: 'verde' },
  { nome: 'Emerson Pavan', telefone: 5511986803101, equipe: 'vermelha' },
  { nome: 'Felipe Camargo', telefone: 5511937161191, equipe: 'amarela' },
  { nome: 'Fernanda Cristina Lanfranchi Sanchez', telefone: 5511982841685, equipe: 'azul' },
  { nome: 'Felipe Martins', telefone: 5511975216495, equipe: 'verde' },
  { nome: 'Gabriele Fávaro', telefone: 5511991749544, equipe: 'vermelha' },
  { nome: 'Gustavo Teo', telefone: 5511972425843, equipe: 'amarela' },
  { nome: 'Vanessa', telefone: 5511975437629, equipe: 'azul' },
  { nome: 'Jeferson Santos', telefone: 5511999442689, equipe: 'verde' },
  { nome: 'Karla Paulovic', telefone: 5511913018131, equipe: 'vermelha' },
  { nome: 'Jose Rosalem', telefone: 5511999558402, equipe: 'amarela' },
  { nome: 'Mariana Mamede', telefone: 5511995203544, equipe: 'azul' },
  { nome: 'Renato Faraco', telefone: 5511975477710, equipe: 'verde' },
  { nome: 'Rose Braga', telefone: 5511955988819, equipe: 'vermelha' },
  { nome: 'Wilson Peres', telefone: 5511981313141, equipe: 'amarela' },
  { nome: 'Josismar de Barros', telefone: 5511972584755, equipe: 'azul' },
  { nome: 'André Coelho', telefone: 5511983335449, equipe: 'verde' },
  { nome: 'Felipe', telefone: 5511950161912, equipe: 'vermelha' },
  { nome: 'Jeniffer Arcos', telefone: 5511945003737, equipe: 'amarela' },
  { nome: 'Paulo Inacio', telefone: 5511985333892, equipe: 'azul' },
  { nome: 'Pâmela Hashimoto', telefone: 5511932237214, equipe: 'verde' },
  { nome: 'Isabel Cristina', telefone: 5511996808769, equipe: 'vermelha' },
  { nome: 'Julia Castro', telefone: 5511972600681, equipe: 'amarela' },
  { nome: 'contato', telefone: 5511950640555, equipe: 'azul' }
];

const CORRETORES: CorretorName[] = CORRETORES_DATA.map(c => c.nome);

// Flag para evitar múltiplas chamadas simultâneas
let isLoadingSession = false;

const AUTH_CACHE_KEY = 'auth-state-cache';

function getCachedAuthState(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as AuthState;
    if (cached?.isAuthenticated && cached?.user?.id) {
      return { ...cached, isLoading: false };
    }
  } catch {}
  return null;
}

function setCachedAuthState(state: AuthState): void {
  try {
    if (state.isAuthenticated && state.user) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch {}
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const cached = getCachedAuthState();
    return cached || { isAuthenticated: false, user: null, isLoading: true };
  });

  const loadUserFromSession = useCallback(async () => {
    // Evitar múltiplas chamadas simultâneas (race condition)
    if (isLoadingSession) {
      return;
    }
    isLoadingSession = true;
    
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      const session = sessionData.session;
      if (!session?.user) {
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      if ((session.user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase()) {
        // Owner SEMPRE tem acesso total, mesmo ao impersonar um tenant
        const raw = localStorage.getItem(OWNER_IMPERSONATION_KEY);
        let tenantInfo = { tenantId: 'owner', tenantCode: 'OWNER', tenantName: 'Owner' };
        
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { tenantId: string; tenantCode: string; tenantName: string };
            if (parsed?.tenantId && parsed?.tenantCode && parsed?.tenantName) {
              tenantInfo = parsed;
            }
          } catch {
            // ignore
          }
        }

        // Owner SEMPRE tem isOwner: true e permissões de owner
        const ownerState: AuthState = {
          isAuthenticated: true,
          isLoading: false,
          user: {
            id: session.user.id,
            email: session.user.email || '',
            role: 'gestao',
            systemRole: 'owner',
            name: 'Owner Master',
            tenantId: tenantInfo.tenantId,
            tenantCode: tenantInfo.tenantCode,
            tenantName: tenantInfo.tenantName,
            isOwner: true,
            sidebarPermissions: getSidebarPermissions('owner', true)
          }
        };
        setAuthState(ownerState);
        setCachedAuthState(ownerState);
        return;
      }

      // We keep the app logged in only if we can resolve a membership.
      // IMPORTANTE: Usar retry para evitar perder sessão por erros de rede temporários
      let memberships: MembershipRow[] | null = null;
      let membershipError: any = null;
      
      // Tentar buscar memberships com retry (3 tentativas)
      // NOTA: A view my_memberships_with_tenant pode não ter o campo permissions
      // Buscamos apenas os campos básicos e depois tentamos buscar permissions separadamente
      for (let attempt = 1; attempt <= 3; attempt++) {
        // IMPORTANTE: Filtrar pelo user_id do usuário logado
        const { data, error } = await supabase
          .from('my_memberships_with_tenant')
          .select('user_id, role, tenant_id, code, name')
          .eq('user_id', session.user.id);
        
        if (!error && data && data.length > 0) {
          memberships = data as MembershipRow[];
          membershipError = null;
          break;
        }
        
        membershipError = error;
        
        // Se não for erro de rede, não tentar novamente
        if (error && !error.message?.includes('network') && !error.message?.includes('fetch')) {
          break;
        }
        
        // Aguardar antes de tentar novamente (exceto na última tentativa)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      // Se falhou por erro de rede, tentar recuperar do localStorage ou manter loading
      // Isso evita perder a sessão por problemas temporários de conexão
      if (membershipError) {
        console.warn('⚠️ Erro ao buscar memberships, tentando recuperar sessão...', membershipError.message);
        
        // Tentar refresh da sessão antes de desistir
        try {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            // Tentar novamente após refresh
            const { data: retryData } = await supabase
              .from('my_memberships_with_tenant')
              .select('user_id, role, tenant_id, code, name');
            if (retryData && retryData.length > 0) {
              memberships = retryData as MembershipRow[];
              membershipError = null;
            }
          }
        } catch (e) {
          console.warn('⚠️ Falha ao renovar sessão:', e);
        }
        
        // Se ainda falhou, manter em loading para tentar novamente
        if (membershipError) {
          console.warn('⚠️ Mantendo sessão em estado de loading para retry automático');
          // Agendar nova tentativa em 3 segundos
          setTimeout(() => loadUserFromSession(), 3000);
          return;
        }
      }
      
      if (!memberships || memberships.length === 0) {
        console.warn('⚠️ Nenhum membership encontrado para o usuário');
        await supabase.auth.signOut();
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      const membership = memberships[0] as MembershipRow;
      const mappedRole: UserRole = membership.role === 'admin' ? 'gestao' : 'corretor';
      const systemRole: SystemRole = membership.role as SystemRole;
      
      // Buscar permissões do usuário e do tenant EM PARALELO
      const [permResult, tenantResult] = await Promise.allSettled([
        supabase
          .from('tenant_memberships')
          .select('permissions')
          .eq('user_id', session.user.id)
          .eq('tenant_id', membership.tenant_id)
          .maybeSingle(),
        supabase
          .from('tenants')
          .select('allowed_features')
          .eq('id', membership.tenant_id)
          .maybeSingle()
      ]);

      let userPermissions: Record<string, any> | undefined;
      if (permResult.status === 'fulfilled' && permResult.value.data?.permissions) {
        userPermissions = permResult.value.data.permissions as Record<string, any>;
      }

      let tenantAllowedFeatures: SidebarPermission[] | undefined;
      if (tenantResult.status === 'fulfilled' && tenantResult.value.data?.allowed_features) {
        tenantAllowedFeatures = tenantResult.value.data.allowed_features as SidebarPermission[];
      }

      // Obter permissões de sidebar (customizadas ou padrão baseado no role)
      const sidebarPerms = getSidebarPermissions(
        membership.role, 
        false, 
        userPermissions
      );
      
      const newState: AuthState = {
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: session.user.id,
          email: session.user.email || '',
          role: mappedRole,
          systemRole: systemRole,
          name: session.user.email || 'Usuário',
          tenantId: membership.tenant_id,
          tenantCode: membership.code,
          tenantName: membership.name,
          sidebarPermissions: sidebarPerms,
          tenantAllowedFeatures: tenantAllowedFeatures,
          permissions: userPermissions,
          equipe: userPermissions?.team as TeamColor | undefined
        }
      };
      setAuthState(newState);
      setCachedAuthState(newState);
    } finally {
      isLoadingSession = false;
    }
  }, []);

  useEffect(() => {
    loadUserFromSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      
      // Só recarregar sessão em eventos específicos
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Aguardar um pouco para evitar race condition
        setTimeout(() => {
          isLoadingSession = false; // Reset flag para permitir nova carga
          loadUserFromSession();
        }, 100);
      } else if (event === 'SIGNED_OUT') {
        isLoadingSession = false;
        localStorage.removeItem(AUTH_CACHE_KEY);
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
      }
    });

    // Verificar sessão a cada 2 minutos para garantir que está ativa
    const sessionCheckInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Verificar se o token vai expirar em menos de 30 minutos
        const expiresAt = session.expires_at;
        if (expiresAt) {
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = expiresAt - now;
          
          // Fazer refresh se faltar menos de 30 minutos para expirar
          if (timeUntilExpiry < 1800) {
            await supabase.auth.refreshSession();
          }
        }
      } else {
        // Tentar recuperar sessão se não encontrada
        await supabase.auth.refreshSession();
      }
    }, 2 * 60 * 1000); // A cada 2 minutos

    // Verificar sessão quando a janela ganhar foco (evita deslogar ao voltar)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          await supabase.auth.refreshSession();
        }
        loadUserFromSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Verificar sessão ao dar F5 (beforeunload não ajuda, mas podemos verificar no load)
    const handleFocus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Fazer refresh preventivo ao ganhar foco
        await supabase.auth.refreshSession();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      subscription.subscription.unsubscribe();
      clearInterval(sessionCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadUserFromSession]);

  const loginWithTenantCode = useCallback(async (tenantCode: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { ok: false as const, error: error?.message || 'Falha no login' };
    }

    if ((data.user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      return { ok: true as const };
    }

    // Se tenantCode foi fornecido, verificar se o usuário pertence a esse tenant
    // Se não foi fornecido, apenas verificar se o usuário tem algum membership
    let query = supabase
      .from('my_memberships_with_tenant')
      .select('user_id, role, tenant_id, code, name');
    
    if (tenantCode && tenantCode.trim() !== '') {
      query = query.eq('code', tenantCode.toUpperCase());
    }
    
    const { data: memberships, error: membershipError } = await query.limit(1);

    if (membershipError || !memberships || memberships.length === 0) {
      await supabase.auth.signOut();
      const errorMsg = tenantCode 
        ? 'Código da imobiliária inválido para este usuário'
        : 'Usuário não possui vínculo com nenhuma imobiliária';
      return { ok: false as const, error: errorMsg };
    }

    return { ok: true as const };
  }, []);

  const registerWithTenantCode = useCallback(async (tenantCode: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) {
      return { ok: false as const, error: error?.message || 'Falha no cadastro' };
    }

    // Ensure we have a session; depending on email confirmation settings, session may be null.
    const sessionUserId = data.user.id;
    if (!sessionUserId) {
      return { ok: false as const, error: 'Falha no cadastro (usuário inválido)' };
    }

    // If email confirmation is enabled, user may not be authenticated yet.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { ok: false as const, error: 'Cadastro criado. Confirme seu email para continuar.' };
    }

    const { error: rpcError } = await supabase.rpc('join_tenant_by_code', { p_code: tenantCode });
    if (rpcError) {
      await supabase.auth.signOut();
      return { ok: false as const, error: rpcError.message || 'Erro ao vincular imobiliária' };
    }

    return { ok: true as const };
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem(OWNER_IMPERSONATION_KEY);
    localStorage.removeItem(AUTH_CACHE_KEY);
    await supabase.auth.signOut();
  }, []);

  const isGestao = useMemo(() => authState.user?.role === 'gestao', [authState.user?.role]);
  const isCorretor = useMemo(() => authState.user?.role === 'corretor', [authState.user?.role]);
  const isOwner = useMemo(() => Boolean(authState.user?.isOwner), [authState.user?.isOwner]);
  // Owner SEMPRE é admin quando está impersonando um tenant (tem acesso total)
  const isAdmin = useMemo(() => isGestao || isOwner, [isGestao, isOwner]);

  // Compat: keep the old method name used by login screens.
  const login = useCallback(async (tenantCode: string, email: string, password: string): Promise<boolean> => {
    const res = await loginWithTenantCode(tenantCode, email, password);
    return res.ok;
  }, [loginWithTenantCode]);

  return {
    ...authState,
    login,
    loginWithTenantCode,
    registerWithTenantCode,
    logout,
    corretores: CORRETORES,
    isGestao,
    isCorretor,
    isAdmin,
    isOwner,
    tenantCode: authState.user?.tenantCode,
    tenantName: authState.user?.tenantName,
    tenantId: authState.user?.tenantId
  };
};
