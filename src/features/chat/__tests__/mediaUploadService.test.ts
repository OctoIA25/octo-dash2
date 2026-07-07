import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do supabase client usado pelo service
const createSignedUploadUrl = vi.fn();
const getPublicUrl = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUploadUrl: createSignedUploadUrl,
        getPublicUrl: getPublicUrl,
      }),
    },
  },
}));

import { uploadWhatsappMediaWithProgress } from '../services/mediaUploadService';

function fakeFile(size: number, type = 'image/png', name = 'a.png'): File {
  const blob = new Blob([new Uint8Array(1)], { type });
  Object.defineProperty(blob, 'size', { value: size });
  const file = new File([blob], name, { type });
  // jsdom's File recomputes `size` from the actual bytes, ignoring the Blob override above.
  // Force it so tests can simulate large files without allocating real memory.
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('uploadWhatsappMediaWithProgress', () => {
  beforeEach(() => {
    createSignedUploadUrl.mockReset();
    getPublicUrl.mockReset();
  });

  it('rejeita arquivo acima do limite antes de qualquer upload', async () => {
    const big = fakeFile(6 * 1024 * 1024, 'image/png'); // >5MB (limite image)
    await expect(
      uploadWhatsappMediaWithProgress({ tenantId: 't', conversationId: 'c', file: big }),
    ).rejects.toThrow(/muito grande/i);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejeita se signal já abortado, sem chamar upload', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const f = fakeFile(1024, 'image/png');
    await expect(
      uploadWhatsappMediaWithProgress({
        tenantId: 't', conversationId: 'c', file: f, signal: ctrl.signal,
      }),
    ).rejects.toThrow(/abort/i);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
