/**
 * AuthContext - Contexto global de autenticação
 * 
 * Este contexto garante que o estado de autenticação seja compartilhado
 * entre todos os componentes da aplicação, resolvendo o problema de
 * cada instância do useAuth() ter seu próprio estado independente.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  SidebarPermission,
  ADMIN_SIDEBAR_PERMISSIONS,
  CORRETOR_SIDEBAR_PERMISSIONS,
  OWNER_SIDEBAR_PERMISSIONS,
  TEAM_LEADER_SIDEBAR_PERMISSIONS,
  TeamColor
} from '@/types/permissions';

const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

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

  const loadUserFromSession = useCallback(async () => {
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

      // Verificar se é owner
      if ((session.user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase()) {

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
          loadUserFromSession();
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

    if ((data.user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase()) {
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
    await supabase.auth.signOut();
    setAuthState({ isAuthenticated: false, user: null, isLoading: false });
  }, []);

  const reloadUser = useCallback(async () => {
    isLoadingSession = false;
    await loadUserFromSession();
  }, [loadUserFromSession]);

  // Derivar valores
  const isOwner = useMemo(() => {
    return authState.user?.systemRole === 'owner' ||
      (authState.user?.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
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
