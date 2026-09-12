/**
 * Quem vê o quê na aba "Prontos".
 *
 * `imoveis_corretores` só é escrita pelo sync do XML. Em tenant sem XML a tabela
 * fica vazia para sempre — e enquanto o gate de "ver tudo" daqui era só `owner`,
 * a aba aparecia vazia para a gestão mesmo com o catálogo cheio, escondendo até
 * os imóveis que ela própria cadastrou. O gate é o mesmo `isManager` que
 * loadAssignments usa para carregar as atribuições do tenant inteiro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  role: 'admin' as string,
  atribuicoes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-mariana', name: 'Mariana', email: 'mariana@x.com', tenantId: 't1', systemRole: h.role },
  }),
}));

// Duas tabelas, duas respostas. As duas queries terminam em .order() e são awaited.
vi.mock('@/lib/supabaseClient', () => {
  const tabela = (rows: unknown[]) => {
    const self: Record<string, unknown> = {};
    const resposta = () => Promise.resolve({ data: rows, error: null });
    Object.assign(self, {
      select: () => self,
      eq: () => self,
      order: resposta,
      then: (ok: (v: unknown) => unknown) => resposta().then(ok),
    });
    return self;
  };
  return {
    supabase: {
      from: (t: string) => tabela(t === 'imoveis_corretores' ? h.atribuicoes : [LOCAL]),
    },
  };
});

vi.mock('@/contexts/NovoActionsContext', () => ({ useRegisterNovoActions: () => {} }));
vi.mock('@/features/imoveis/services/xmlSyncService', () => ({
  syncImoveisForCorretor: vi.fn(async () => ({
    success: true, totalImoveis: 0, imoveisSincronizados: 0, corretoresEncontrados: 0, erros: [], diagnostico: [],
  })),
}));
vi.mock('./CriarImovelForm', () => ({ CriarImovelForm: () => null }));
vi.mock('./ImovelCard', () => ({
  ImovelCard: ({ imovel }: { imovel: { referencia: string } }) => <div>card:{imovel.referencia}</div>,
}));

// Imóvel cadastrado à mão por OUTRA pessoa: sem linha em imoveis_corretores.
const LOCAL = {
  id: 'l1',
  tenant_id: 't1',
  codigo_imovel: 'AP0688',
  titulo: 'Apto Centro',
  finalidade: 'venda',
  criado_por: 'outro-corretor',
  captador_id: 'outro-corretor',
  fotos: [],
  created_at: '2026-09-01T00:00:00Z',
};

// O pai (ImoveisPage) passa o catálogo já unido: XML + imoveis_locais.
const CATALOGO = [{ referencia: 'AP0688', titulo: 'Apto Centro', finalidade: 'venda' }];

const montar = () =>
  render(<MeusImoveisTab allImoveis={CATALOGO as never} />);

import { MeusImoveisTab } from './MeusImoveisTab';

beforeEach(() => {
  h.atribuicoes = [];
});

describe('Visibilidade da aba Prontos', () => {
  it('gestora (admin) vê o imóvel do tenant sem nenhuma linha em imoveis_corretores', async () => {
    h.role = 'admin';
    montar();
    expect(await screen.findByText('card:AP0688')).toBeInTheDocument();
    expect(screen.getByText(/1 imóvel da imobiliária/)).toBeInTheDocument();
  });

  it('gestor de equipe (team_leader) também vê — mesmo gate de loadAssignments', async () => {
    h.role = 'team_leader';
    montar();
    expect(await screen.findByText('card:AP0688')).toBeInTheDocument();
  });

  it('corretor sem atribuição continua sem ver imóvel de outro', async () => {
    h.role = 'corretor';
    montar();
    await waitFor(() => expect(screen.getByText(/ainda não tem imóveis atribuídos/i)).toBeInTheDocument());
    expect(screen.queryByText('card:AP0688')).not.toBeInTheDocument();
  });

  it('corretor com o código atribuído vê o imóvel', async () => {
    h.role = 'corretor';
    h.atribuicoes = [{ id: 'a1', codigo_imovel: 'AP0688', corretor_id: 'u-mariana', corretor_nome: 'Mariana', corretor_telefone: null, created_at: '2026-09-01T00:00:00Z' }];
    montar();
    expect(await screen.findByText('card:AP0688')).toBeInTheDocument();
  });
});
