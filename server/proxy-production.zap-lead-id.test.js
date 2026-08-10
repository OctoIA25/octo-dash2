/**
 * Regressão: TODO lead do ZAP/Grupo OLX entrava com um external_id aleatório
 * (`zap_im_veis_<timestamp>_<random>`), então a checagem de duplicata por
 * `source_lead_id` em createIncomingLead nunca casava — reenvio do mesmo lead
 * pelo portal criava um lead novo.
 *
 * Causa: o portal manda o ID em `originLeadId` (topo do body) e o normalizador
 * só procurava `id`/`leadId`/`lead_id`/`data.id`/`payload.id`. Verificado nos 43
 * leads do tenant Japi Lançamentos: todos com `raw_data.zap_lead_id: null`.
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
const resolveZapLeadId = (body = {}) => pickFirstNonEmpty(
  body.id, body.leadId, body.lead_id, body.lead?.id, body.lead?.leadId,
  body.data?.id, body.data?.leadId, body.payload?.id, body.payload?.leadId,
  body.originLeadId, body.origin_lead_id, body.extraData?.originLeadId,
);
const toExternalId = (body) => {
  const id = resolveZapLeadId(body);
  return id ? `zap_${id}` : null;
};

// Payload real recebido do Grupo OLX (dados de contato trocados).
const payloadReal = {
  ddd: '11',
  name: 'Teste',
  email: 'lead@example.com',
  phone: '900000000',
  message: 'Olá! Você tem uma nova visualização de WhatsApp.',
  extraData: { leadType: 'CLICK_WHATSAPP', leadCerto: false },
  leadOrigin: 'Grupo OLX',
  temperature: 'Alta',
  originLeadId: 'e9576cce4c654e79aa0bc7ada04ef53b',
  clientListingId: 'IT4UFJ',
  originListingId: '2894431997',
  transactionType: 'SELL',
};

describe('normalizador ZAP — ID do lead', () => {
  it('extrai originLeadId do payload real (o bug: vinha null)', () => {
    expect(toExternalId(payloadReal)).toBe('zap_e9576cce4c654e79aa0bc7ada04ef53b');
  });

  it('mesmo payload duas vezes → mesmo external_id (é isso que liga a dedup)', () => {
    expect(toExternalId(payloadReal)).toBe(toExternalId({ ...payloadReal }));
  });

  it('aceita originLeadId aninhado em extraData', () => {
    expect(toExternalId({ extraData: { originLeadId: 'abc123' } })).toBe('zap_abc123');
  });

  it('um ID explícito no body ainda vence o do portal', () => {
    expect(toExternalId({ leadId: 'CRM-9', originLeadId: 'abc123' })).toBe('zap_CRM-9');
  });

  it('payload sem ID → null (deixa o fallback aleatório agir, como antes)', () => {
    expect(toExternalId({ name: 'Fulano' })).toBeNull();
  });
});

describe('proxy-production.js / api-server.js — invariantes', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: o normalizador lê originLeadId`, () => {
      const def = source.match(/const zapLeadId = pickNestedText\([\s\S]*?\]\);/);
      expect(def, 'zapLeadId não encontrado').not.toBeNull();
      expect(def[0]).toContain('originLeadId');
    });
  }
});
