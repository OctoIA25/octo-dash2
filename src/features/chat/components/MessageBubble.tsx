import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import type { WhatsappMessage } from '../types';
import { resolveContent } from './messages/registry';
import { quemEnviou, ROTULO_DO_AUTOR } from '../quemEnviou';

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
  // F.1 — quem falou. Só nas enviadas: na recebida, a posição da bolha já diz
  // que foi o cliente.
  const autor = quemEnviou(message);

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
          {autor && (
            <span
              className={`mr-auto rounded px-1 py-px font-medium ${
                autor === 'lia'
                  ? 'bg-emerald-700/40 text-white'
                  : autor === 'nao_registrado'
                    ? 'bg-emerald-700/20 text-emerald-50/70 italic'
                    : 'bg-white/25 text-white'
              }`}
              title={
                autor === 'nao_registrado'
                  ? 'Esta mensagem foi enviada sem registrar quem a escreveu.'
                  : undefined
              }
            >
              {autor === 'nao_registrado' ? 'sem autor' : ROTULO_DO_AUTOR[autor]}
            </span>
          )}
          <span>{formatTime(message.wa_timestamp ?? message.created_at)}</span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
