/**
 * AuthContext - Contexto global de autenticação
 * 
 * Este contexto garante que o estado de autenticação seja compartilhado
 * entre todos os componentes da aplicação, resolvendo o problema de
 * cada instância do useAuth() ter seu próprio estado independente.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { clearAllXmlStorage } from '@/features/imoveis/services/imoveisXmlService';
import {
  SidebarPermission,
  ADMIN_SIDEBAR_PERMISSIONS,
  CORRETOR_SIDEBAR_PERMISSIONS,
  OWNER_SIDEBAR_PERMISSIONS,
  TEAM_LEADER_SIDEBAR_PERMISSIONS,
  TeamColor
} from '@/types/permissions';
import { isOwnerEmail } from '@/lib/ownerEmails';

 const OWNER_IMPERSONATION_KEY = 'owner-impersonation';

// Tipos
export type SystemRole = 'owner' | 'admin' | 'team_leader' | 'corretor';
export type UserRole = 'gestao' | 'corretor';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  systemRole: SystemRole;
  name: string;
  tenantId?: string;
  tenantCode?: string;
  tenantName?: string;
  sidebarPermissions: SidebarPermission[];
  tenantAllowedFeatures?: SidebarPermission[];
  permissions?: any;
  equipe?: TeamColor;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (tenantCode: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isGestao: boolean;
  isCorretor: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  tenantCode?: string;
  tenantName?: string;
  tenantId?: string;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

let isLoadingSession = false;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true
  });
  const authStateRef = useRef(authState);

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  const getSidebarPermissions = useCallback((
    role: string,
    isOwnerUser: boolean,
    permissions?: any
  ): SidebarPermission[] => {
    if (isOwnerUser) {
      return [...OWNER_SIDEBAR_PERMISSIONS];
    }

    if (permissions?.sidebar_permissions && Array.isArray(permissions.sidebar_permissions)) {
      return permissions.sidebar_permissions;
    }

    switch (role) {
      case 'admin':
        return [...ADMIN_SIDEBAR_PERMISSIONS];
      case 'team_leader':
        return [...TEAM_LEADER_SIDEBAR_PERMISSIONS];
      case 'corretor':
      default:
        return [...CORRETOR_SIDEBAR_PERMISSIONS];
    }
  }, []);

  // `background: true` = refresh silencioso (volta de foco, token renovado).
  // Nesse modo, falhas transitórias (rede, 401 durante refresh de token) NÃO
  // podem deslogar nem derrubar isAuthenticated — senão cancelar um seletor
  // de arquivos nativo (que devolve o foco à janela) descartava a sessão e o
  // CRM inteiro desmontava no meio do uso. Em background, só atualizamos o
  // estado quando a recarga tem SUCESSO; revogação real continua coberta pelo
  // RLS nas queries e pela checagem completa no próximo load.
  const loadUserFromSession = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background === true;
    if (isLoadingSession) {
      return;
    }
    isLoadingSession = true;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (background) return;
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      const session = sessionData.session;
      if (!session?.user) {
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      // Verificar se é owner
      if (isOwnerEmail(session.user.email)) {

        const rawImpersonation = localStorage.getItem(OWNER_IMPERSONATION_KEY);
        let tenantInfo: { tenantId: string; tenantCode: string; tenantName: string } = {
          tenantId: 'owner',
          tenantCode: 'OWNER',
          tenantName: 'Owner'
        };

        if (rawImpersonation) {
          try {
            const parsed = JSON.parse(rawImpersonation) as Partial<typeof tenantInfo>;
            if (parsed?.tenantId && parsed?.tenantCode && parsed?.tenantName) {
              tenantInfo = {
                tenantId: parsed.tenantId,
                tenantCode: parsed.tenantCode,
                tenantName: parsed.tenantName
              };
            }
          } catch {
            // ignore
          }
        }

        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: {
            id: session.user.id,
            email: session.user.email || '',
            role: 'gestao',
            systemRole: 'owner',
            name: 'Owner',
            tenantId: tenantInfo.tenantId,
            tenantCode: tenantInfo.tenantCode,
            tenantName: tenantInfo.tenantName,
            sidebarPermissions: getSidebarPermissions('owner', true),
            tenantAllowedFeatures: undefined
          }
        });
        return;
      }

      // Buscar membership do usuário ATUAL
      const { data: memberships, error: membershipError } = await supabase
        .from('my_memberships_with_tenant')
        .select('user_id, role, tenant_id, code, name')
        .eq('user_id', session.user.id)
        .limit(1);

      if (membershipError || !memberships || memberships.length === 0) {
        console.warn('⚠️ [AuthContext] Nenhum membership encontrado');
        // Refresh silencioso: pode ser um erro transitório (rede/JWT em
        // renovação) — mantém a sessão atual em vez de deslogar o usuário.
        if (background) return;
        await supabase.auth.signOut();
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

      const membership = memberships[0];

      // Mapear role
      const mappedRole: UserRole = membership.role === 'corretor' ? 'corretor' : 'gestao';
      const systemRole: SystemRole = membership.role as SystemRole;

      // Buscar permissões do usuário
      let userPermissions: any = null;
      const { data: permData } = await supabase
        .from('tenant_memberships')
        .select('permissions')
        .eq('user_id', session.user.id)
        .eq('tenant_id', membership.tenant_id)
        .maybeSingle();

      if (permData?.permissions) {
        userPermissions = permData.permissions;
      }

      const sidebarPerms = getSidebarPermissions(membership.role, false, userPermissions);

      // Buscar permissões do tenant usando RPC para contornar RLS
      const previousTenantAllowedFeatures = authStateRef.current.user?.tenantId === membership.tenant_id
        ? authStateRef.current.user.tenantAllowedFeatures
        : undefined;
      let tenantAllowedFeatures: SidebarPermission[] | undefined = previousTenantAllowedFeatures;
      try {
        // Tentar buscar diretamente primeiro
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('allowed_features')
          .eq('id', membership.tenant_id)
          .maybeSingle();

        if (tenantError) {
        } else if (Array.isArray(tenantData?.allowed_features)) {
          tenantAllowedFeatures = tenantData.allowed_features as SidebarPermission[];
        }
      } catch (e) {
      }

      setAuthState({
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
      });
    } finally {
      isLoadingSession = false;
    }
  }, [getSidebarPermissions]);

  useEffect(() => {
    loadUserFromSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => {
          isLoadingSession = false;
          // TOKEN_REFRESHED acontece com o usuário em plena sessão: a recarga
          // é silenciosa e não pode deslogar por falha transitória.
          loadUserFromSession({ background: event === 'TOKEN_REFRESHED' });
        }, 100);
      } else if (event === 'SIGNED_OUT') {
        isLoadingSession = false;
        setAuthState({ isAuthenticated: false, user: null, isLoading: false });
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [loadUserFromSession]);

  const login = useCallback(async (tenantCode: string, email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return false;
    }

    if (isOwnerEmail(data.user.email)) {
      return true;
    }

    let query = supabase
      .from('my_memberships_with_tenant')
      .select('user_id, role, tenant_id, code, name');

    if (tenantCode && tenantCode.trim() !== '') {
      query = query.eq('code', tenantCode.toUpperCase());
    }

    const { data: memberships, error: membershipError } = await query.limit(1);

    if (membershipError || !memberships || memberships.length === 0) {
      await supabase.auth.signOut();
      return false;
    }

    return true;
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem('owner-impersonation');
    clearAllXmlStorage();
    await supabase.auth.signOut();
    setAuthState({ isAuthenticated: false, user: null, isLoading: false });
  }, []);

  const reloadUser = useCallback(async () => {
    isLoadingSession = false;
    // Disparado por foco/visibilidade da janela (ex.: ao fechar o seletor de
    // arquivos nativo) — sempre silencioso.
    await loadUserFromSession({ background: true });
  }, [loadUserFromSession]);

  // Recarrega permissões (sidebar_permissions / allowed_features) quando o usuário
  // volta à aba, sem precisar deslogar. Cobre o caso de um admin/owner conceder
  // acesso (ex.: Jurídico) enquanto o usuário-alvo está com a sessão aberta.
  useEffect(() => {
    const REFRESH_THROTTLE_MS = 10_000;
    let lastReload = 0;

    const maybeReload = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (!authStateRef.current.isAuthenticated) return;
      const now = Date.now();
      if (now - lastReload < REFRESH_THROTTLE_MS) return;
      lastReload = now;
      void reloadUser();
    };

    // Apenas 'visibilitychange' (retorno real à aba). Evita o 'focus' da janela,
    // que o seletor de arquivos nativo dispara sem esconder a aba — era um dos
    // gatilhos do reload de auth que esvaziava modais abertos (tela branca ao
    // cancelar o envio de PDF). Ver nota equivalente em hooks/useAuth.ts.
    document.addEventListener('visibilitychange', maybeReload);
    return () => {
      document.removeEventListener('visibilitychange', maybeReload);
    };
  }, [reloadUser]);

  // Derivar valores
  const isOwner = useMemo(() => {
    return authState.user?.systemRole === 'owner' ||
      isOwnerEmail(authState.user?.email);
  }, [authState.user]);

  const isGestao = useMemo(() => {
    return authState.user?.role === 'gestao' || isOwner;
  }, [authState.user?.role, isOwner]);

  const isCorretor = useMemo(() => {
    return authState.user?.role === 'corretor';
  }, [authState.user?.role]);

  const isAdmin = useMemo(() => isGestao || isOwner, [isGestao, isOwner]);

  const value: AuthContextType = {
    ...authState,
    login,
    logout,
    reloadUser,
    isGestao,
    isCorretor,
    isAdmin,
    isOwner,
    tenantCode: authState.user?.tenantCode,
    tenantName: authState.user?.tenantName,
    tenantId: authState.user?.tenantId
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
