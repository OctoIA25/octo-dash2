import { useEffect, useRef } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, MessageCircle } from 'lucide-react';
import {
  WHATSAPP_CATEGORIES,
  type WhatsappCategory,
  type WhatsappConversation,
  type WhatsappMessage,
} from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageInput, type ComposeMedia } from './MessageInput';
import { PendingBubble } from './messages/PendingBubble';
import { LightboxProvider } from './lightbox/LightboxProvider';
import { useMediaSend } from '../hooks/useMediaSend';

/** Data da mensagem: o WhatsApp usa o horário do provedor quando existe. */
function messageDate(m: WhatsappMessage): Date {
  return new Date(m.wa_timestamp ?? m.created_at);
}

/** Agrupa mensagens consecutivas do mesmo dia (a lista já vem em ordem cronológica). */
export function groupByDay(messages: WhatsappMessage[]): { date: Date; items: WhatsappMessage[] }[] {
  const groups: { date: Date; items: WhatsappMessage[] }[] = [];
  for (const m of messages) {
    const date = messageDate(m);
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.date, date)) last.items.push(m);
    else groups.push({ date, items: [m] });
  }
  return groups;
}

export function dayLabel(date: Date): string {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

interface Props {
  conversation: WhatsappConversation | null;
  messages: WhatsappMessage[];
  loading?: boolean;
  tenantId: string | null;
  onSendText: (text: string) => Promise<void> | void;
  onOpenTemplate?: () => void;
  onChangeCategory?: (category: WhatsappCategory | null) => void;
  /** Clique no nome do contato — abre o modal de lead (mesmo de Meus Leads). */
  onOpenLead?: () => void;
  disabled?: boolean;
}

export function ChatWindow({
  conversation,
  messages,
  loading,
  tenantId,
  onSendText,
  onOpenTemplate,
  onChangeCategory,
  onOpenLead,
  disabled,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pending, send, retry, cancel } = useMediaSend({
    conversationId: conversation?.id ?? '',
    contactPhone: conversation?.contact_phone ?? '',
    tenantId: tenantId ?? '',
  });

  // Só as pendentes da conversa aberta (o estado persiste entre trocas de conversa).
  const conversationPending = pending.filter((p) => p.conversationId === conversation?.id);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, conversationPending.length, conversation?.id]);

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

  const handleSendMedia = ({ media, caption }: { media: ComposeMedia; caption: string }) => {
    send(media.file, media.type, caption);
  };

  return (
    <LightboxProvider>
      <div className="flex h-full flex-1 flex-col">
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-color, #e5e7eb)' }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-medium">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {onOpenLead ? (
              <button
                type="button"
                onClick={onOpenLead}
                title="Ver dados do lead"
                className="block max-w-full truncate text-sm font-medium hover:underline"
              >
                {displayName}
              </button>
            ) : (
              <div className="truncate text-sm font-medium">{displayName}</div>
            )}
            <div className="truncate text-xs text-gray-500">{conversation.contact_phone}</div>
          </div>
          {onChangeCategory && (
            // <select> nativo: quatro opções fixas não justificam um dropdown
            // próprio, e o nativo já vem com teclado e leitor de tela.
            <select
              value={conversation.category ?? ''}
              onChange={(e) => onChangeCategory((e.target.value || null) as WhatsappCategory | null)}
              title="Categoria do contato"
              aria-label="Categoria do contato"
              className="flex-none rounded-md border border-gray-200 bg-transparent px-2 py-1.5 text-xs font-medium dark:border-slate-700"
            >
              <option value="">Sem categoria</option>
              {WHATSAPP_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/40">
          <div className="flex flex-col gap-2 p-4">
            {loading && messages.length === 0 && (
              <div className="text-center text-xs text-gray-500">Carregando mensagens...</div>
            )}
            {groupByDay(messages).map((group) => (
              // Sticky por grupo: cada pílula sai da tela junto com o próprio dia,
              // em vez de todas empilharem no topo do scroll.
              <div key={group.items[0].id} className="flex flex-col gap-2">
                <div className="sticky top-0 z-10 flex justify-center py-1">
                  <span className="rounded-md bg-white/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 shadow-sm backdrop-blur dark:bg-gray-800/90 dark:text-gray-300">
                    {dayLabel(group.date)}
                  </span>
                </div>
                {group.items.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            ))}
            {conversationPending.map((p) => (
              <PendingBubble key={p.tempId} pending={p} onRetry={retry} onCancel={cancel} />
            ))}
          </div>
        </div>

        <MessageInput disabled={disabled} onSendText={onSendText} onSendMedia={handleSendMedia} />
      </div>
    </LightboxProvider>
  );
}
