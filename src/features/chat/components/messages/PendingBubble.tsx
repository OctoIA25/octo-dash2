import { RotateCcw, X } from 'lucide-react';
import type { PendingMessage } from '../../types';

export function PendingBubble({
  pending,
  onRetry,
  onCancel,
}: {
  pending: PendingMessage;
  onRetry: (tempId: string) => void;
  onCancel: (tempId: string) => void;
}) {
  const failed = pending.status === 'failed';
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-lg rounded-br-none bg-emerald-500 px-3 py-2 text-sm text-white shadow-sm opacity-90">
        {pending.type === 'image' && (
          <img src={pending.objectUrl} alt={pending.file.name} className="max-h-[200px] max-w-full rounded object-cover" />
        )}
        {pending.type === 'video' && (
          <video src={pending.objectUrl} className="max-h-[200px] max-w-full rounded" />
        )}
        {(pending.type === 'audio' || pending.type === 'document') && (
          <div className="truncate">{pending.file.name}</div>
        )}
        {pending.caption && <p className="mt-1 whitespace-pre-wrap break-words">{pending.caption}</p>}

        <div className="mt-1.5">
          {failed ? (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-red-100">{pending.error ?? 'Falha ao enviar'}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => onRetry(pending.tempId)} aria-label="Reenviar" className="rounded p-1 hover:bg-white/20">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onCancel(pending.tempId)} aria-label="Cancelar" className="rounded p-1 hover:bg-white/20">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-emerald-200/40">
                <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${pending.progress}%` }} />
              </div>
              <span className="text-[10px] text-emerald-50">
                {pending.status === 'sending' ? 'enviando…' : `${pending.progress}%`}
              </span>
              <button type="button" onClick={() => onCancel(pending.tempId)} aria-label="Cancelar" className="rounded p-0.5 hover:bg-white/20">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
