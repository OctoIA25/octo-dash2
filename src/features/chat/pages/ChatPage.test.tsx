/**
 * Deep-link /chat?phone=...&name=... — porta de entrada dos cards do Kanban.
 * Garante que o parâmetro é canonicalizado, resolvido via
 * getOrCreateConversation (idempotente: reutiliza conversa existente),
 * ignorado quando inválido e que falha vira feedback visível (não silêncio).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getOrCreateConversation = vi.fn();
const getWhatsappConfig = vi.fn();

vi.mock('../services/chatService', async (importActual) => {
  const actual = await importActual<typeof import('../services/chatService')>();
  return {
    ...actual,
    getOrCreateConversation: (...args: unknown[]) => getOrCreateConversation(...args),
    getWhatsappConfig: (...args: unknown[]) => getWhatsappConfig(...args),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ tenantId: 'tenant-1', isAdmin: true, isOwner: false }),
}));

// Objeto estável (como no hook real, onde refresh é useCallback) — um mock que
// recria `refresh` a cada render re-dispararia o effect do deep-link em loop.
const chatConversationsState = { conversations: [], loading: false, refresh: vi.fn() };
vi.mock('../hooks/useChatConversations', () => ({
  useChatConversations: () => chatConversationsState,
}));

vi.mock('../hooks/useChatMessages', () => ({
  useChatMessages: () => ({ messages: [], loading: false }),
}));

// Componentes filhos pesados não interessam a este teste.
vi.mock('../components/ConversationList', () => ({ ConversationList: () => <div /> }));
vi.mock('../components/ChatWindow', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChatWindow: ({ conversation }: any) => (
    <div data-testid="chat-window">{conversation ? conversation.id : 'vazio'}</div>
  ),
}));
vi.mock('../components/TemplatePicker', () => ({ TemplatePicker: () => null }));
vi.mock('../components/WhatsAppIntegrationTab', () => ({ WhatsAppIntegrationTab: () => null }));

import { ChatPage } from './ChatPage';

function renderChat(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ChatPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getWhatsappConfig.mockResolvedValue({ is_active: true, display_phone_number: '+55 11 98888-0000' });
  getOrCreateConversation.mockResolvedValue({ id: 'conv-1', contact_phone: '5511988887777' });
});

describe('ChatPage deep-link ?phone=', () => {
  it('abre (ou cria) a conversa do número canônico, com o nome do lead', async () => {
    renderChat('/chat?phone=(11) 98888-7777&name=Jo%C3%A3o');
    await waitFor(() => {
      expect(getOrCreateConversation).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        contactPhone: '5511988887777',
        contactName: 'João',
      });
    });
    expect(getOrCreateConversation).toHaveBeenCalledTimes(1);
  });

  it('ignora telefone inválido (curto) sem chamar o serviço', async () => {
    renderChat('/chat?phone=1234');
    await waitFor(() => expect(getWhatsappConfig).toHaveBeenCalled());
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it('sem parâmetro, não cria nada', async () => {
    renderChat('/chat');
    await waitFor(() => expect(getWhatsappConfig).toHaveBeenCalled());
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it('abre a conversa mesmo quando ela NÃO está na lista (arquivada ou recém-criada antes do realtime)', async () => {
    // A lista mockada está vazia — a janela deve renderizar a conversa
    // resolvida pelo deep-link mesmo assim.
    renderChat('/chat?phone=5511988887777');
    await waitFor(() => {
      expect(screen.getByTestId('chat-window')).toHaveTextContent('conv-1');
    });
  });

  it('falha ao abrir vira banner de erro visível (não silêncio no console)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getOrCreateConversation.mockRejectedValueOnce(new Error('rls denied'));
    renderChat('/chat?phone=5511988887777');
    expect(await screen.findByText(/não foi possível abrir a conversa/i)).toBeInTheDocument();
  });
});
