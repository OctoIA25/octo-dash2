import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuthContext } from './AuthContext';

// Regressão da "tela branca ao cancelar o seletor de arquivos": o retorno de
// foco da janela dispara um reload de sessão em background; uma falha
// transitória nesse reload NÃO pode deslogar o usuário nem derrubar
// isAuthenticated (o que desmontava o CRM inteiro no meio do uso).

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
}));
let membershipShouldFail = false;

const membershipRow = {
  user_id: 'user-1',
  role: 'admin',
  tenant_id: 'tenant-1',
  code: 'T1',
  name: 'Imobiliária Teste',
};

const queryResult = (table: string) => {
  if (table === 'my_memberships_with_tenant') {
    return membershipShouldFail
      ? { data: null, error: { message: 'JWT expired' } }
      : { data: [membershipRow], error: null };
  }
  if (table === 'tenant_memberships') return { data: null, error: null };
  if (table === 'tenants') return { data: { allowed_features: null }, error: null };
  return { data: null, error: null };
};

// Builder encadeável (select/eq/limit/maybeSingle) que resolve como Promise.
const buildQuery = (table: string) => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.limit = self;
  chain.maybeSingle = () => Promise.resolve(queryResult(table));
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(queryResult(table)).then(resolve);
  return chain;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: {
            session: { user: { id: 'user-1', email: 'corretor@imob.com' } },
          },
          error: null,
        }),
      ),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: signOutMock,
    },
    from: vi.fn((table: string) => buildQuery(table)),
  },
}));

vi.mock('@/features/imoveis/services/imoveisXmlService', () => ({
  clearAllXmlStorage: vi.fn(),
}));

const Probe = () => {
  const { isAuthenticated, isLoading } = useAuthContext();
  if (isLoading) return <p>carregando</p>;
  return <p>{isAuthenticated ? 'autenticado' : 'deslogado'}</p>;
};

describe('AuthContext — reload de sessão em background', () => {
  beforeEach(() => {
    membershipShouldFail = false;
    signOutMock.mockClear();
  });

  it('mantém a sessão quando o reload disparado pelo foco falha transitoriamente', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText('autenticado')).toBeInTheDocument();

    // A próxima consulta de membership falha (ex.: 401 durante refresh de
    // token) exatamente quando a janela recupera o foco — caso do usuário
    // cancelando o seletor de arquivos nativo.
    membershipShouldFail = true;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('autenticado')).toBeInTheDocument();
    });
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
