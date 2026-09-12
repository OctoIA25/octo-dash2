/**
 * "IMÓVEIS DE INTERESSE" no modal do lead dizia "Não encontrado no catálogo"
 * para código que existe na aba Imóveis (CA054, do Lotus).
 *
 * A seção montava o catálogo com `getTenantImoveis` — só o XML do tenant. Imóvel
 * cadastrado pelo botão "Novo Imóvel" vive em `imoveis_locais` e nunca entrava,
 * então TODO imóvel local caía no texto de não encontrado. O catálogo completo
 * (XML + banco) é `fetchCatalogoImoveis`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const catalogo = vi.fn();
const interesses = vi.fn();
const lancamentos = vi.fn();

vi.mock('@/features/imoveis/services/catalogoImoveisService', () => ({
  fetchCatalogoImoveis: (...args: unknown[]) => catalogo(...args),
}));

vi.mock('@/features/imoveis/services/lancamentosLookup', async () => {
  const real = await vi.importActual<typeof import('@/features/imoveis/services/lancamentosLookup')>(
    '@/features/imoveis/services/lancamentosLookup',
  );
  return { ...real, fetchLancamentosRef: (...args: unknown[]) => lancamentos(...args) };
});

vi.mock('../services/leadsService', async () => {
  const real = await vi.importActual<typeof import('../services/leadsService')>('../services/leadsService');
  return { ...real, fetchImoveisDeInteresse: (...args: unknown[]) => interesses(...args) };
});

vi.mock('@/lib/supabaseClient', () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    self.update = () => self;
    self.eq = () => self;
    self.select = async () => ({ data: [{ id: 'lead-1' }], error: null });
    return self;
  };
  return {
    supabase: {
      from: () => chain(),
      auth: { getUser: async () => ({ data: { user: { id: 'u1', user_metadata: {} } } }) },
    },
  };
});

// O modal de detalhes real depende de react-query/auth; aqui só interessa que
// o clique no card leve o imóvel certo até ele.
vi.mock('@/components/imoveis/ImovelDetalhesModal', () => ({
  ImovelDetalhesModal: ({ imovel }: { imovel: { referencia: string } | null }) => (
    <div>detalhes:{imovel?.referencia}</div>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isGestao: true, user: { role: 'admin', name: 'Victor' }, tenantId: 't1' }),
}));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import type { KanbanLead } from '../services/leadsService';

const LEAD = {
  id: 'lead-1',
  nomedolead: 'Fulano',
  lead: '11999999999',
  codigo: 'CA054',
  temperature: 'Morno',
} as unknown as KanbanLead;

/** CA054 como ele vem de imoveis_locais, já convertido para o catálogo. */
const CA054 = {
  referencia: 'CA054',
  titulo: 'Casa com 3 dormitórios à venda na Colônia, Jundiaí-SP',
  bairro: 'Jardim Colonial',
  cidade: 'Jundiaí',
  valor_venda: 790000,
  valor_locacao: 0,
  fotos: [],
};

beforeEach(() => {
  catalogo.mockReset();
  interesses.mockReset();
  lancamentos.mockReset();
  lancamentos.mockResolvedValue([]);
  interesses.mockResolvedValue([{ codigo: 'CA054', portal: 'Imovelweb', data: '2026-09-10' }]);
});

const abrirSecao = async () => {
  render(<CriarLeadQuickModal isOpen onClose={vi.fn()} tenantId="t1" editingLead={LEAD} />);
  fireEvent.click(screen.getByRole('button', { name: /Ver todos/i }));
};

describe('Imóveis de interesse — catálogo', () => {
  it('mostra o imóvel que só existe em imoveis_locais (o bug do CA054)', async () => {
    catalogo.mockResolvedValue([CA054]);

    await abrirSecao();

    await waitFor(() =>
      expect(
        screen.getByText('Casa com 3 dormitórios à venda na Colônia, Jundiaí-SP'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Não encontrado no catálogo')).not.toBeInTheDocument();
    expect(screen.getByText('Jardim Colonial, Jundiaí')).toBeInTheDocument();
    expect(screen.getByText('R$ 790.000')).toBeInTheDocument();
  });

  it('lê o catálogo completo do tenant, não só o XML', async () => {
    catalogo.mockResolvedValue([CA054]);

    await abrirSecao();

    await waitFor(() => expect(catalogo).toHaveBeenCalledWith('t1'));
  });

  it('clicar no imóvel de interesse abre os detalhes do imóvel', async () => {
    catalogo.mockResolvedValue([CA054]);

    await abrirSecao();

    const card = await screen.findByTitle('Ver imóvel CA054');
    fireEvent.click(card);

    expect(screen.getByText('detalhes:CA054')).toBeInTheDocument();
  });

  it('imóvel de lançamento aponta para a página do lançamento', async () => {
    catalogo.mockResolvedValue([]);
    interesses.mockResolvedValue([{ codigo: 'RESERVA CASTANHEIRA', portal: 'Facebook', data: '2026-09-10' }]);
    lancamentos.mockResolvedValue([{ id: 'lanc-1', nome: 'Reserva Castanheira' }]);

    await abrirSecao();

    const link = await screen.findByTitle('Ver lançamento Reserva Castanheira');
    expect(link).toHaveAttribute('href', '/imoveis/lancamentos/lanc-1');
    expect(screen.queryByText('Não encontrado no catálogo')).not.toBeInTheDocument();
  });

  it('código que não existe em nenhuma das duas fontes segue avisando', async () => {
    catalogo.mockResolvedValue([]);

    await abrirSecao();

    await waitFor(() =>
      expect(screen.getByText('Não encontrado no catálogo')).toBeInTheDocument(),
    );
  });
});
