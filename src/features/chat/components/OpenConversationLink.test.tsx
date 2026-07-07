/**
 * OpenConversationLink — o acesso "Abrir conversa" usado no card do Kanban e
 * no fim das Observações do lead (modal e LeadViewPage). Telefone canônico no
 * href, gating pela permissão 'chat' e nada renderizado quando inválido.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = { user: { sidebarPermissions: ['chat'] } };
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => authState,
}));

import { OpenConversationLink } from './OpenConversationLink';

function renderLink(props: Parameters<typeof OpenConversationLink>[0]) {
  return render(
    <MemoryRouter>
      <OpenConversationLink {...props} />
    </MemoryRouter>,
  );
}

describe('OpenConversationLink', () => {
  it('renderiza com telefone canônico e nome no href', () => {
    renderLink({ phone: '(11) 98888-7777', contactName: 'João Comprador' });
    expect(screen.getByRole('link', { name: /abrir conversa/i })).toHaveAttribute(
      'href',
      '/chat?phone=5511988887777&name=Jo%C3%A3o%20Comprador',
    );
  });

  it('telefone inválido ou ausente: não renderiza nada', () => {
    renderLink({ phone: '1234' });
    renderLink({ phone: null });
    expect(screen.queryByRole('link', { name: /abrir conversa/i })).toBeNull();
  });

  it('sem permissão de chat: não renderiza', () => {
    authState.user.sidebarPermissions = [];
    try {
      renderLink({ phone: '(11) 98888-7777' });
      expect(screen.queryByRole('link', { name: /abrir conversa/i })).toBeNull();
    } finally {
      authState.user.sidebarPermissions = ['chat'];
    }
  });
});
