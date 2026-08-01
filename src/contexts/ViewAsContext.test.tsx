import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ViewAsProvider, useEffectiveUser, useViewAs, type ViewAsTarget } from './ViewAsContext';

const REAL_USER = { id: 'admin-1', email: 'admin@imob.com', name: 'admin@imob.com', systemRole: 'admin' };

let authState = {
  user: REAL_USER as Record<string, unknown> | null,
  isAdmin: true,
  isOwner: false,
  tenantId: 'tenant-a' as string | undefined,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => authState,
}));

const JOAO: ViewAsTarget = {
  userId: 'corretor-joao',
  name: 'João Silva',
  email: 'joao@imob.com',
  role: 'corretor',
};

const wrapper = ({ children }: { children: ReactNode }) => <ViewAsProvider>{children}</ViewAsProvider>;

/** Renderiza os dois hooks juntos — é assim que a UI os consome. */
function renderViewAs() {
  return renderHook(() => ({ ctx: useViewAs(), effective: useEffectiveUser() }), { wrapper });
}

describe('ViewAsContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
    authState = { user: REAL_USER, isAdmin: true, isOwner: false, tenantId: 'tenant-a' };
  });

  it('sem contexto ativo devolve o usuário real', () => {
    const { result } = renderViewAs();
    expect(result.current.effective).toMatchObject({
      id: 'admin-1',
      email: 'admin@imob.com',
      isAdmin: true,
      isViewingAs: false,
      actingUserId: null,
    });
  });

  it('selecionar um corretor troca a identidade de leitura e o escopo', () => {
    const { result } = renderViewAs();
    act(() => result.current.ctx.viewAs(JOAO));

    expect(result.current.effective).toMatchObject({
      id: 'corretor-joao',
      name: 'João Silva',
      isAdmin: false, // corretor = escopo individual
      isViewingAs: true,
      actingUserId: 'corretor-joao',
    });
  });

  it('visualizar como outro admin mantém o escopo de gestão', () => {
    const { result } = renderViewAs();
    act(() => result.current.ctx.viewAs({ ...JOAO, role: 'admin' }));
    expect(result.current.effective.isAdmin).toBe(true);
  });

  it('voltar para "meu usuário" restaura o usuário real', () => {
    const { result } = renderViewAs();
    act(() => result.current.ctx.viewAs(JOAO));
    act(() => result.current.ctx.clear());

    expect(result.current.effective).toMatchObject({
      id: 'admin-1',
      isViewingAs: false,
      actingUserId: null,
    });
  });

  it('o usuário AUTENTICADO nunca muda — só o contexto de leitura', () => {
    const { result } = renderViewAs();
    act(() => result.current.ctx.viewAs(JOAO));
    // authState é a fonte do usuário real e segue intacta.
    expect(authState.user).toBe(REAL_USER);
  });

  it('persiste na aba: remontar mantém o contexto', () => {
    const first = renderViewAs();
    act(() => first.result.current.ctx.viewAs(JOAO));
    first.unmount();

    const second = renderViewAs();
    expect(second.result.current.effective.actingUserId).toBe('corretor-joao');
  });

  it('trocar de tenant não herda o contexto do tenant anterior', () => {
    const first = renderViewAs();
    act(() => first.result.current.ctx.viewAs(JOAO));
    first.unmount();

    authState = { ...authState, tenantId: 'tenant-b' };
    const second = renderViewAs();
    expect(second.result.current.effective.isViewingAs).toBe(false);
  });

  it('corretor não pode usar o seletor nem herdar contexto persistido', () => {
    const admin = renderViewAs();
    act(() => admin.result.current.ctx.viewAs(JOAO));
    admin.unmount();

    authState = {
      user: { id: 'corretor-1', email: 'c@imob.com', name: 'c', systemRole: 'corretor' },
      isAdmin: false,
      isOwner: false,
      tenantId: 'tenant-a',
    };
    const corretor = renderViewAs();

    expect(corretor.result.current.ctx.canViewAsOthers).toBe(false);
    expect(corretor.result.current.effective.isViewingAs).toBe(false);
    expect(corretor.result.current.effective.id).toBe('corretor-1');
  });

  it('owner sem tenant selecionado não vê o seletor', () => {
    authState = {
      user: { id: 'owner-1', email: 'owner@octo.com', name: 'Owner', systemRole: 'owner' },
      isAdmin: true,
      isOwner: true,
      tenantId: 'owner',
    };
    const { result } = renderViewAs();
    expect(result.current.ctx.canViewAsOthers).toBe(false);
  });
});
