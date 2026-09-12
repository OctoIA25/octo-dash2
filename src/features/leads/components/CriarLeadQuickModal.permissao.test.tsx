/**
 * Quem pode editar no modal de lead.
 *
 * Corretor edita os PRÓPRIOS leads — a posse é atestada pelo pai
 * (`permitirEdicao`), porque "Meus Leads" só carrega leads atribuídos a ele.
 * Sem esse sinal o modal continua somente leitura, e criar lead segue sendo
 * exclusividade da gestão (o INSERT não é liberado por `permitirEdicao`).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/supabaseClient', () => {
  const chain = () => {
    const self = {
      update: () => self,
      eq: () => self,
      select: async () => ({ data: [{ id: 'lead-1' }], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return self;
  };
  return {
    supabase: {
      from: () => chain(),
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
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

  it('criar lead continua fechado para o corretor', () => {
    render(<CriarLeadQuickModal {...props} permitirEdicao />);
    expect(campoNome().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Criar/ })).not.toBeInTheDocument();
  });
});
