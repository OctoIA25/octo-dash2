/**
 * Telefone no modal do lead: formato, validade e duplicidade.
 *
 * Casos de produção (17/09/2026): o mesmo número chegava em formatos
 * diferentes e virava ficha nova, e telefone como '+5519' (formulário da Meta
 * cortado) entrava como se fosse contato bom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const inserts = vi.hoisted(() => [] as Record<string, unknown>[]);
/** Lead que o banco devolve na consulta por phone_key; null = não existe. */
const leadExistente = vi.hoisted(() => ({ atual: null as Record<string, unknown> | null }));
const filtros = vi.hoisted(() => ({ ultimo: {} as Record<string, unknown> }));

vi.mock('@/lib/supabaseClient', () => {
  const chain = () => {
    const self: Record<string, unknown> = {
      update: () => self,
      insert: async (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return { error: null };
      },
      eq: (coluna: string, valor: unknown) => { filtros.ultimo[coluna] = valor; return self; },
      neq: () => self,
      is: () => self,
      order: () => self,
      limit: () => self,
      select: () => self,
      maybeSingle: async () => ({ data: leadExistente.atual, error: null }),
      // Encadeamento do supabase-js: a query é "thenable", então `await` no
      // meio da cadeia resolve sem precisar de um método terminal.
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
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));
const quemEstaOlhando = vi.hoisted(() => ({
  atual: { isGestao: true, user: { id: 'u1', role: 'admin', name: 'Ana' }, tenantId: 't1' },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => quemEstaOlhando.atual }));

const comoGestao = () => { quemEstaOlhando.atual = { isGestao: true, user: { id: 'u1', role: 'admin', name: 'Ana' }, tenantId: 't1' }; };
const comoCorretor = () => { quemEstaOlhando.atual = { isGestao: false, user: { id: 'u1', role: 'corretor', name: 'Ana' }, tenantId: 't1' }; };

import { CriarLeadQuickModal } from './CriarLeadQuickModal';

const props = { isOpen: true, onClose: vi.fn(), tenantId: 't1' };
const campoNome = () => screen.getByPlaceholderText('Nome do cliente') as HTMLInputElement;
const campoTelefone = () => screen.getByPlaceholderText('(11) 99999-9999') as HTMLInputElement;
const campoEmail = () => screen.getByPlaceholderText('email@exemplo.com') as HTMLInputElement;

const preencher = (nome: string, telefone: string, email = '') => {
  fireEvent.change(campoNome(), { target: { value: nome } });
  fireEvent.change(campoTelefone(), { target: { value: telefone } });
  if (email) fireEvent.change(campoEmail(), { target: { value: email } });
};

beforeEach(() => {
  inserts.length = 0;
  leadExistente.atual = null;
  filtros.ultimo = {};
  comoGestao();
});

describe('Duplicidade de telefone ao criar lead', () => {
  it('procura pela chave canônica, não pelo que foi digitado (CA-01)', async () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Maria', '(19) 99999-9999');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));

    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(filtros.ultimo.phone_key).toBe('5519999999999');
  });

  it('telefone já usado por outro lead NÃO cria segunda ficha (CA-02)', async () => {
    leadExistente.atual = { id: 'lead-9', name: 'Maria Aparecida', assigned_agent_name: 'Nathália', status: 'Novos Leads' };
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Maria', '19999999999');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));

    await waitFor(() => expect(screen.getByText(/já é do lead "Maria Aparecida"/)).toBeInTheDocument());
    expect(inserts).toHaveLength(0);
  });

  it('corretor NÃO vê o nome nem o dono da ficha de um colega', async () => {
    comoCorretor();
    leadExistente.atual = { id: 'lead-9', name: 'Maria Aparecida', assigned_agent_id: 'outro-corretor', assigned_agent_name: 'Nathália', status: 'Novos Leads' };
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Maria', '19999999999');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));

    await waitFor(() => expect(screen.getByText(/já está cadastrado na imobiliária/)).toBeInTheDocument());
    expect(screen.queryByText(/Maria Aparecida/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nathália/)).not.toBeInTheDocument();
    expect(inserts).toHaveLength(0);
  });

  it('corretor vê o detalhe quando a ficha já é dele', async () => {
    comoCorretor();
    leadExistente.atual = { id: 'lead-9', name: 'Maria Aparecida', assigned_agent_id: 'u1', assigned_agent_name: 'Ana', status: 'Interação' };
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Maria', '19999999999');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));

    await waitFor(() => expect(screen.getByText(/já é do lead "Maria Aparecida" \(Interação\)/)).toBeInTheDocument());
    expect(screen.getByText(/na sua lista/)).toBeInTheDocument();
  });

  it('o telefone gravado é preservado como veio — a chave é que compara', async () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Maria', '(19) 99999-9999');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));

    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0].phone).toBe('(19) 99999-9999');
  });
});

describe('Telefone e e-mail inválidos no modal (CA-03/CA-05/CA-11)', () => {
  it("'+5519' não vira lead e o corretor é avisado", async () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Miguel', '+5519');
    expect(screen.getByText('Telefone incompleto')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    await waitFor(() => expect(screen.getByText(/Telefone incompleto — confira/)).toBeInTheDocument());
    expect(inserts).toHaveLength(0);
  });

  it('telefone com dígito a mais também não passa', async () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Dulce', '+55129999999999');
    expect(screen.getByText('Telefone inválido')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    await waitFor(() => expect(screen.getByText(/Telefone inválido — confira/)).toBeInTheDocument());
    expect(inserts).toHaveLength(0);
  });

  it("'@gmail.co' é sinalizado, mas NÃO impede o cadastro nem é corrigido (CA-07)", async () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Dulce', '19999999999', 'dulce@gmail.co');
    expect(screen.getByText('E-mail possivelmente incompleto')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0].email).toBe('dulce@gmail.co');
  });

  it('e-mail sem sintaxe de endereço barra o cadastro', async () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    preencher('Ana', '19999999999', 'ana@gmail');
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));

    // Dois lugares dizem a mesma coisa: o aviso no campo e o erro do salvar.
    await waitFor(() => expect(screen.getByText(/E-mail inválido — confira/)).toBeInTheDocument());
    expect(screen.getByText('E-mail inválido')).toBeInTheDocument();
    expect(inserts).toHaveLength(0);
  });
});
