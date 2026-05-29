import { useEffect, useRef } from 'react';
import { FileText, MessageCircle } from 'lucide-react';
import type { WhatsappConversation, WhatsappMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageInput, type ComposeMedia } from './MessageInput';

interface Props {
  conversation: WhatsappConversation | null;
  messages: WhatsappMessage[];
  loading?: boolean;
  onSendText: (text: string) => Promise<void> | void;
  onSendMedia: (params: { media: ComposeMedia; caption: string }) => Promise<void> | void;
  onOpenTemplate?: () => void;
  disabled?: boolean;
}

export function ChatWindow({
  conversation,
  messages,
  loading,
  onSendText,
  onSendMedia,
  onOpenTemplate,
  disabled,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, conversation?.id]);

  if (!conversation) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center text-gray-500 gap-3">
        <MessageCircle className="h-10 w-10 opacity-30" />
        <p className="text-sm">Selecione uma conversa para começar.</p>
      </div>
    );
  }

  const displayName =
    conversation.contact_name ?? conversation.contact_profile_name ?? conversation.contact_phone;

  return (
    <div className="flex h-full flex-1 flex-col">
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-medium">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{displayName}</div>
          <div className="truncate text-xs text-gray-500">{conversation.contact_phone}</div>
        </div>
        {onOpenTemplate && (
          <button
            type="button"
            onClick={onOpenTemplate}
            disabled={disabled}
            title="Enviar template (HSM)"
            className="inline-flex flex-none items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <FileText className="h-3.5 w-3.5" />
            Template
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/40"
      >
        <div className="flex flex-col gap-2 p-4">
          {loading && messages.length === 0 && (
            <div className="text-center text-xs text-gray-500">Carregando mensagens...</div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      </div>

      <MessageInput disabled={disabled} onSendText={onSendText} onSendMedia={onSendMedia} />
    </div>
  );
}
