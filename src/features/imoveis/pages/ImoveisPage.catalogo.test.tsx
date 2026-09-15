/**
 * Catálogo: quem vê o botão Exportar e o que fica fora da lista.
 *
 * A página usa o useAuth legado, onde team_leader tem isAdmin=false — o gate de
 * exportação precisa olhar o systemRole, senão o líder perde o botão.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  role: 'admin' as string,
  tenantId: 't1' as string,
  xmlCarregando: false,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'u1@x.com', tenantId: h.tenantId, systemRole: h.role },
  }),
}));

const LOCAIS = [
  { id: 'l1', tenant_id: 't1', codigo_imovel: 'CA0001', titulo: 'Casa publicada', tipo_simplificado: 'casa', finalidade: 'venda', fotos: [], status_aprovacao: 'aprovado' },
  { id: 'l2', tenant_id: 't1', codigo_imovel: 'CA0002', titulo: 'Casa rascunho', tipo_simplificado: 'casa', finalidade: 'venda', fotos: [], status_aprovacao: 'rascunho' },
];

// Toda query da página termina em await; a cadeia devolve LOCAIS só para imoveis_locais.
vi.mock('@/lib/supabaseClient', () => {
  const tabela = (rows: unknown[]) => {
    const self: Record<string, unknown> = {};
    const resposta = () => Promise.resolve({ data: rows, error: null });
    Object.assign(self, {
      select: () => self,
      eq: () => self,
      not: () => self,
      order: resposta,
      then: (ok: (v: unknown) => unknown) => resposta().then(ok),
    });
    return self;
  };
  return {
    supabase: {
      from: (t: string) => tabela(t === 'imoveis_locais' ? LOCAIS : []),
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  };
});

vi.mock('../hooks/useImoveisData', () => ({
  useImoveisData: () => ({
    imoveis: [], isLoading: h.xmlCarregando, error: null, refetch: vi.fn(), isRefetching: false, sync: vi.fn(), bairros: [],
  }),
}));
vi.mock('../hooks/useCaptadores', () => ({ useCaptadores: () => ({ data: [] }), mapCaptadoresPorId: () => ({}) }));
vi.mock('@/contexts/NovoActionsContext', () => ({ useRegisterNovoActions: () => {} }));
vi.mock('@/components/imoveis/CriarImovelForm', () => ({ CriarImovelForm: () => null }));
vi.mock('@/components/imoveis/ImovelDetalhesModal', () => ({ ImovelDetalhesModal: () => null }));
vi.mock('@/components/imoveis/MeusImoveisTab', () => ({ MeusImoveisTab: () => null }));
vi.mock('@/components/imoveis/CondominiosTab', () => ({ CondominiosTab: () => null }));
vi.mock('@/components/imoveis/LancamentosTab', () => ({ LancamentosTab: () => null }));
vi.mock('@/components/imoveis/ConstrutorasTab', () => ({ ConstrutorasTab: () => null }));
vi.mock('@/components/imoveis/AnunciosSemImovelTab', () => ({ AnunciosSemImovelTab: () => null }));
vi.mock('@/components/imoveis/RascunhosTab', () => ({ RascunhosTab: () => null }));
vi.mock('@/components/imoveis/ImovelCard', () => ({
  ImovelCard: ({ imovel }: { imovel: { referencia: string } }) => <div>card:{imovel.referencia}</div>,
}));

import { ImoveisPage } from './ImoveisPage';

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/imoveis?tab=catalogo']}>
      <ImoveisPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.role = 'admin';
  h.tenantId = 't1';
  h.xmlCarregando = false;
});

describe('Catálogo de imóveis', () => {
  it('rascunho não aparece no catálogo', async () => {
    montar();
    expect(await screen.findByText('card:CA0001')).toBeInTheDocument();
    expect(screen.queryByText('card:CA0002')).not.toBeInTheDocument();
  });

  it.each(['admin', 'team_leader', 'owner'])('%s vê o botão Exportar', async (role) => {
    h.role = role;
    montar();
    await screen.findByText('card:CA0001');
    expect(screen.getByRole('button', { name: /exportar/i })).toBeEnabled();
  });

  // Com o XML ainda carregando a lista só tem os locais: exportaria uma planilha parcial.
  it('Exportar fica desabilitado enquanto o catálogo XML carrega', async () => {
    h.xmlCarregando = true;
    montar();
    // Os locais já chegaram ("Exibindo 1 de 1"), mas o XML não.
    await waitFor(() => expect(screen.getAllByText('1', { selector: 'strong' })).toHaveLength(2));
    expect(screen.getByRole('button', { name: /exportar/i })).toBeDisabled();
  });

  it('corretor não vê o botão Exportar', async () => {
    h.role = 'corretor';
    montar();
    await screen.findByText('card:CA0001');
    expect(screen.queryByRole('button', { name: /exportar/i })).not.toBeInTheDocument();
  });

  it('owner sem impersonar tenant não vê o botão Exportar', async () => {
    h.role = 'owner';
    h.tenantId = 'owner';
    montar();
    await screen.findByText('card:CA0001');
    expect(screen.queryByRole('button', { name: /exportar/i })).not.toBeInTheDocument();
  });
});
