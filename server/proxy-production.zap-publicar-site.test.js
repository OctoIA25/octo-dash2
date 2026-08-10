/**
 * Regressão: a seção "Publicação na Web" do formulário de imóveis (Anunciar /
 * Destaque / Super Destaque) era UI morta — nada era gravado e publicar
 * dependia só de `status_aprovacao = 'aprovado'`. Com a coluna
 * `publicar_site` (migration 20260810), o feed ZAP/Grupo OLX passa a exigir os
 * DOIS portões.
 *
 * O feed está DUPLICADO em proxy-production.js e api-server.js (prod roda o
 * proxy). O risco real é um dos dois ficar para trás — por isso o invariante é
 * checado nos dois. Nenhum dos arquivos é importável (chamam app.listen no
 * import), então validamos no código-fonte, como os demais proxy-production.*.
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

// Réplica do portão (a fonte não é importável). O invariante de que os
// arquivos reais usam esta regra está no describe seguinte.
const isAnunciado = (imovel) => imovel.publicar_site !== false;

describe('portão "Anunciar" do feed', () => {
  it('publicar_site false tira do feed', () => {
    expect(isAnunciado({ publicar_site: false })).toBe(false);
  });

  it('publicar_site true entra', () => {
    expect(isAnunciado({ publicar_site: true })).toBe(true);
  });

  it('linha sem a coluna carregada NÃO some do feed (não regride o acervo)', () => {
    expect(isAnunciado({})).toBe(true);
    expect(isAnunciado({ publicar_site: null })).toBe(true);
  });
});

describe('feed ZAP/Grupo OLX — só publica o que está aprovado E anunciado', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: a elegibilidade reprova imóvel com publicar_site false`, () => {
      const fn = source.match(/const getZapListingEligibility = \(imovel\) => \{[\s\S]*?\n};/);
      expect(fn, 'getZapListingEligibility não encontrado').not.toBeNull();
      expect(fn[0]).toContain("imovel.publicar_site === false");
      expect(fn[0]).toContain("'nao_anunciado'");
    });

    it(`${file}: as queries do feed trazem publicar_site (sem a coluna o portão não fecha)`, () => {
      for (const nome of ['getZapFeedListings', 'getZapFeedDebugInfo']) {
        const fn = source.match(new RegExp(`const ${nome} = async[\\s\\S]*?\\n};`));
        expect(fn, `${nome} não encontrado`).not.toBeNull();
        expect(fn[0], `${nome} não seleciona publicar_site`).toContain('publicar_site');
      }
    });
  }
});
