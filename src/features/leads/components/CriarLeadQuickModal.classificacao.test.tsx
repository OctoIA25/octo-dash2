/**
 * Controle de Classificação no modal de criar/editar lead.
 *
 * Duas propriedades que este teste existe para travar:
 *
 * 1. **O controle NÃO aparece em modo criação.** O trigger `BEFORE INSERT`
 *    (`20260815_lead_classification_triggers.sql`) sobrescreve `classification` e
 *    `classification_source` INCONDICIONALMENTE em todo INSERT. Um controle na
 *    criação deixaria o usuário escolher um valor que o banco descarta em
 *    silêncio — controle que parece funcionar e não funciona.
 *
 * 2. **O update manda `classification` e NUNCA `classification_source`.** A origem
 *    é carimbada por trigger (`dashboard` para quem não é service_role). Mandar do
 *    cliente é exatamente o buraco que a feature existe para fechar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/** Captura o payload de cada `.update()` por tabela. */
const updates: Array<{ tabela: string; payload: Record<string, unknown> }> = [];

vi.mock('@/lib/supabaseClient', () => {
  const chain = (tabela: string) => {
    const self = {
      update(payload: Record<string, unknown>) {
        updates.push({ tabela, payload });
        return self;
      },
      eq: () => self,
      // o modal faz `.select('id')` para saber se casou linha em `leads`
      select: async () => ({ data: [{ id: 'lead-1' }], error: null }),
    };
    return self;
  };
  return {
    supabase: {
      from: (tabela: string) => chain(tabela),
      auth: { getUser: async () => ({ data: { user: { id: 'u1', user_metadata: { name: 'Victor' } } } }) },
    },
  };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));
// `isGestao` é o que destrava `canEdit` — sem ele o modal abre em modo leitura
// e nem renderiza o botão Salvar.
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isGestao: true, user: { role: 'admin', name: 'Victor' }, tenantId: 't1' }),
}));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import type { KanbanLead } from '../services/leadsService';

const LEAD = {
  id: 'lead-1',
  nomedolead: 'Fulano',
  lead: '11999999999',
  email: null,
  codigo: 'AP001',
  comments: null,
  temperature: 'Morno',
  classification: 'pronto',
  participa_bolsao: true,
} as unknown as KanbanLead;

const props = { isOpen: true, onClose: vi.fn(), tenantId: 't1' };

beforeEach(() => { updates.length = 0; });

describe('Classificação no CriarLeadQuickModal', () => {
  it('NÃO aparece em modo criação — o trigger de INSERT descartaria a escolha', () => {
    render(<CriarLeadQuickModal {...props} />);
    expect(screen.queryByText('Classificação')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Locação' })).not.toBeInTheDocument();
  });

  it('aparece em modo edição, com os quatro valores', () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);
    expect(screen.getByText('Classificação')).toBeInTheDocument();
    for (const label of ['Lançamento', 'Pronto', 'Locação', 'Sem classificação']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('grava a classificação escolhida e NUNCA manda classification_source', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);

    fireEvent.click(screen.getByRole('button', { name: 'Locação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updates.length).toBeGreaterThan(0));

    const leadsUpdate = updates.find((u) => u.tabela === 'leads');
    expect(leadsUpdate?.payload.classification).toBe('locacao');
    // a origem é do trigger, nunca do cliente
    for (const u of updates) {
      expect(u.payload).not.toHaveProperty('classification_source');
    }
  });
});
