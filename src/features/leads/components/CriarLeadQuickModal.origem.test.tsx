/**
 * Pedido do Erick (01/10): na criação, o corretor diz de onde o lead veio e,
 * se já falou com o cliente, o primeiro toque entra na cadência desde o início.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const inserts = vi.hoisted(() => [] as Record<string, unknown>[]);
const toques = vi.hoisted(() => ({ registrar: vi.fn() }));

vi.mock('@/lib/supabaseClient', () => {
  const chain = () => {
    const self: Record<string, unknown> = {
      update: () => self,
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return { select: () => ({ single: async () => ({ data: { id: 'novo-1' }, error: null }) }) };
      },
      eq: () => self, neq: () => self, is: () => self, order: () => self, limit: () => self, select: () => self,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    return self;
  };
  return {
    supabase: {
      from: () => chain(),
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'ana@x.com' } } }) },
    },
  };
});
vi.mock('../services/toquesService', () => ({ registrarToque: (...a: unknown[]) => toques.registrar(...a) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isGestao: false, user: { id: 'u1', role: 'corretor', name: 'Ana' }, tenantId: 't1' }),
}));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';

const criar = (origem: string) => {
  fireEvent.change(screen.getByPlaceholderText('Nome do cliente'), { target: { value: 'Beltrano' } });
  fireEvent.change(screen.getByPlaceholderText('(11) 99999-9999'), { target: { value: '11988887777' } });
  if (origem) fireEvent.change(screen.getByLabelText(/De onde veio o lead/), { target: { value: origem } });
};

beforeEach(() => { inserts.length = 0; toques.registrar.mockReset().mockResolvedValue({}); });

describe('Novo lead: canal e primeiro toque', () => {
  it('sem dizer de onde veio, não cria', async () => {
    render(<CriarLeadQuickModal isOpen onClose={vi.fn()} tenantId="t1" permitirEdicao />);
    criar('');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    expect(await screen.findByText('Diga de onde veio o lead.')).toBeInTheDocument();
    expect(inserts).toHaveLength(0);
  });

  it('o canal escolhido vai para a origem do lead, e sem contato não há toque', async () => {
    render(<CriarLeadQuickModal isOpen onClose={vi.fn()} tenantId="t1" permitirEdicao />);
    criar('Plantão');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0].source).toBe('Plantão');
    expect(toques.registrar).not.toHaveBeenCalled();
  });

  it('o primeiro contato entra na cadência do lead recém-criado', async () => {
    render(<CriarLeadQuickModal isOpen onClose={vi.fn()} tenantId="t1" permitirEdicao />);
    criar('Contato pessoal do corretor');
    fireEvent.change(screen.getByLabelText('Por onde foi o contato'), { target: { value: 'whatsapp' } });
    fireEvent.change(screen.getByLabelText('Como foi o contato'), { target: { value: 'respondeu' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    await waitFor(() => expect(toques.registrar).toHaveBeenCalledTimes(1));
    expect(toques.registrar).toHaveBeenCalledWith('novo-1', 't1',
      { canal: 'whatsapp', resultado: 'respondeu', proximo_toque_em: null });
  });

  it('canal do contato sem resultado não passa', async () => {
    render(<CriarLeadQuickModal isOpen onClose={vi.fn()} tenantId="t1" permitirEdicao />);
    criar('Indicação');
    fireEvent.change(screen.getByLabelText('Por onde foi o contato'), { target: { value: 'ligacao' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    expect(await screen.findByText('Diga como foi o primeiro contato.')).toBeInTheDocument();
    expect(inserts).toHaveLength(0);
  });
});
