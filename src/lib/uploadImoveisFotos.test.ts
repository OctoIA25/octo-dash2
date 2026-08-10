/**
 * `toJpegBlob` é o fallback que roda quando o pipeline de marca d'água está
 * fora do ar (rawUpload, dentro de uploadImoveisFotos). É a lógica mais
 * arriscada da task: precisa nunca estourar (subir a foto no formato errado é
 * melhor que derrubar o save do imóvel) e nunca gerar um canvas gigante numa
 * foto de câmera/drone. `scaleToFit` é a conta pura por trás do bounding box
 * — testada isolada, sem precisar mockar canvas/DOM.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { toJpegBlob, scaleToFit } from './uploadImoveisFotos';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toJpegBlob', () => {
  it('blob já image/jpeg passa direto, sem reencodar', async () => {
    const original = new Blob(['bytes-fake'], { type: 'image/jpeg' });
    const { blob, ext } = await toJpegBlob(original);
    expect(blob).toBe(original); // mesma referência: não recriou o blob
    expect(ext).toBe('jpg');
  });

  it('se a conversão falhar (createImageBitmap indisponível), devolve o blob original em vez de estourar', async () => {
    const original = new Blob(['bytes-fake'], { type: 'image/png' });
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('não suportado neste ambiente')));

    const { blob, ext } = await toJpegBlob(original);

    expect(blob).toBe(original);
    expect(ext).toBe('png'); // extensão real do mime, não força .jpg numa foto que não é JPEG
  });
});

describe('scaleToFit', () => {
  it('reduz proporcionalmente quando a imagem excede o bounding box (foto de câmera/drone)', () => {
    expect(scaleToFit(8000, 6000, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it('não amplia imagem menor que o bounding box', () => {
    expect(scaleToFit(400, 300, 1280)).toEqual({ width: 400, height: 300 });
  });
});
