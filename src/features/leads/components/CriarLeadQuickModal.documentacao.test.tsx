/**
 * Seção "Documentação" (CPF + upload) no modal de criar/editar lead.
 *
 * Propriedades que este teste trava:
 *
 * 1. **Gate de etapa.** A seção só existe em modo edição E a partir de Propostas
 *    (slugs proposta-* no funil Interessado; propostas-respondidas e
 *    feitura-contrato no Proprietário). Antes disso, nada de CPF/documentos.
 *
 * 2. **O UPDATE só manda `cpf` quando a seção está visível.** Para leads em
 *    etapas anteriores o campo não renderiza — mandar cpf no payload apagaria
 *    silenciosamente um valor já salvo (e quebraria com 42703 pré-migration).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updates: Array<{ tabela: string; payload: Record<string, unknown> }> = [];
let cpfNoBanco: string | null = null;

vi.mock('@/lib/supabaseClient', () => {
  const chain = (tabela: string) => {
    const self: Record<string, unknown> = {
      update(payload: Record<string, unknown>) {
        updates.push({ tabela, payload });
        return self;
      },
      eq: () => self,
      select: (cols?: string) => {
        // hidratação do CPF: .select('cpf').eq('id', …).maybeSingle()
        if (cols === 'cpf') {
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: tabela === 'leads' ? { cpf: cpfNoBanco } : null,
                error: null,
              }),
            }),
          };
        }
        // caminho do UPDATE: .select('id') aguardado direto
        return Promise.resolve({ data: [{ id: 'lead-1' }], error: null });
      },
    };
    return self;
  };
  return {
    supabase: {
      from: (tabela: string) => chain(tabela),
      auth: { getUser: async () => ({ data: { user: { id: 'u1', user_metadata: { name: 'Victor' } } } }) },
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
        }),
      },
    },
  };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isGestao: true, user: { role: 'admin', name: 'Victor' }, tenantId: 't1' }),
}));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import type { KanbanLead } from '../services/leadsService';

const leadNaEtapa = (status: string) =>
  ({
    id: 'lead-1',
    nomedolead: 'Fulano',
    lead: '11999999999',
    email: null,
    codigo: 'AP001',
    comments: null,
    temperature: 'Morno',
    classification: 'pronto',
    participa_bolsao: true,
    status,
  }) as unknown as KanbanLead;

const props = { isOpen: true, onClose: vi.fn(), tenantId: 't1' };

beforeEach(() => {
  updates.length = 0;
  cpfNoBanco = null;
});

describe('Gate de etapa da seção Documentação', () => {
  it('NÃO aparece em modo criação', () => {
    render(<CriarLeadQuickModal {...props} />);
    expect(screen.queryByText('Documentação')).not.toBeInTheDocument();
  });

  it('NÃO aparece em edição antes de Propostas (interacao, negociacao)', () => {
    for (const status of ['interacao', 'negociacao']) {
      const { unmount } = render(<CriarLeadQuickModal {...props} editingLead={leadNaEtapa(status)} />);
      expect(screen.queryByText('Documentação')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('aparece de proposta-criada em diante (Interessado) e feitura-contrato (Proprietário)', () => {
    for (const status of ['proposta-criada', 'proposta-enviada', 'proposta-assinada', 'propostas-respondidas', 'feitura-contrato']) {
      const { unmount } = render(<CriarLeadQuickModal {...props} editingLead={leadNaEtapa(status)} />);
      expect(screen.getByText('Documentação')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('000.000.000-00')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('CPF no UPDATE', () => {
  it('grava o CPF mascarado quando a seção está visível', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={leadNaEtapa('proposta-criada')} />);

    fireEvent.change(screen.getByPlaceholderText('000.000.000-00'), {
      target: { value: '52998224725' },
    });
    // máscara aplicada no input
    expect(screen.getByPlaceholderText('000.000.000-00')).toHaveValue('529.982.247-25');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(updates.length).toBeGreaterThan(0));
    expect(updates.find((u) => u.tabela === 'leads')?.payload.cpf).toBe('529.982.247-25');
  });

  it('NÃO manda cpf no payload quando o lead está antes de Propostas', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={leadNaEtapa('interacao')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(updates.length).toBeGreaterThan(0));
    expect(updates.find((u) => u.tabela === 'leads')?.payload).not.toHaveProperty('cpf');
  });

  it('hidrata o CPF já salvo no banco ao abrir o modal', async () => {
    cpfNoBanco = '52998224725';
    render(<CriarLeadQuickModal {...props} editingLead={leadNaEtapa('proposta-enviada')} />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('000.000.000-00')).toHaveValue('529.982.247-25'),
    );
  });
});
