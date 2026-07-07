import { useMemo, useRef, useState } from 'react';
import { uploadWhatsappMediaWithProgress } from '../services/mediaUploadService';
import { sendMediaMessage } from '../services/whatsappService';
import type { MediaKind, PendingMessage } from '../types';

type Upload = typeof uploadWhatsappMediaWithProgress;
type SendMedia = typeof sendMediaMessage;

interface Deps {
  upload: Upload;
  sendMedia: SendMedia;
}
interface Args {
  conversationId: string;
  contactPhone: string;
  tenantId: string;
  objectUrlFor?: (file: File) => string;
}
type SetPending = (fn: (prev: PendingMessage[]) => PendingMessage[]) => void;

// tempId sem depender de Date.now/Math.random para facilitar teste determinístico:
let seq = 0;

export function createMediaSender(args: Args, deps: Deps, setPending: SetPending) {
  const controllers = new Map<string, AbortController>();
  const objectUrlFor = args.objectUrlFor ?? ((f: File) => URL.createObjectURL(f));

  const patch = (tempId: string, up: Partial<PendingMessage>) =>
    setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, ...up } : p)));

  const remove = (tempId: string) =>
    setPending((prev) => {
      const found = prev.find((p) => p.tempId === tempId);
      if (found && found.objectUrl.startsWith('blob:')) URL.revokeObjectURL(found.objectUrl);
      return prev.filter((p) => p.tempId !== tempId);
    });

  async function run(item: PendingMessage) {
    const ctrl = new AbortController();
    controllers.set(item.tempId, ctrl);
    try {
      patch(item.tempId, { status: 'uploading', progress: 0, error: undefined });
      const uploaded = await deps.upload({
        tenantId: args.tenantId,
        conversationId: args.conversationId,
        file: item.file,
        type: item.type,
        signal: ctrl.signal,
        onProgress: (pct) => patch(item.tempId, { progress: pct }),
      });
      patch(item.tempId, { status: 'sending' });
      const res = await deps.sendMedia({
        conversationId: args.conversationId,
        to: args.contactPhone,
        type: uploaded.type,
        url: uploaded.url,
        caption: item.caption || undefined,
        filename: uploaded.type === 'document' ? uploaded.filename : undefined,
      });
      if (!res.ok) {
        patch(item.tempId, { status: 'failed', error: res.error ?? 'Falha ao enviar' });
        return;
      }
      remove(item.tempId); // realtime traz a mensagem real
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        remove(item.tempId);
        return;
      }
      patch(item.tempId, { status: 'failed', error: err instanceof Error ? err.message : 'Erro' });
    } finally {
      controllers.delete(item.tempId);
    }
  }

  return {
    send(file: File, type: MediaKind, caption: string) {
      const tempId = `pending-${++seq}`;
      const item: PendingMessage = {
        tempId,
        conversationId: args.conversationId,
        type,
        file,
        caption,
        objectUrl: objectUrlFor(file),
        status: 'uploading',
        progress: 0,
      };
      setPending((prev) => [...prev, item]);
      return run(item);
    },
    retry(tempId: string) {
      setPending((prev) => {
        const item = prev.find((p) => p.tempId === tempId);
        if (item) void run(item);
        return prev;
      });
    },
    cancel(tempId: string) {
      controllers.get(tempId)?.abort();
      remove(tempId);
    },
  };
}

export function useMediaSend(args: Omit<Args, 'objectUrlFor'>) {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const senderRef = useRef<ReturnType<typeof createMediaSender> | null>(null);
  // recria o sender quando a conversa muda (limpa controllers)
  const sender = useMemo(() => {
    const s = createMediaSender(args, { upload: uploadWhatsappMediaWithProgress, sendMedia: sendMediaMessage }, setPending);
    senderRef.current = s;
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.conversationId, args.contactPhone, args.tenantId]);

  return { pending, send: sender.send, retry: sender.retry, cancel: sender.cancel };
}
