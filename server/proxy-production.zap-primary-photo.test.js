/**
 * O VRSync marca a foto de destaque com primary="true". O JSONB `fotos` já
 * carrega `isCapa`, mas o feed achatava para string e perdia a marcação —
 * a ZAP escolhia a capa por ordem de envio.
 *
 * O feed é duplicado em proxy-production.js e api-server.js e nenhum dos dois
 * é importável (chamam app.listen), então replicamos a lógica pura e checamos
 * o invariante no código-fonte, como os demais proxy-production.*.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sources = {
  'proxy-production.js': readFileSync(join(__dirname, 'proxy-production.js'), 'utf8'),
  'api-server.js': readFileSync(join(__dirname, 'api-server.js'), 'utf8'),
};

// Réplica da lógica pura (a fonte não é importável).
const normalize = (photo) => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo.trim();
  if (typeof photo === 'object') {
    return String(photo.url || photo.src || photo.preview || photo.publicUrl || '').trim() || null;
  }
  return null;
};
const extract = (photos) => {
  const raw = Array.isArray(photos) ? photos : [];
  const isCapa = (p) => (p?.isCapa ? 1 : 0);
  const seen = new Set();
  return [...raw]
    .sort((a, b) => isCapa(b) - isCapa(a))
    .map(normalize)
    .filter((url) => url && /^https?:\/\//i.test(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 30);
};
const mediaItems = (urls) =>
  urls.map((url, i) => `<Item medium="image"${i === 0 ? ' primary="true"' : ''} caption="img${i + 1}">${url}</Item>`);

const A = 'https://cdn.test/a.jpg';
const B = 'https://cdn.test/b.jpg';
const C = 'https://cdn.test/c.jpg';

describe('ordem das fotos no feed', () => {
  it('a foto marcada como capa vai para a primeira posição', () => {
    expect(extract([{ url: A }, { url: B, isCapa: true }, { url: C }])).toEqual([B, A, C]);
  });

  it('sem capa marcada, a ordem original é preservada', () => {
    expect(extract([{ url: A }, { url: B }])).toEqual([A, B]);
  });

  it('lista legada de strings continua funcionando', () => {
    expect(extract([A, B])).toEqual([A, B]);
  });

  it('duplicatas continuam removidas', () => {
    expect(extract([{ url: A }, { url: A, isCapa: true }])).toEqual([A]);
  });

  it('URL inválida continua fora', () => {
    expect(extract([{ url: 'ftp://x/y.jpg' }, { url: A }])).toEqual([A]);
  });
});

describe('primary no XML', () => {
  it('só o primeiro Item recebe primary="true"', () => {
    const items = mediaItems([A, B, C]);
    expect(items[0]).toContain('primary="true"');
    expect(items[1]).not.toContain('primary');
    expect(items[2]).not.toContain('primary');
  });

  it('lista vazia não gera Item', () => {
    expect(mediaItems([])).toEqual([]);
  });
});

describe('proxy-production.js / api-server.js — invariantes', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: o feed emite primary="true"`, () => {
      expect(source).toContain('primary="true"');
    });

    it(`${file}: extractZapPhotoUrls ordena a capa primeiro`, () => {
      const def = source.match(/const extractZapPhotoUrls = \(photos\) => \{[\s\S]*?\n\};/);
      expect(def, 'extractZapPhotoUrls não encontrado').not.toBeNull();
      expect(def[0]).toContain('isCapa');
    });
  }
});
