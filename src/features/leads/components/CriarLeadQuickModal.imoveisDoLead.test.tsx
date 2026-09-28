/**
 * O corretor acrescenta imóveis ao lead — um ou mais — e o lead que tem
 * imóvel nunca fica sem nenhum.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const adicionar = vi.fn();
const extras = vi.fn();
const remover = vi.fn();
const update = vi.fn();

vi.mock('../services/leadsService', async () => {
  const real = await vi.importActual<typeof import('../services/leadsService')>('../services/leadsService');
  return {
    ...real,
    adicionarImovelAoLead: (...a: unknown[]) => adicionar(...a),
    fetchImoveisExtrasDoLead: (...a: unknown[]) => extras(...a),
    removerImovelExtraDoLead: (...a: unknown[]) => remover(...a),
  };
});

vi.mock('@/lib/supabaseClient', () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    self.update = (p: unknown) => { update(p); return self; };
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

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));
// O próprio corretor: não é gestão, edita porque o lead é dele.
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isGestao: false, user: { id: 'u1', role: 'corretor', name: 'Ana' }, tenantId: 't1' }),
}));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import type { KanbanLead } from '../services/leadsService';

const lead = (codigo: string) =>
  ({ id: 'lead-1', nomedolead: 'Fulano', lead: '11999999999', codigo, temperature: 'Morno' }) as unknown as KanbanLead;

const abrir = (codigo: string) =>
  render(<CriarLeadQuickModal isOpen onClose={vi.fn()} tenantId="t1" editingLead={lead(codigo)} permitirEdicao />);

const campoCodigo = () => screen.getByPlaceholderText('Ex: AP0929') as HTMLInputElement;

beforeEach(() => {
  adicionar.mockReset();
  extras.mockReset().mockResolvedValue([]);
  remover.mockReset().mockResolvedValue(undefined);
  update.mockReset();
});

describe('imóveis do lead', () => {
  it('lead sem imóvel: o corretor adiciona o primeiro, e ele aparece no campo', async () => {
    adicionar.mockResolvedValue('principal');
    abrir('');

    fireEvent.change(screen.getByLabelText('Adicionar o primeiro imóvel'), { target: { value: 'ap10' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar o primeiro imóvel/ }));

    await waitFor(() => expect(campoCodigo().value).toBe('AP10'));
    expect(adicionar).toHaveBeenCalledWith({ tenantId: 't1', leadId: 'lead-1', principal: '', codigo: 'AP10' });
    // Com um, o botão passa a oferecer MAIS um.
    expect(screen.getByRole('button', { name: /Adicionar mais um imóvel/ })).toBeInTheDocument();
  });

  it('lead com imóvel: adiciona mais um, que entra na lista', async () => {
    adicionar.mockResolvedValue('extra');
    abrir('AP10');
    extras.mockResolvedValue([{ id: 'x1', codigo: 'CA20', criadoEm: '2026-09-28' }]);

    fireEvent.change(screen.getByLabelText('Adicionar mais um imóvel'), { target: { value: 'ca20' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar mais um imóvel/ }));

    expect(await screen.findByText('CA20')).toBeInTheDocument();
    expect(adicionar).toHaveBeenCalledWith({ tenantId: 't1', leadId: 'lead-1', principal: 'AP10', codigo: 'CA20' });
  });

  it('um extra pode sair; o principal fica', async () => {
    extras.mockResolvedValue([{ id: 'x1', codigo: 'CA20', criadoEm: '2026-09-28' }]);
    abrir('AP10');

    fireEvent.click(await screen.findByLabelText('Remover CA20'));

    await waitFor(() => expect(screen.queryByText('CA20')).not.toBeInTheDocument());
    expect(remover).toHaveBeenCalledWith('x1');
    expect(campoCodigo().value).toBe('AP10');
  });

  it('apagar o código de um lead que tinha imóvel não salva', async () => {
    abrir('AP10');

    fireEvent.change(campoCodigo(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(await screen.findByText(/precisa de pelo menos um imóvel/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('lead que nunca teve imóvel continua salvando sem ele', async () => {
    abrir('');

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(screen.queryByText(/precisa de pelo menos um imóvel/)).not.toBeInTheDocument();
  });
});
