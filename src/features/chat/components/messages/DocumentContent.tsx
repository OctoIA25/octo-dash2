import { Download, FileText } from 'lucide-react';
import type { MessageContentProps } from '../../types';

function filenameFromUrl(url: string | null, fallback = 'arquivo'): string {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || fallback);
  } catch {
    return fallback;
  }
}

export function DocumentContent({ message, isOutbound }: MessageContentProps) {
  if (!message.media_url) {
    return <p className="italic opacity-80">[document] {message.body || 'documento indisponível'}</p>;
  }
  const name = filenameFromUrl(message.media_url);
  return (
    <a
      href={message.media_url}
      target="_blank"
      rel="noopener noreferrer"
      download
      title={name}
      className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm ${
        isOutbound
          ? 'border-emerald-200/40 bg-emerald-600/30 text-white'
          : 'border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
      }`}
    >
      <FileText className="h-5 w-5 flex-none" />
      <span className="max-w-[180px] truncate">{name}</span>
      <Download className="h-3.5 w-3.5 flex-none opacity-70" />
    </a>
  );
}
