import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Settings } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConversationList } from '../components/ConversationList';
import { ChatWindow } from '../components/ChatWindow';
import { TemplatePicker } from '../components/TemplatePicker';
import { WhatsAppIntegrationTab } from '../components/WhatsAppIntegrationTab';
import { useChatConversations } from '../hooks/useChatConversations';
import { useChatMessages } from '../hooks/useChatMessages';
import {
  CONVERSA_NAO_ATRIBUIDA,
  getOrCreateConversation,
  getWhatsappConfig,
  normalizePhone,
} from '../services/chatService';
import { sendTemplateMessage, sendTextMessage } from '../services/whatsappService';
import type { WhatsappConfig, WhatsappConversation } from '../types';

export const ChatPage = () => {
  const { tenantId, isAdmin, isOwner, user } = useAuthContext();
  const canConfigure = isAdmin || isOwner;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [config, setConfig] = useState<WhatsappConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const { conversations, loading: loadingConversations, refresh: refreshConversations } = useChatConversations(tenantId);
  const { messages, loading: loadingMessages } = useChatMessages(selectedId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  // Conversa resolvida pelo deep-link — fallback de seleção para quando ela
  // ainda não está na lista (recém-criada antes do realtime, ou arquivada).
  const [deepLinkConversation, setDeepLinkConversation] = useState<WhatsappConversation | null>(null);

  // Deep-link vindo do card do Kanban: /chat?phone=5511988887777&name=Fulano.
  // Abre a conversa do número (getOrCreateConversation é idempotente) e só
  // consome o parâmetro após sucesso — em caso de erro, F5 tenta de novo.
  useEffect(() => {
    const phoneParam = searchParams.get('phone');
    if (!phoneParam || !tenantId || tenantId === 'owner') return;
    const phone = normalizePhone(phoneParam);
    if (phone.length < 10) {
      setSearchParams({}, { replace: true });
      return;
    }
    const contactName = searchParams.get('name')?.trim() || undefined;
    getOrCreateConversation({
      tenantId,
      contactPhone: phone,
      contactName,
      assignedUserId: user?.id,
    })
      .then((conv) => {
        setDeepLinkConversation(conv);
        setSelectedId(conv.id);
        setDeepLinkError(null);
        setSearchParams({}, { replace: true });
        void refreshConversations();
      })
      .catch((err) => {
        console.error('[chat] deep-link: erro ao abrir conversa:', err);
        setDeepLinkError(
          err?.code === CONVERSA_NAO_ATRIBUIDA
            ? err.message
            : 'Não foi possível abrir a conversa deste lead. Recarregue a página para tentar novamente.',
        );
      });
  }, [searchParams, setSearchParams, tenantId, user?.id, refreshConversations]);

  const reloadConfig = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') return;
    try {
      const cfg = await getWhatsappConfig(tenantId);
      setConfig(cfg);
      setConfigError(null);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Erro ao carregar configuração.');
    }
  }, [tenantId]);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  // Recarregar configuração ao fechar a modal (caso o admin tenha salvo)
  useEffect(() => {
    if (!setupOpen) {
      void reloadConfig();
    }
  }, [setupOpen, reloadConfig]);

  const selectedConversation = useMemo(
    () =>
      conversations.find((c) => c.id === selectedId) ??
      (deepLinkConversation?.id === selectedId ? deepLinkConversation : null),
    [conversations, selectedId, deepLinkConversation],
  );

  const handleSend = async (text: string) => {
    if (!selectedConversation) return;
    const result = await sendTextMessage({
      conversationId: selectedConversation.id,
      to: selectedConversation.contact_phone,
      body: text,
    });
    if (!result.ok) {
      console.error('[chat] falha ao enviar mensagem:', result.error);
      alert(`Falha ao enviar: ${result.error ?? 'erro desconhecido'}`);
    }
  };

  const handleSendTemplate = async (params: {
    name: string;
    language: string;
    bodyParameters: string[];
  }) => {
    if (!selectedConversation) return;
    const result = await sendTemplateMessage({
      conversationId: selectedConversation.id,
      to: selectedConversation.contact_phone,
      name: params.name,
      language: params.language,
      bodyParameters: params.bodyParameters,
    });
    if (!result.ok) {
      throw new Error(result.error ?? 'Erro ao enviar template.');
    }
  };

  const handleStartNewChat = async () => {
    if (!tenantId || tenantId === 'owner') {
      setNewChatError('Selecione um tenant primeiro (impersonation).');
      return;
    }
    const phone = normalizePhone(newChatPhone);
    if (phone.length < 10) {
      setNewChatError('Telefone inválido. Use o formato com DDI/DDD (ex.: 5511988887777).');
      return;
    }
    setNewChatLoading(true);
    setNewChatError(null);
    try {
      const conv = await getOrCreateConversation({
        tenantId,
        contactPhone: phone,
        contactName: newChatName.trim() || undefined,
        assignedUserId: user?.id,
      });
      setSelectedId(conv.id);
      setNewChatOpen(false);
      setNewChatPhone('');
      setNewChatName('');
    } catch (err) {
      setNewChatError(err instanceof Error ? err.message : 'Erro ao criar conversa.');
    } finally {
      setNewChatLoading(false);
    }
  };

  const notConfigured = !config && !configError;
  const showSetupBanner = !config || !config.is_active;

  return (
    <div className="flex h-screen w-full flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
      >
        <div>
          <h1 className="text-base font-semibold">Chat WhatsApp</h1>
          <p className="text-xs text-gray-500">
            {config?.display_phone_number
              ? `Número conectado: ${config.display_phone_number}`
              : 'Conecte um número da Meta Cloud API para começar.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            disabled={!config?.is_active}
            title={config?.is_active ? 'Iniciar nova conversa' : 'Configure o WhatsApp primeiro'}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova conversa
          </button>
          {canConfigure && (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Settings className="h-3.5 w-3.5" />
              Configurar
            </button>
          )}
        </div>
      </div>

      {showSetupBanner && (
        <div className="flex items-center justify-between gap-3 border-b bg-yellow-50 px-4 py-2 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
          <span>
            {configError
              ? `Não foi possível carregar a configuração: ${configError}`
              : notConfigured
                ? 'Nenhum número WhatsApp configurado para este tenant.'
                : 'Integração WhatsApp inativa.'}
          </span>
        </div>
      )}

      {deepLinkError && (
        <div className="border-b bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {deepLinkError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="w-[320px] flex-none">
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loadingConversations}
          />
        </div>
        <ChatWindow
          conversation={selectedConversation}
          messages={messages}
          loading={loadingMessages}
          tenantId={tenantId}
          onSendText={handleSend}
          onOpenTemplate={() => setTemplateOpen(true)}
          disabled={!config?.is_active}
        />
      </div>

      <TemplatePicker
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        tenantId={tenantId}
        onSend={handleSendTemplate}
      />

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Integração WhatsApp</DialogTitle>
            <DialogDescription>
              Credenciais Meta Cloud API deste tenant. As alterações são aplicadas imediatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="-mt-2">
            <WhatsAppIntegrationTab />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>
              Envie a primeira mensagem para um número WhatsApp. Para contatos que nunca falaram
              com você antes, a Meta exige uma <strong>mensagem de template (HSM)</strong> — texto
              livre só funciona dentro da janela de 24h.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                Telefone (com DDI + DDD, apenas dígitos)
              </label>
              <input
                type="tel"
                value={newChatPhone}
                onChange={(e) => setNewChatPhone(e.target.value)}
                placeholder="5511988887777"
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
                Nome do contato (opcional)
              </label>
              <input
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="João Silva"
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {newChatError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {newChatError}
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setNewChatOpen(false)}
              className="rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleStartNewChat}
              disabled={newChatLoading || !newChatPhone.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {newChatLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Abrir conversa
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPage;
