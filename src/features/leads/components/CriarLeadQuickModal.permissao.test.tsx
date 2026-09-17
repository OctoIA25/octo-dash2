/**
 * Quem pode editar no modal de lead.
 *
 * Corretor edita os PRÓPRIOS leads — a posse é atestada pelo pai
 * (`permitirEdicao`), porque "Meus Leads" só carrega leads atribuídos a ele.
 * O mesmo sinal libera o corretor a criar lead, atribuído a ele mesmo.
 * Sem esse sinal o modal continua somente leitura.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const inserts = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@/lib/supabaseClient', () => {
  const chain = () => {
    const self = {
      update: () => self,
      insert: async (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return { error: null };
      },
      eq: () => self,
      select: async () => ({ data: [{ id: 'lead-1' }], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
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
// Corretor: `isGestao` falso em todos os casos deste arquivo.
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isGestao: false, user: { role: 'corretor', name: 'Ana' }, tenantId: 't1' }),
}));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import type { KanbanLead } from '../services/leadsService';

const LEAD = {
  id: 'lead-1',
  nomedolead: 'Fulano',
  lead: '11999999999',
  status: 'novos-leads',
  classification: 'pronto',
  participa_bolsao: true,
} as unknown as KanbanLead;

const props = { isOpen: true, onClose: vi.fn(), tenantId: 't1' };
const campoNome = () => screen.getByPlaceholderText('Nome do cliente') as HTMLInputElement;

describe('Permissão de edição no CriarLeadQuickModal', () => {
  it('corretor com lead próprio edita e vê o botão Salvar', () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} permitirEdicao />);
    expect(campoNome().disabled).toBe(false);
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeInTheDocument();
    expect(screen.queryByText(/somente leitura/i)).not.toBeInTheDocument();
  });

  it('sem o sinal do pai, o lead abre em somente leitura', () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);
    expect(campoNome().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Salvar/ })).not.toBeInTheDocument();
  });

  it('corretor com o sinal do pai cria lead atribuído a ele mesmo', async () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    fireEvent.change(campoNome(), { target: { value: 'Beltrano' } });
    fireEvent.change(screen.getByPlaceholderText('(11) 99999-9999'), { target: { value: '11988887777' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Lead/ }));
    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]).toMatchObject({ tenant_id: 't1', name: 'Beltrano', assigned_agent_id: 'u1' });
  });

  it('sem o sinal do pai, criar lead fica fechado para o corretor', () => {
    render(<CriarLeadQuickModal {...props} />);
    expect(campoNome().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Criar/ })).not.toBeInTheDocument();
  });
});
