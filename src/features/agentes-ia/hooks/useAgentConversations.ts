/**
 * Hook para gerenciar o estado das conversas com agentes de IA.
 *
 * Responsabilidades:
 *  - Listar conversas (do próprio usuário OU de um usuário específico para gestor)
 *  - Carregar mensagens de uma conversa ativa
 *  - Criar conversa nova on-the-fly quando o usuário envia a primeira mensagem
 *  - Adicionar mensagens em uma conversa existente
 *  - Renomear / arquivar / excluir conversa
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AgentConversation,
  AgentMessageRecord,
  AgentSlug,
  appendMessage,
  archiveConversation,
  createConversation,
  deleteConversation,
  listConversationMessages,
  listConversations,
  renameConversation,
} from '../services/agentConversationService';

interface UseAgentConversationsParams {
  agent: AgentSlug;
  userId?: string;
  tenantId?: string;
  userName?: string | null;
  userEmail?: string | null;
  /** Quando definido, filtra a listagem por esse userId (gestor visualizando outro usuário). */
  viewingUserId?: string | null;
  /** Indica que o usuário atual é gestor e portanto pode ver conversas de outros usuários do tenant. */
  isManagerView?: boolean;
}

export const useAgentConversations = ({
  agent,
  userId,
  tenantId,
  userName,
  userEmail,
  viewingUserId,
  isManagerView,
}: UseAgentConversationsParams) => {
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessageRecord[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const ownerOfActive = conversations.find((c) => c.id === activeConversationId);
  const isReadOnly = !!ownerOfActive && !!userId && ownerOfActive.user_id !== userId;

  const refreshConversations = useCallback(async () => {
    if (!userId) return;

    setLoadingConversations(true);
    try {
      let list: AgentConversation[] = [];
      if (isManagerView && viewingUserId && tenantId) {
        list = await listConversations(agent, { tenantId, userId: viewingUserId });
      } else {
        list = await listConversations(agent, { userId });
      }
      setConversations(list);
    } finally {
      setLoadingConversations(false);
    }
  }, [agent, userId, tenantId, viewingUserId, isManagerView]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Limpa conversa ativa quando troca o filtro de usuário visualizado
  useEffect(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, [viewingUserId, agent]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const rows = await listConversationMessages(conversationId);
      setMessages(rows);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      setActiveConversationId(conversationId);
      await loadMessages(conversationId);
    },
    [loadMessages]
  );

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, []);

  /**
   * Garante que existe uma conversa ativa. Se não houver, cria uma nova
   * usando o texto da primeira mensagem como título. Retorna o id.
   */
  const ensureConversation = useCallback(
    async (firstMessage: string): Promise<string | null> => {
      if (activeConversationId) return activeConversationId;
      if (!userId || !tenantId) {
        console.warn('⚠️ ensureConversation chamada sem userId/tenantId');
        return null;
      }
      const created = await createConversation({
        agent,
        userId,
        tenantId,
        userName: userName ?? null,
        userEmail: userEmail ?? null,
        firstMessage,
      });
      if (!created) return null;
      setActiveConversationId(created.id);
      setConversations((prev) => [created, ...prev]);
      return created.id;
    },
    [activeConversationId, userId, tenantId, agent, userName, userEmail]
  );

  const addMessage = useCallback(
    async (
      conversationId: string,
      payload: {
        role: 'user' | 'agent' | 'system';
        content: string;
        displayContent?: string | null;
        metadata?: Record<string, unknown>;
      }
    ) => {
      if (!userId || !tenantId) return null;
      const row = await appendMessage({
        conversationId,
        tenantId,
        userId,
        role: payload.role,
        content: payload.content,
        displayContent: payload.displayContent ?? null,
        metadata: payload.metadata ?? {},
      });
      if (row) {
        setMessages((prev) => [...prev, row]);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  message_count: c.message_count + 1,
                  last_message_at: row.created_at,
                  updated_at: row.created_at,
                }
              : c
          )
        );
      }
      return row;
    },
    [userId, tenantId]
  );

  const rename = useCallback(
    async (conversationId: string, title: string) => {
      const ok = await renameConversation(conversationId, title);
      if (ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, title } : c))
        );
      }
      return ok;
    },
    []
  );

  const archive = useCallback(
    async (conversationId: string) => {
      const ok = await archiveConversation(conversationId);
      if (ok) {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeConversationId === conversationId) {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
      return ok;
    },
    [activeConversationId]
  );

  const remove = useCallback(
    async (conversationId: string) => {
      const ok = await deleteConversation(conversationId);
      if (ok) {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeConversationId === conversationId) {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
      return ok;
    },
    [activeConversationId]
  );

  return {
    conversations,
    activeConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    isReadOnly,
    selectConversation,
    startNewConversation,
    ensureConversation,
    addMessage,
    refreshConversations,
    renameConversation: rename,
    archiveConversation: archive,
    deleteConversation: remove,
  };
};

export type UseAgentConversationsReturn = ReturnType<typeof useAgentConversations>;
