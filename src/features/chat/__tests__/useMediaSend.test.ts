import { describe, it, expect, vi } from 'vitest';
import { createMediaSender } from '../hooks/useMediaSend';

function makeFile() {
  return new File([new Uint8Array(1)], 'a.png', { type: 'image/png' });
}

function harness(deps: Parameters<typeof createMediaSender>[1]) {
  let state: import('../types').PendingMessage[] = [];
  const setState = (fn: (p: typeof state) => typeof state) => { state = fn(state); };
  const sender = createMediaSender(
    { conversationId: 'c', contactPhone: '55', tenantId: 't', objectUrlFor: () => 'blob:x' },
    deps,
    setState,
  );
  return { sender, get: () => state };
}

describe('createMediaSender', () => {
  it('sucesso: cria pending e remove ao enviar ok', async () => {
    const upload = vi.fn().mockResolvedValue({ url: 'https://u', type: 'image', filename: 'a.png', mime: 'image/png', size: 1 });
    const sendMedia = vi.fn().mockResolvedValue({ ok: true });
    const { sender, get } = harness({ upload, sendMedia });
    const p = sender.send(makeFile(), 'image', 'cap');
    expect(get()).toHaveLength(1);
    expect(get()[0].status).toBe('uploading');
    await p;
    expect(get()).toHaveLength(0);
    expect(sendMedia).toHaveBeenCalledWith(expect.objectContaining({ type: 'image', url: 'https://u', caption: 'cap' }));
  });

  it('falha no upload: pending vira failed', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('boom'));
    const sendMedia = vi.fn();
    const { sender, get } = harness({ upload, sendMedia });
    await sender.send(makeFile(), 'image', '');
    expect(get()).toHaveLength(1);
    expect(get()[0].status).toBe('failed');
    expect(sendMedia).not.toHaveBeenCalled();
  });

  it('falha no send: pending vira failed', async () => {
    const upload = vi.fn().mockResolvedValue({ url: 'https://u', type: 'image', filename: 'a', mime: 'image/png', size: 1 });
    const sendMedia = vi.fn().mockResolvedValue({ ok: false, error: 'x' });
    const { sender, get } = harness({ upload, sendMedia });
    await sender.send(makeFile(), 'image', '');
    expect(get()[0].status).toBe('failed');
  });

  it('cancel remove a pending', async () => {
    let resolveUpload: (v: unknown) => void = () => {};
    const upload = vi.fn().mockImplementation(() => new Promise((r) => { resolveUpload = r; }));
    const { sender, get } = harness({ upload, sendMedia: vi.fn() });
    sender.send(makeFile(), 'image', '');
    const id = get()[0].tempId;
    sender.cancel(id);
    expect(get()).toHaveLength(0);
  });

  it('cancel + abort do upload real: remove chamado 2x sem erro (idempotente)', async () => {
    const upload = vi.fn().mockImplementation((p: { signal?: AbortSignal }) =>
      new Promise((_, reject) => {
        p.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
      }),
    );
    const { sender, get } = harness({ upload, sendMedia: vi.fn() });
    const p = sender.send(makeFile(), 'image', '');
    sender.cancel(get()[0].tempId);
    await p; // deixa o catch de AbortError rodar e chamar remove() de novo
    expect(get()).toHaveLength(0); // ainda 0, sem throw
  });
});
