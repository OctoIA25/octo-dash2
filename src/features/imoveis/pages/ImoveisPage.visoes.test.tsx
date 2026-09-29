/**
 * Prontos e Rascunhos saíram do topo e viraram botões DENTRO do Catálogo
 * Completo (pedido do chefe, 29/09).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  role: 'admin' as string,
  tenantId: 't1' as string,
  xmlCarregando: false,
  extras: [] as unknown[],
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

// Só os testes do filtro de aprovação querem este: os outros contam cards.
const AGUARDANDO = { id: 'l3', tenant_id: 't1', codigo_imovel: 'CA0003', titulo: 'Casa aguardando', tipo_simplificado: 'casa', finalidade: 'venda', fotos: [], status_aprovacao: 'aguardando' };

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
      from: (t: string) => tabela(t === 'imoveis_locais' ? [...LOCAIS, ...h.extras] : []),
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
vi.mock('@/components/imoveis/MeusImoveisTab', () => ({ MeusImoveisTab: () => <div>tela:prontos</div> }));
vi.mock('@/components/imoveis/CondominiosTab', () => ({ CondominiosTab: () => null }));
vi.mock('@/components/imoveis/LancamentosTab', () => ({ LancamentosTab: () => null }));
vi.mock('@/components/imoveis/ConstrutorasTab', () => ({ ConstrutorasTab: () => null }));
vi.mock('@/components/imoveis/AnunciosSemImovelTab', () => ({ AnunciosSemImovelTab: () => null }));
vi.mock('@/components/imoveis/RascunhosTab', () => ({ RascunhosTab: () => <div>tela:rascunhos</div> }));
vi.mock('@/components/imoveis/ImovelCard', () => ({
  ImovelCard: ({ imovel }: { imovel: { referencia: string } }) => <div>card:{imovel.referencia}</div>,
}));

import { ImoveisPage } from './ImoveisPage';

let url = '';
const Espiao = () => {
  const l = useLocation();
  url = l.pathname + l.search;
  return null;
};

const montar = (endereco: string) =>
  render(
    <MemoryRouter initialEntries={[endereco]}>
      <ImoveisPage />
      <Espiao />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.role = 'admin';
  h.tenantId = 't1';
  h.xmlCarregando = false;
  h.extras = [];
});

describe('as visões do Catálogo Completo', () => {
  it('abre no catálogo completo, com os três botões', async () => {
    montar('/imoveis?tab=catalogo');
    expect(await screen.findByText('card:CA0001')).toBeInTheDocument();
    for (const r of ['Catálogo completo', 'Prontos', 'Rascunhos']) {
      expect(screen.getByRole('tab', { name: r })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: 'Catálogo completo' })).toHaveAttribute('aria-selected', 'true');
  });

  it('o botão Prontos troca a tela sem sair de ?tab=catalogo', async () => {
    montar('/imoveis?tab=catalogo');
    fireEvent.click(await screen.findByRole('tab', { name: 'Prontos' }));
    expect(await screen.findByText('tela:prontos')).toBeInTheDocument();
    expect(screen.queryByText('card:CA0001')).not.toBeInTheDocument();
    expect(url).toBe('/imoveis?tab=catalogo&ver=prontos');
  });

  it('o botão Rascunhos também', async () => {
    montar('/imoveis?tab=catalogo');
    fireEvent.click(await screen.findByRole('tab', { name: 'Rascunhos' }));
    expect(await screen.findByText('tela:rascunhos')).toBeInTheDocument();
    expect(url).toBe('/imoveis?tab=catalogo&ver=rascunhos');
  });

  it('link antigo ?tab=meus-imoveis abre Prontos e passa ao endereço novo', async () => {
    montar('/imoveis?tab=meus-imoveis');
    expect(await screen.findByText('tela:prontos')).toBeInTheDocument();
    expect(url).toBe('/imoveis?tab=catalogo&ver=prontos');
  });

  it('link antigo ?tab=rascunhos abre Rascunhos', async () => {
    montar('/imoveis?tab=rascunhos');
    expect(await screen.findByText('tela:rascunhos')).toBeInTheDocument();
    expect(url).toBe('/imoveis?tab=catalogo&ver=rascunhos');
  });
});
