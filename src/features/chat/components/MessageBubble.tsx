import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Download,
  FileText,
} from 'lucide-react';
import type { WhatsappMessage } from '../types';

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

function filenameFromUrl(url: string | null, fallback = 'arquivo'): string {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || fallback;
    return decodeURIComponent(last);
  } catch {
    return fallback;
  }
}

function MediaContent({ message, isOutbound }: { message: WhatsappMessage; isOutbound: boolean }) {
  const { message_type, media_url, body } = message;

  if (!media_url) {
    // Fallback: tipo de mídia mas sem URL (ainda processando ou erro)
    return (
      <p className="italic opacity-80">
        [{message_type}] {body || 'mídia não disponível'}
      </p>
    );
  }

  switch (message_type) {
    case 'image':
      return (
        <div className="space-y-1">
          <a href={media_url} target="_blank" rel="noopener noreferrer">
            <img
              src={media_url}
              alt={body ?? 'imagem'}
              className="max-h-[280px] max-w-full rounded object-cover"
              loading="lazy"
            />
          </a>
          {body && <p className="whitespace-pre-wrap break-words">{body}</p>}
        </div>
      );

    case 'video':
      return (
        <div className="space-y-1">
          <video
            src={media_url}
            controls
            className="max-h-[280px] max-w-full rounded"
            preload="metadata"
          />
          {body && <p className="whitespace-pre-wrap break-words">{body}</p>}
        </div>
      );

    case 'audio':
      return (
        <audio
          src={media_url}
          controls
          className="w-full max-w-[280px]"
          preload="metadata"
        />
      );

    case 'document': {
      const name = filenameFromUrl(media_url);
      return (
        <a
          href={media_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm ${
            isOutbound
              ? 'border-emerald-200/40 bg-emerald-600/30 text-white'
              : 'border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
          }`}
          title={name}
          download
        >
          <FileText className="h-5 w-5 flex-none" />
          <span className="max-w-[180px] truncate">{name}</span>
          <Download className="h-3.5 w-3.5 flex-none opacity-70" />
        </a>
      );
    }

    default:
      return (
        <p className="italic opacity-80">
          [{message_type}]{body ? `: ${body}` : ''}
        </p>
      );
  }
}

export function MessageBubble({ message }: Props) {
  const isOutbound = message.direction === 'outbound';
  const isText = message.message_type === 'text';
  const isTemplate = message.message_type === 'template';
  const isMedia = ['image', 'audio', 'video', 'document'].includes(message.message_type);

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          isOutbound
            ? 'bg-emerald-500 text-white rounded-br-none'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'
        }`}
      >
        {isText && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {isTemplate && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {isMedia && <MediaContent message={message} isOutbound={isOutbound} />}
        {!isText && !isTemplate && !isMedia && (
          <p className="italic opacity-80">
            [{message.message_type}]{message.body ? `: ${message.body}` : ''}
          </p>
        )}
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
