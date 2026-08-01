/**
 * ViewAsContext — "visualizar como": Owner/Admin veem o dashboard com o recorte
 * de outro usuário do mesmo tenant, sem deslogar e sem trocar de permissão.
 *
 * Regras (deliberadas, não simplificações):
 *  - afeta LEITURA. Escritas continuam com o usuário real — nenhum código de
 *    escrita muda, então a auditoria segue correta e não há escalada de privilégio.
 *  - NÃO altera sidebarPermissions, allowed_features nem rotas: a navegação
 *    continua sendo a do usuário real.
 *  - vive em sessionStorage por aba+tenant. Sobrevive a F5 e à navegação, morre
 *    ao fechar a aba — o oposto do `owner-impersonation` (localStorage), que
 *    sobrevive indefinidamente e é fácil de esquecer ligado.
 *
 * A autorização real é do servidor: a lista sai de GET /api/v1/view-as/users e
 * todo `agentId` enviado à API é revalidado a cada request (server/viewAs).
 * O gate daqui é de UX — esconder o que o usuário não pode usar.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuthContext } from '@/contexts/AuthContext';

export interface ViewAsTarget {
  userId: string;
  name: string;
  email: string;
  /** Role no tenant: 'admin' | 'team_leader' | 'corretor'. */
  role: string;
}

interface ViewAsContextValue {
  target: ViewAsTarget | null;
  canViewAsOthers: boolean;
  viewAs: (target: ViewAsTarget) => void;
  clear: () => void;
}

const ViewAsContext = createContext<ViewAsContextValue>({
  target: null,
  canViewAsOthers: false,
  viewAs: () => {},
  clear: () => {},
});

const STORAGE_PREFIX = 'view-as:';

/** Chave por tenant: trocar de tenant nunca herda o contexto do anterior. */
function storageKey(tenantId?: string): string {
  return `${STORAGE_PREFIX}${tenantId ?? ''}`;
}

function readStored(tenantId?: string): ViewAsTarget | null {
  try {
    const raw = sessionStorage.getItem(storageKey(tenantId));
    const parsed = raw ? (JSON.parse(raw) as Partial<ViewAsTarget>) : null;
    return parsed?.userId ? (parsed as ViewAsTarget) : null;
  } catch {
    return null;
  }
}

function writeStored(tenantId: string | undefined, target: ViewAsTarget | null): void {
  try {
    if (target) sessionStorage.setItem(storageKey(tenantId), JSON.stringify(target));
    else sessionStorage.removeItem(storageKey(tenantId));
  } catch {
    // sessionStorage indisponível (modo privado/quota): o contexto vira só-memória.
  }
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { user, isOwner, tenantId } = useAuthContext();

  // Owner precisa ter entrado num tenant (tenantId === 'owner' é o dashboard
  // de plataforma, onde não existem membros para assumir).
  const canViewAsOthers = Boolean(
    (isOwner || user?.systemRole === 'admin') && tenantId && tenantId !== 'owner',
  );

  const [target, setTarget] = useState<ViewAsTarget | null>(null);

  // Restaura o contexto da aba ao montar/trocar de tenant, e o descarta assim
  // que a permissão some (ex.: admin rebaixado a corretor entre sessões).
  useEffect(() => {
    setTarget(canViewAsOthers ? readStored(tenantId) : null);
  }, [canViewAsOthers, tenantId]);

  const viewAs = useCallback(
    (next: ViewAsTarget) => {
      setTarget(next);
      writeStored(tenantId, next);
    },
    [tenantId],
  );

  const clear = useCallback(() => {
    setTarget(null);
    writeStored(tenantId, null);
  }, [tenantId]);

  const value = useMemo(
    () => ({ target, canViewAsOthers, viewAs, clear }),
    [target, canViewAsOthers, viewAs, clear],
  );

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs(): ViewAsContextValue {
  return useContext(ViewAsContext);
}

export interface EffectiveUser {
  id: string | undefined;
  name: string;
  email: string;
  /** Enxerga o tenant inteiro (gestão) ou só o próprio recorte (corretor). */
  isAdmin: boolean;
  isViewingAs: boolean;
  /** Id a enviar às rotas que aceitam acting user; null quando é o próprio usuário. */
  actingUserId: string | null;
}

/**
 * Identidade a usar em LEITURA de dados. Sem contexto ativo devolve o usuário
 * real — por isso as telas podem trocar `useAuthContext()` por este hook sem
 * condicional espalhada.
 */
export function useEffectiveUser(): EffectiveUser {
  const { user, isAdmin } = useAuthContext();
  const { target } = useViewAs();

  if (!target) {
    return {
      id: user?.id,
      name: user?.name ?? '',
      email: user?.email ?? '',
      isAdmin,
      isViewingAs: false,
      actingUserId: null,
    };
  }

  return {
    id: target.userId,
    name: target.name,
    email: target.email,
    // Mesmo mapeamento do AuthContext: só 'corretor' é escopo individual;
    // admin e team_leader caem em 'gestao'.
    isAdmin: target.role !== 'corretor',
    isViewingAs: true,
    actingUserId: target.userId,
  };
}
