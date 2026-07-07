import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import type { WhatsappMessage } from '../types';
import { resolveContent } from './messages/registry';

interface Props {
  message: WhatsappMessage;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function StatusIcon({ status }: { status: WhatsappMessage['status'] }) {
  switch (status) {
    case 'queued':
      return <Clock className="h-3 w-3 opacity-70" />;
    case 'sent':
      return <Check className="h-3 w-3 opacity-70" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 opacity-70" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-sky-300" />;
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

export function MessageBubble({ message }: Props) {
  const isOutbound = message.direction === 'outbound';
  const Content = resolveContent(message.message_type);

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          isOutbound
            ? 'bg-emerald-500 text-white rounded-br-none'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'
        }`}
      >
        <Content message={message} isOutbound={isOutbound} />
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            isOutbound ? 'text-emerald-50' : 'text-gray-500'
          }`}
        >
          <span>{formatTime(message.wa_timestamp ?? message.created_at)}</span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
