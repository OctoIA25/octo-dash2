/**
 * Testa a função real (antes o teste rodava uma réplica, e uma mutação no
 * fonte — inverter o sort, por exemplo — passava despercebida).
 *
 * A montagem do <Item primary="true"> continua verificada por leitura do
 * fonte: os dois entrypoints chamam app.listen no import, e a marcação é uma
 * interpolação de template sem lógica própria.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractZapPhotoUrls } from './feedPhotos.js';

const A = 'https://cdn.test/a.jpg';
const B = 'https://cdn.test/b.jpg';
const C = 'https://cdn.test/c.jpg';

describe('extractZapPhotoUrls', () => {
  it('a foto marcada como capa vai para a primeira posição', () => {
    expect(extractZapPhotoUrls([{ url: A }, { url: B, isCapa: true }, { url: C }])).toEqual([B, A, C]);
  });

  it('sem capa marcada, a ordem original é preservada', () => {
    expect(extractZapPhotoUrls([{ url: A }, { url: B }])).toEqual([A, B]);
  });

  it('lista legada de strings continua funcionando', () => {
    expect(extractZapPhotoUrls([A, B])).toEqual([A, B]);
  });

  it('duplicatas são removidas mantendo a capa', () => {
    expect(extractZapPhotoUrls([{ url: A }, { url: A, isCapa: true }])).toEqual([A]);
  });

  it('URL não-http fica fora', () => {
    expect(extractZapPhotoUrls([{ url: 'ftp://x/y.jpg' }, { url: A }])).toEqual([A]);
  });

  it('entrada inválida vira lista vazia', () => {
    expect(extractZapPhotoUrls(null)).toEqual([]);
    expect(extractZapPhotoUrls('não é array')).toEqual([]);
  });

  it('corta em 30 fotos', () => {
    const muitas = Array.from({ length: 40 }, (_, i) => ({ url: `https://cdn.test/${i}.jpg` }));
    expect(extractZapPhotoUrls(muitas)).toHaveLength(30);
  });
});

describe('proxy-production.js / api-server.js — invariantes do feed', () => {
  const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');

  for (const file of ['proxy-production.js', 'api-server.js']) {
    const source = readFileSync(join(serverDir, file), 'utf8');

    it(`${file}: o feed emite primary="true" no primeiro Item`, () => {
      expect(source).toContain('primary="true"');
    });

    it(`${file}: usa a ordenação compartilhada, sem cópia local`, () => {
      expect(source).toContain("extractZapPhotoUrls } from './zap/index.js'");
      expect(source).not.toContain('const extractZapPhotoUrls =');
    });
  }
});
