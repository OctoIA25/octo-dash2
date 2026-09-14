import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upload, getPublicUrl, from } = vi.hoisted(() => {
  const upload = vi.fn();
  const getPublicUrl = vi.fn();
  return { upload, getPublicUrl, from: vi.fn(() => ({ upload, getPublicUrl })) };
});

vi.mock('@/lib/supabaseClient', () => ({ supabase: { storage: { from } } }));

import { garantirFotoNoStorage } from './memberPhotoService';

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('garantirFotoNoStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/membros-fotos/${path}` },
    }));
  });

  it('sem foto não envia nada', async () => {
    await expect(garantirFotoNoStorage('t1', '')).resolves.toBeNull();
    await expect(garantirFotoNoStorage('t1', null)).resolves.toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  // Foto já migrada: salvar o membro de novo não pode reenviar nem trocar o link.
  it('link que já está no Storage volta igual, sem novo envio', async () => {
    const link = 'https://x.supabase.co/storage/v1/object/public/membros-fotos/t1/a.png';
    await expect(garantirFotoNoStorage('t1', link)).resolves.toBe(link);
    expect(upload).not.toHaveBeenCalled();
  });

  // O motivo da mudança: data-URI de MBs dentro de permissions deixava a lista
  // de membros com 6 MB e estourava o statement timeout.
  it('data-URI vai para o bucket membros-fotos na pasta do tenant e volta como link', async () => {
    const link = await garantirFotoNoStorage('t1', PNG);

    expect(from).toHaveBeenCalledWith('membros-fotos');
    const [path, blob, opts] = upload.mock.calls[0];
    expect(path).toMatch(/^t1\/[\w-]+\.png$/);
    expect(blob).toBeInstanceOf(Blob);
    expect(opts).toMatchObject({ contentType: 'image/png', upsert: false });
    expect(link).toBe(`https://x.supabase.co/storage/v1/object/public/membros-fotos/${path}`);
  });

  // Falhar alto: gravar o data-URI de volta em silêncio traria o problema de volta.
  it('erro no envio vira erro, não data-URI gravado', async () => {
    upload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
    await expect(garantirFotoNoStorage('t1', PNG)).rejects.toThrow(/foto/i);
  });

  it('data-URI que não é imagem válida vira erro', async () => {
    await expect(garantirFotoNoStorage('t1', 'data:image/png;base64,@@@')).rejects.toThrow(/foto/i);
    expect(upload).not.toHaveBeenCalled();
  });
});
