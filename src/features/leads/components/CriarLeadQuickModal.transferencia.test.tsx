/**
 * Transferência de lead no modal de editar lead (Meus Leads).
 *
 * Propriedades que este teste trava:
 *
 * 1. **Quem transfere.** Gestão (admin, gestor/team_leader, owner) vê o seletor
 *    de corretor; corretor só lê com quem o lead está.
 * 2. **As colunas de atribuição só entram no UPDATE quando há destino.** Um save
 *    comum que reescrevesse `assigned_agent_*` zeraria o cronômetro do bolsão
 *    (trigger tr_leads_assigned_at) a cada edição de nome ou temperatura.
 * 3. **A transferência atualiza o espelho em `bolsao`.** É de lá que a roleta lê
 *    quem já tem o lead (pick_roleta_broker_excluding) — deixar o nome antigo
 *    devolveria o lead ao corretor anterior na próxima expiração.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updates: Array<{ tabela: string; payload: Record<string, unknown> }> = [];

vi.mock('@/lib/supabaseClient', () => {
  const chain = (tabela: string) => {
    const self: Record<string, unknown> = {
      update(payload: Record<string, unknown>) {
        updates.push({ tabela, payload });
        return self;
      },
      eq: () => self,
      // UPDATE em `leads` confirma 1 linha → o fallback kenlo_leads não roda.
      select: async () => ({ data: [{ id: 'lead-1' }], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return self;
  };
  return {
    supabase: {
      from: (tabela: string) => chain(tabela),
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

vi.mock('@/features/leads/services/roletaService', () => ({
  fetchCorretoresDisponiveis: async () => [
    { id: 'u-1', name: 'João', email: 'joao@x.com', phone: '11911111111' },
    { id: 'u-2', name: 'Maria', email: 'maria@x.com', phone: '11922222222' },
  ],
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));

let auth = { isGestao: true, user: { role: 'admin', name: 'Victor' }, tenantId: 't1' };
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => auth }));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import type { KanbanLead } from '../services/leadsService';

const LEAD = {
  id: 'lead-1',
  nomedolead: 'Fulano',
  lead: '11999999999',
  status: 'novos-leads',
  classification: 'pronto',
  participa_bolsao: true,
  corretor_responsavel: 'João',
  source_lead_id: 'lead-1',
  source_kenlo_id: null,
} as unknown as KanbanLead;

const props = { isOpen: true, onClose: vi.fn(), tenantId: 't1' };
const seletor = () => screen.getByLabelText('Transferir para') as HTMLSelectElement;
const salvar = () => fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
const updateEm = (tabela: string) => updates.find((u) => u.tabela === tabela);

describe('Transferência de corretor no modal do lead', () => {
  beforeEach(() => {
    updates.length = 0;
    auth = { isGestao: true, user: { role: 'admin', name: 'Victor' }, tenantId: 't1' };
  });

  it('gestão vê o corretor atual e os outros corretores do tenant', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);

    expect(screen.getByText('João (atual)')).toBeInTheDocument();
    // João é o atual — só os OUTROS entram como destino.
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maria' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'João' })).not.toBeInTheDocument();
  });

  it('transferir grava o novo corretor na fonte e no espelho do bolsão', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maria' })).toBeInTheDocument());

    fireEvent.change(seletor(), { target: { value: 'u-2' } });
    salvar();

    await waitFor(() => expect(updateEm('leads')).toBeTruthy());
    expect(updateEm('leads')!.payload).toMatchObject({
      assigned_agent_id: 'u-2',
      assigned_agent_name: 'Maria',
    });
    // assigned_at é do trigger, não do cliente.
    expect(updateEm('leads')!.payload).not.toHaveProperty('assigned_at');

    await waitFor(() => expect(updateEm('bolsao')).toBeTruthy());
    expect(updateEm('bolsao')!.payload).toMatchObject({
      corretor_responsavel: 'Maria',
      numero_corretor_responsavel: '11922222222',
    });
  });

  it('salvar sem escolher destino não mexe na atribuição', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maria' })).toBeInTheDocument());

    salvar();

    await waitFor(() => expect(updateEm('leads')).toBeTruthy());
    expect(updateEm('leads')!.payload).not.toHaveProperty('assigned_agent_id');
    expect(updateEm('leads')!.payload).not.toHaveProperty('assigned_agent_name');
    expect(updateEm('bolsao')).toBeUndefined();
  });

  it('corretor só lê com quem o lead está', () => {
    auth = { isGestao: false, user: { role: 'corretor', name: 'João' }, tenantId: 't1' };
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} permitirEdicao />);

    expect(screen.getByText('Corretor responsável')).toBeInTheDocument();
    expect(screen.getByText('João')).toBeInTheDocument();
    expect(screen.queryByLabelText('Transferir para')).not.toBeInTheDocument();
  });
});
