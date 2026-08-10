/**
 * A URL publicada no JSONB `fotos` vai para o feed VRSync, e o Grupo OLX só
 * importa JPG — olhando a extensão da URL. Ela precisa terminar em `.jpg` sem
 * deixar de ser o endpoint dinâmico (que é o que faz o toggle da marca d'água
 * funcionar sem reescrever o banco).
 *
 * `uploadViaWatermarkPipeline` é um módulo ES normal (sem `app.listen()` no
 * import), então testamos comportamento de verdade: mock de `./supabaseClient`
 * (padrão já usado no repo, ex. MetaLeadAdsCard.test.tsx) + `global.fetch`,
 * e checagem do VALOR retornado — não do texto do arquivo.
 *
 * A única exceção é a rota do servidor (`routes.js`): esse teste continua
 * lendo o código-fonte, porque exercitá-la de verdade exigiria montar Express
 * + mocks de Supabase só para validar uma string de URL — desproporcional ao
 * que essa asserção precisa garantir.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-teste' } } }) } },
}));

import { uploadViaWatermarkPipeline } from './watermarkUpload';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routes = readFileSync(
  join(__dirname, '..', '..', 'server', 'watermark', 'routes.js'), 'utf8',
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadViaWatermarkPipeline', () => {
  it('devolve a URL do endpoint terminando em .jpg — não a URL da CDN', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'foto-123' }) }) // POST /photos
      .mockResolvedValueOnce({ ok: true }); // warm-up (resposta descartada)
    vi.stubGlobal('fetch', fetchMock);

    const { url, id } = await uploadViaWatermarkPipeline(new Blob(['x']), 'tenant-1', 'imovel-1');

    expect(id).toBe('foto-123');
    expect(url).toBe(`${window.location.origin}/api/v1/watermark/photos/foto-123/portal.jpg`);
    expect(url).not.toMatch(/supabase\.co\/storage/);
  });

  it('dispara o warm-up do derivado (?redirect=0) depois do upload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'foto-123' }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await uploadViaWatermarkPipeline(new Blob(['x']), 'tenant-1', 'imovel-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/watermark/photos/foto-123/portal?redirect=0');
  });

  it('propaga exceção se o POST falhar — é o que aciona o fallback no chamador', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }));

    await expect(
      uploadViaWatermarkPipeline(new Blob(['x']), 'tenant-1', 'imovel-1'),
    ).rejects.toThrow('watermark upload falhou (500)');
  });
});

describe('rota do derivado (routes.js) — extensão precisa bater com o formato real do perfil', () => {
  it('valida a extensão pedida contra formatFor(sizeName) em vez de só stripar', () => {
    expect(routes).toContain('formatFor(sizeName)');
  });

  it('usa o nome do tamanho já sem extensão ao gerar o derivado', () => {
    expect(routes).toContain('ensureDerivative(req.params.id, sizeName)');
  });
});
