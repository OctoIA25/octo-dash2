/**
 * Link "Abrir conversa" no card do Kanban — aparece na linha de telefone da
 * descrição, aponta para /chat?phone=<canônico>&name=<lead>, respeita a
 * permissão 'chat' e não dispara o clique do card (que abre o modal).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = {
  user: { sidebarPermissions: ['chat', 'leads'] },
  tenantId: 'tenant-1',
  isAdmin: false,
  isOwner: false,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => authState,
}));

import { KanbanCardContent } from './MeusLeadsAtribuidosSection';
import type { KanbanLead } from '../services/leadsService';

function makeLead(overrides: Partial<KanbanLead> = {}): KanbanLead {
  return {
    id: 'lead-1',
    created_at: '2026-07-01T12:00:00Z',
    codigo: 'AP0001',
    corretor: null,
    lead: '(11) 98888-7777',
    numerocorretor: null,
    status: 'novo',
    corretor_responsavel: 'Maria',
    numero_corretor_responsavel: null,
    data_atribuicao: null,
    atendido: null,
    data_atendimento: null,
    data_finalizacao: null,
    data_expiracao: null,
    nomedolead: 'João Comprador',
    Foto: null,
    portal: 'Kenlo',
    email: null,
    temperature: null,
    property_value: null,
    comments: null,
    archived_at: null,
    archive_reason: null,
    lead_type: 1,
    is_exclusive: false,
    participa_bolsao: false,
    assigned_at: '2026-07-01T12:00:00Z',
    event_at: '2026-07-01T12:00:00Z',
    ...overrides,
  } as KanbanLead;
}

function renderCard(lead: KanbanLead, onClick = vi.fn()) {
  render(
    <MemoryRouter>
      <KanbanCardContent lead={lead} onClick={onClick} mostrarCorretor={false} />
    </MemoryRouter>,
  );
  return onClick;
}

describe('link WhatsApp no card do Kanban', () => {
  it('exibe "Abrir conversa" com telefone canônico e nome do lead', () => {
    renderCard(makeLead());
    const link = screen.getByRole('link', { name: /abrir conversa/i });
    expect(link).toHaveAttribute(
      'href',
      '/chat?phone=5511988887777&name=Jo%C3%A3o%20Comprador',
    );
  });

  it('clicar no link NÃO abre o modal do card (stopPropagation)', () => {
    const onClick = renderCard(makeLead());
    fireEvent.click(screen.getByRole('link', { name: /abrir conversa/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('lead sem telefone: sem link', () => {
    renderCard(makeLead({ lead: null, numerocorretor: null }));
    expect(screen.queryByRole('link', { name: /abrir conversa/i })).toBeNull();
  });

  it('telefone inválido (curto): mostra o telefone mas sem link', () => {
    renderCard(makeLead({ lead: '1234' }));
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /abrir conversa/i })).toBeNull();
  });

  it('sem permissão de chat: telefone aparece, link não', () => {
    authState.user.sidebarPermissions = ['leads'];
    try {
      renderCard(makeLead());
      expect(screen.getByText('(11) 98888-7777')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /abrir conversa/i })).toBeNull();
    } finally {
      authState.user.sidebarPermissions = ['chat', 'leads'];
    }
  });
});
