/**
 * Componente de Chat com Agente de Marketing
 * Chat funcional integrado com webhook + persistência de histórico (Supabase)
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, User, Eye } from 'lucide-react';
import { sendMessageToAgent, getWebhookUrl } from '../services/agentWebhookService';
import { emitChatTelemetry, chatStatusFrom } from '../services/agentTelemetryService';
import { AgentMessageRecord } from '../services/agentConversationService';
import { MessageText } from './MessageText';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

const GREETING_MESSAGE: Message = {
  id: 'greeting',
  text: 'Olá! 👋 Sou o Caio Kotler, seu parceiro criativo para conteúdos imobiliários! Estou aqui para te ajudar com legendas, roteiros, descrições e muito mais. Como posso te ajudar hoje?',
  sender: 'agent',
  timestamp: new Date(),
};

const persistedToMessage = (row: AgentMessageRecord): Message => ({
  id: row.id,
  text: row.display_content || row.content,
  sender: row.role === 'agent' ? 'agent' : 'user',
  timestamp: new Date(row.created_at),
});

interface CaioKotlerChatProps {
  onPromptSelect?: (prompt: string) => void;
  activeConversationId?: string | null;
  persistedMessages?: AgentMessageRecord[];
  isReadOnly?: boolean;
  ensureConversation?: (firstMessage: string) => Promise<string | null>;
  addMessage?: (
    conversationId: string,
    payload: {
      role: 'user' | 'agent' | 'system';
      content: string;
      displayContent?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) => Promise<unknown>;
  loadingHistory?: boolean;
}

declare global {
  interface Window {
    sendCaioKotlerMessage?: (text: string, displayText?: string) => Promise<void>;
  }
}

export const CaioKotlerChat = ({
  activeConversationId = null,
  persistedMessages,
  isReadOnly = false,
  ensureConversation,
  addMessage,
  loadingHistory = false,
}: CaioKotlerChatProps = {}) => { // Nome do componente mantido para compatibilidade
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const isDarkMode = currentTheme === 'preto' || currentTheme === 'cinza';

  const [messages, setMessages] = useState<Message[]>([GREETING_MESSAGE]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Hidratar mensagens a partir do banco quando a conversa ativa mudar.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([GREETING_MESSAGE]);
      return;
    }
    if (persistedMessages) {
      setMessages(persistedMessages.length > 0 ? persistedMessages.map(persistedToMessage) : [GREETING_MESSAGE]);
    }
  }, [activeConversationId, persistedMessages]);
  
  // Obter webhook URL de forma segura - DECLARAR ANTES DE USAR
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  
  useEffect(() => {
    try {
      const url = getWebhookUrl();
      setWebhookUrl(url);
    } catch (error) {
      console.error('Erro ao obter webhook URL:', error);
      setWebhookUrl(null);
    }
  }, []);
  
  // Núcleo do envio: persiste a mensagem do usuário, chama o webhook e persiste a resposta.
  const sendMessage = async (text: string, displayText?: string) => {
    if (!text.trim() || isReadOnly) return;

    if (!webhookUrl) {
      toast({
        title: "Webhook não configurado",
        description: "Por favor, configure o webhook em Configurações > Agentes de IA.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    const optimisticUser: Message = {
      id: `local-${Date.now()}`,
      text: displayText || text,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev.filter(m => m.id !== 'greeting'), optimisticUser]);
    setIsSending(true);

    const conversationId = ensureConversation ? await ensureConversation(displayText || text) : null;
    if (conversationId && addMessage) {
      await addMessage(conversationId, {
        role: 'user',
        content: text,
        displayContent: displayText || null,
        metadata: displayText ? { specialty_shortcut: true } : undefined,
      });
    }

    const sendStartedMs = Date.now();
    const result = await sendMessageToAgent('Marketing', text, user?.name || 'Usuário', user?.tenantName || '');
    setIsSending(false);

    // Telemetria (fire-and-forget, nunca lança): latência + status real do
    // roundtrip — resposta vazia conta como empty_response, mesmo que a UI
    // mostre o texto de fallback.
    emitChatTelemetry({
      tenantId: user?.tenantId,
      agentSlug: 'caio',
      conversationId,
      status: chatStatusFrom(result),
      durationMs: Date.now() - sendStartedMs,
      errorMessage: result.success ? null : result.error || null,
    });

    if (!result.success) {
      console.error('❌ Erro ao enviar:', result.error);
      toast({
        title: "Erro ao enviar mensagem",
        description: result.error || "Não foi possível enviar a mensagem para o agente.",
        variant: "destructive",
        duration: 5000,
      });
      const errorMessage: Message = {
        id: `local-${Date.now() + 1}`,
        text: '❌ Desculpe, não consegui processar sua mensagem no momento. Por favor, tente novamente.\n\nDetalhes: ' + (result.error || 'Erro desconhecido'),
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      if (conversationId && addMessage) {
        await addMessage(conversationId, {
          role: 'system',
          content: errorMessage.text,
          metadata: { error: result.error || 'unknown' },
        });
      }
      return;
    }

    const responseText = result.response || '✅ Mensagem recebida! Estou processando sua solicitação...';
    const agentMessage: Message = {
      id: `local-${Date.now() + 1}`,
      text: responseText,
      sender: 'agent',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, agentMessage]);
    if (conversationId && addMessage) {
      await addMessage(conversationId, { role: 'agent', content: responseText });
    }
  };

  // Expor função para envio automático a partir dos botões de especialidade
  useEffect(() => {
    window.sendCaioKotlerMessage = async (text: string, displayText?: string) => {
      await sendMessage(text, displayText);
    };

    return () => {
      delete window.sendCaioKotlerMessage;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl, user?.name, isReadOnly, ensureConversation, addMessage, activeConversationId]);

  // Auto-scroll para a última mensagem
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      // Usar setTimeout para garantir que o DOM foi atualizado
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: 'smooth',
          block: 'end'
        });
      }, 100);
    }
  };

  // Scroll automático sempre que mensagens mudarem
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Scroll ao montar o componente
  useEffect(() => {
    scrollToBottom();
  }, []);

  // Auto-resize do textarea
  useEffect(() => {
    if (textareaRef.current) {
      try {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
      } catch (error) {
        console.error('Erro ao redimensionar textarea:', error);
      }
    }
  }, [inputMessage]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isReadOnly) return;
    const messageToSend = inputMessage;
    setInputMessage('');
    await sendMessage(messageToSend);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Verificação de segurança
  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gradient-to-b ${isDarkMode ? 'from-neutral-900/20 to-neutral-900/40' : 'from-blue-50/80 via-blue-100/60 to-blue-50/80'} overflow-hidden rounded-xl border ${isDarkMode ? 'border-neutral-800/40' : 'border-blue-200/60'} shadow-2xl`}>
      {isReadOnly && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs font-semibold ${isDarkMode ? 'bg-amber-900/30 border-amber-700/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <Eye className="w-3.5 h-3.5" />
          <span>Modo leitura — você está visualizando a conversa de outro usuário.</span>
        </div>
      )}
      {loadingHistory && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/40 text-gray-300' : 'bg-blue-50/60 border-blue-200 text-blue-700'}`}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Carregando conversa...</span>
        </div>
      )}
      {/* Área de Mensagens - Scroll fixo e automático */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4" style={{ minHeight: 0, maxHeight: 'calc(100vh - 200px)' }}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar - Foto do Agente de Marketing para mensagens do agente */}
            <div className={`flex-shrink-0 ${
              message.sender === 'user'
                ? isDarkMode
                  ? 'w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30'
                  : 'w-11 h-11 rounded-2xl bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-lg shadow-gray-400/30'
                : 'w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/30'
            }`}>
              {message.sender === 'user' ? (
                <User className={`h-6 w-6 ${isDarkMode ? 'text-white' : 'text-gray-700'}`} />
              ) : (
                <img 
                  src="https://i.postimg.cc/Z5DPrt7k/Imagem-do-Whats-App-de-2025-09-18-s-17-02-08-1c96e26d.jpg" 
                  alt="Marketing"
                  className="w-full h-full object-cover object-center"
                  style={{ objectPosition: '50% 30%' }}
                />
              )}
            </div>

            {/* Mensagem */}
            <div className={`flex flex-col max-w-[75%] ${
              message.sender === 'user' ? 'items-end' : 'items-start'
            }`}>
              {/* Nome do remetente */}
              <span className={`text-xs font-semibold mb-1 px-2 ${
                message.sender === 'user' 
                  ? isDarkMode ? 'text-blue-400' : 'text-gray-700'
                  : isDarkMode ? 'text-purple-400' : 'text-purple-600'
              }`}>
                {message.sender === 'user' ? 'Você' : 'Marketing'}
              </span>
              
              <div className={`rounded-2xl px-5 py-3.5 ${
                message.sender === 'user'
                  ? isDarkMode
                    ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-900 shadow-lg shadow-gray-400/30 border border-gray-400/30'
                  : isDarkMode
                    ? 'bg-gradient-to-br from-neutral-800/80 to-neutral-900/80 text-gray-100 border border-purple-500/20 shadow-lg shadow-purple-500/10'
                    : 'bg-white text-gray-900 border border-blue-200/60 shadow-md shadow-blue-100/40'
              }`}>
                <MessageText text={message.text} />
              </div>
              
              <span className={`text-xs mt-1.5 px-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        
        {isSending && (
          <div className="flex gap-3">
            <div className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/30 flex-shrink-0">
              <img 
                src="https://i.postimg.cc/Z5DPrt7k/Imagem-do-Whats-App-de-2025-09-18-s-17-02-08-1c96e26d.jpg" 
                alt="Marketing"
                className="w-full h-full object-cover object-center"
                style={{ objectPosition: '50% 30%' }}
              />
            </div>
            <div className={`bg-gradient-to-br ${isDarkMode ? 'from-neutral-800/80 to-neutral-900/80 border-purple-500/20' : 'bg-white border-blue-200/40'} border rounded-2xl px-5 py-3.5 shadow-lg shadow-blue-200/30`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${isDarkMode ? 'text-purple-400' : 'text-purple-600'} animate-spin`} />
                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Marketing está pensando...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Área de Input - Fixo na parte inferior - Compacta */}
      <div className={`border-t ${isDarkMode ? 'border-neutral-800 bg-neutral-900' : 'border-blue-200/50 bg-blue-50/80'} p-3 flex-shrink-0 shadow-2xl sticky bottom-0 rounded-b-xl`}>
        <div className="flex gap-2 items-end">
          <div className={`flex-1 ${isDarkMode ? 'bg-neutral-800' : 'bg-white/90'} border-2 ${isDarkMode ? 'border-neutral-700' : 'border-blue-200/60'} rounded-xl p-3 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/30 transition-all duration-200`}>
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isReadOnly ? 'Modo leitura: você não pode enviar mensagens.' : 'Digite sua mensagem...'}
              className={`bg-transparent border-none resize-none ${isDarkMode ? 'text-white placeholder:text-gray-400' : 'text-gray-800 placeholder:text-gray-500'} focus:outline-none focus:ring-0 min-h-[20px] max-h-[120px] text-sm w-full`}
              rows={1}
              disabled={isSending || isReadOnly}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isSending || isReadOnly}
            className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-blue-600 hover:from-blue-700 hover:via-purple-700 hover:to-blue-700 shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 transition-all duration-200 flex items-center justify-center p-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Send className="h-5 w-5 text-white" />
            )}
          </Button>
        </div>
        
        {!webhookUrl && (
          <div className="mt-2 bg-yellow-600/10 border border-yellow-500/30 rounded-lg p-2">
            <p className="text-[10px] text-yellow-400 text-center flex items-center justify-center gap-1">
              <span>⚠️</span>
              <span>Configure o webhook em <span className="font-semibold">Configurações &gt; Agentes de IA</span></span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
