/**
 * Regressão: o `CA054` era o único imóvel elegível do tenant e a ZAP recusou a
 * importação inteira com "CEP vazio" (execução 77674476, 10/08/2026). O CEP era
 * opcional em toda a cadeia — opcional no formulário, ausente do
 * `getZapListingEligibility`, e o builder emitia `<PostalCode>` só
 * `if (imovel.cep)`. O imóvel ia para o portal, era recusado lá, e do nosso lado
 * não aparecia nada: nem no feed, nem no /debug.
 *
 * Agora `missing_cep` é motivo de inelegibilidade, então a falha aparece na
 * NOSSA tela antes de chegar ao portal.
 *
 * O feed está duplicado em proxy-production.js e api-server.js (prod roda o
 * proxy) e nenhum dos dois é importável (chamam app.listen no import), então —
 * como os demais proxy-production.*.test.js — replicamos a lógica pura e
 * checamos o invariante no código-fonte.
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

// Réplica do normalizador e do portão de CEP (a fonte não é importável).
const normalizeFeedText = (value, fallback = '') => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
};
const cepReasons = (imovel) => (normalizeFeedText(imovel.cep) ? [] : ['missing_cep']);

describe('portão de CEP do feed', () => {
  it('imóvel sem CEP sai do feed com motivo nomeado', () => {
    expect(cepReasons({ cep: null })).toEqual(['missing_cep']);
  });

  it('CEP vazio ou só espaços também sai (foi o caso do CA054)', () => {
    expect(cepReasons({ cep: '' })).toEqual(['missing_cep']);
    expect(cepReasons({ cep: '   ' })).toEqual(['missing_cep']);
  });

  it('coluna ausente na linha sai (não há CEP para mandar)', () => {
    expect(cepReasons({})).toEqual(['missing_cep']);
  });

  it('CEP preenchido passa', () => {
    expect(cepReasons({ cep: '13219-800' })).toEqual([]);
  });

  it('CEP sem máscara passa — quem normaliza formato é o cadastro, não o feed', () => {
    expect(cepReasons({ cep: '13219800' })).toEqual([]);
  });
});

describe('proxy-production.js / api-server.js — invariantes', () => {
  for (const [file, source] of Object.entries(sources)) {
    // O /debug existe para responder "por que este imóvel não está no feed". Sem
    // `cep` no SELECT ele acusava missing_cep em TODAS as linhas e publishable=0,
    // enquanto o feed publicava normalmente — diagnóstico que mente é pior que
    // diagnóstico nenhum, ainda mais para o motivo que já derrubou o feed uma vez.
    it(`${file}: o SELECT do /debug traz o cep que a elegibilidade cobra`, () => {
      const def = source.match(/const getZapFeedDebugInfo = async \(tenantId\) => \{[\s\S]*?\n\};/);
      expect(def, 'getZapFeedDebugInfo não encontrado').not.toBeNull();
      expect(def[0]).toMatch(/^\s+cep,\s*$/m);
    });

    it(`${file}: getZapListingEligibility exige CEP`, () => {
      const def = source.match(/const getZapListingEligibility = \(imovel\) => \{[\s\S]*?\n\};/);
      expect(def, 'getZapListingEligibility não encontrado').not.toBeNull();
      expect(def[0]).toContain('missing_cep');
    });
  }
});
