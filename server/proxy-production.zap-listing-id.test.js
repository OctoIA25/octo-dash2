/**
 * Regressão: leads do ZAP/Grupo OLX chegavam na Lia sem imóvel (36 de 39 com
 * property_code null, e 1 com o código ERRADO). Duas causas:
 *
 *  1) o portal manda o anúncio em `clientListingId`/`originListingId` (topo do
 *     body), e o normalizador só procurava em listing/listingId — nunca achava;
 *  2) um fallback extraía o BAIRRO do texto da mensagem e pegava o primeiro
 *     imóvel daquele bairro (`ilike bairro ... limit(1)`), sobrescrevendo o
 *     código real por um chute — inclusive imóveis não-aprovados, fora do feed.
 *
 * proxy-production.js não é importável (chama app.listen no import), então — como
 * os outros proxy-production.*.test.js — validamos o invariante no código-fonte e
 * replicamos a lógica pura para testar a precedência das chaves.
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

// Réplica da precedência do normalizador (a fonte não é importável).
const pickFirstNonEmpty = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '') ?? null;
const resolveZapListing = (body = {}) => pickFirstNonEmpty(
  body.interest_reference, body.property_code, body.codigo_imovel,
  body.clientListingId, body.client_listing_id, body.extraData?.clientListingId,
  body.originListingId, body.origin_listing_id, body.extraData?.originListingId,
  body.listingId,
);

// Payload real recebido do Grupo OLX (dados de contato trocados).
const payloadReal = {
  ddd: '13',
  name: 'Teste',
  email: 'lead@example.com',
  phone: '900000000',
  message: 'Olá, gostaria de ter mais informações para comprar: apartamento, R$ 629.900, Avenida Caetano Gornati, 1271 - Engordadouro, Jundiaí - SP que encontrei no Zap.',
  extraData: { leadType: 'CONTACT_FORM', leadCerto: false },
  leadOrigin: 'Grupo OLX',
  temperature: 'Alta',
  originLeadId: 'eaa62dea2add4788a2b40133646dbc76',
  clientListingId: '4PF1GD',
  originListingId: '2895131807',
  transactionType: 'SELL',
};

describe('normalizador ZAP — código do anúncio', () => {
  it('extrai clientListingId do payload real (o bug: vinha null)', () => {
    expect(resolveZapListing(payloadReal)).toBe('4PF1GD');
  });

  it('aceita clientListingId também aninhado em extraData', () => {
    expect(resolveZapListing({ extraData: { clientListingId: '13UL1GD' } })).toBe('13UL1GD');
  });

  it('cai para originListingId quando não há clientListingId', () => {
    expect(resolveZapListing({ originListingId: '2895131807' })).toBe('2895131807');
  });

  it('um código explícito no body ainda vence o do portal', () => {
    expect(resolveZapListing({ property_code: 'AP1139', clientListingId: '4PF1GD' })).toBe('AP1139');
  });

  it('payload sem anúncio → null (nunca um chute)', () => {
    expect(resolveZapListing({ name: 'Fulano' })).toBeNull();
  });
});

describe('proxy-production.js / api-server.js — invariantes', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: o normalizador lê clientListingId/originListingId`, () => {
      const def = source.match(/const propertyCode = pickFirstNonEmpty\([\s\S]*?\);/);
      expect(def, 'normalizeZapLeadPayload não encontrado').not.toBeNull();
      expect(def[0]).toContain('clientListingId');
      expect(def[0]).toContain('originListingId');
    });
  }

  it('o chute por bairro não voltou', () => {
    expect(sources['proxy-production.js']).not.toContain('extractZapCode');
    // A assinatura do chute: casar bairro do texto contra imoveis_locais e pegar o primeiro.
    expect(sources['proxy-production.js']).not.toMatch(/ilike\('bairro'/);
  });
});
