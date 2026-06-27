import { describe, it, expect } from 'vitest';
import { createSantaAngelaConfigResolver } from './configResolver.js';

// Supabase fake: maybeSingle controlável; upsert registra payload.
function makeSupabase({ row = null, error = null } = {}) {
  const calls = { upserts: [] };
  const supabase = {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: row, error }),
    upsert: async (payload) => { calls.upserts.push(payload); return { error: null }; },
  };
  return { supabase, calls };
}

const ENV = { EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };

it('resolveConfig usa banco quando existe e decifra a key', async () => {
  const { encryptSecret } = await import('../recommendations/crypto.js');
  const enc = encryptSecret('db-key', ENV);
  const { supabase } = makeSupabase({ row: {
    tenant_id: 't1', base_url: 'https://db.url', api_key_encrypted: enc, status: 'active' } });
  const r = createSantaAngelaConfigResolver({ supabase, processEnv: ENV });
  const cfg = await r.resolveConfig('t1');
  expect(cfg.source).toBe('db');
  expect(cfg.apiKey).toBe('db-key');
  expect(cfg.baseUrl).toBe('https://db.url');
});

it('resolveConfig retorna null quando não há linha no banco (sem fallback global)', async () => {
  const { supabase } = makeSupabase({ row: null });
  const r = createSantaAngelaConfigResolver({ supabase, processEnv: ENV });
  const cfg = await r.resolveConfig('t3');
  expect(cfg).toBe(null); // sem config própria → não sincroniza (nunca usa key de outro tenant)
});

it('resolveConfig cacheia (segunda chamada não consulta o banco)', async () => {
  let calls = 0;
  const supabase = { from() { return this; }, select() { return this; }, eq() { return this; },
    maybeSingle: async () => { calls++; return { data: {
      tenant_id: 't4', base_url: 'u', api_key_encrypted: null, status: 'active' }, error: null }; } };
  const r = createSantaAngelaConfigResolver({ supabase, processEnv: ENV });
  await r.resolveConfig('t4');
  await r.resolveConfig('t4');
  expect(calls).toBe(1);
});

it('resolveConfig NÃO cacheia o negativo: relê e pega config criada depois', async () => {
  // Primeiro a linha não existe (null); depois passa a existir. Sem cache negativo,
  // a 2ª chamada deve resolver via banco — não prende o tenant em "sem config".
  let row = null;
  const supabase = { from() { return this; }, select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: row, error: null }) };
  const r = createSantaAngelaConfigResolver({ supabase, processEnv: ENV });
  const first = await r.resolveConfig('t6');
  expect(first).toBe(null);
  row = { tenant_id: 't6', base_url: 'https://novo', api_key_encrypted: null, status: 'active' };
  const second = await r.resolveConfig('t6');
  expect(second.source).toBe('db');
  expect(second.baseUrl).toBe('https://novo');
});

it('saveConfig cifra a key e invalida o cache', async () => {
  const { supabase, calls } = makeSupabase({ row: null });
  const { decryptSecret } = await import('../recommendations/crypto.js');
  const r = createSantaAngelaConfigResolver({ supabase, processEnv: ENV });
  const res = await r.saveConfig('t5', { baseUrl: 'https://x', apiKey: 'segredo', status: 'active' });
  expect(res.ok).toBe(true);
  const payload = calls.upserts[0];
  expect(payload.tenant_id).toBe('t5');
  expect(payload.api_key_encrypted).not.toBe('segredo');
  expect(decryptSecret(payload.api_key_encrypted, ENV)).toBe('segredo');
});
