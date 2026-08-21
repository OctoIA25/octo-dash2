/**
 * OpenConversationLink — o acesso "Abrir conversa" usado no card do Kanban e
 * no fim das Observações do lead (modal e LeadViewPage). Telefone canônico no
 * href, gating pela permissão 'chat' e nada renderizado quando inválido.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const authState = { user: { sidebarPermissions: ['chat'] } };
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => authState,
}));

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { OpenConversationLink, ConversationLinkField } from './OpenConversationLink';

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

describe('ConversationLinkField', () => {
  const renderField = () =>
    render(
      <MemoryRouter>
        <ConversationLinkField phone="(11) 98888-7777" contactName="João Comprador" />
      </MemoryRouter>,
    );

  it('mostra a URL ABSOLUTA da conversa — o campo existe para colar fora do dashboard', () => {
    renderField();
    expect(screen.getByLabelText('Link da conversa')).toHaveValue(
      `${window.location.origin}/chat?phone=5511988887777&name=Jo%C3%A3o%20Comprador`,
    );
  });

  it('mesmo gating do link: sem permissão ou telefone válido, não renderiza', () => {
    authState.user.sidebarPermissions = [];
    try {
      renderField();
      expect(screen.queryByLabelText('Link da conversa')).toBeNull();
    } finally {
      authState.user.sidebarPermissions = ['chat'];
    }
    render(
      <MemoryRouter>
        <ConversationLinkField phone="1234" />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('Link da conversa')).toBeNull();
  });

  it('botão copia a URL para o clipboard e confirma no toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderField();

    await userEvent.click(screen.getByRole('button', { name: /copiar link da conversa/i }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/chat?phone=5511988887777&name=Jo%C3%A3o%20Comprador`,
    );
    expect(toastSpy).toHaveBeenCalledWith({ title: 'Link da conversa copiado' });
  });

  it('clipboard bloqueado: toast destrutivo carrega a URL para copiar na mão', async () => {
    toastSpy.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    renderField();

    await userEvent.click(screen.getByRole('button', { name: /copiar link da conversa/i }));

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Não foi possível copiar',
        variant: 'destructive',
        description: expect.stringContaining('/chat?phone=5511988887777'),
      }),
    );
  });
});
