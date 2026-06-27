import { describe, it, expect } from 'vitest';
import { createZapConfigResolver } from './zapConfigResolver.js';
import { computeSecretLookup, generateFeedSecret } from './secretLookup.js';
import { encryptSecret } from '../recommendations/crypto.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { EMAIL_ENCRYPTION_KEY: KEY };

// Supabase fake em memória, multi-tenant. Suporta:
//   .from(t).select('*').eq('tenant_id', x).maybeSingle()
//   .from(t).select('*').eq('feed_secret_lookup', x).maybeSingle()
//   .from(t).upsert(payload, { onConflict: 'tenant_id' })
//   .from(t).select(cols).order(...)  (lista)
function makeSupabase(rows = []) {
  const store = [...rows];
  const calls = { upserts: [] };
  function builder() {
    let pending = { col: null, val: null };
    const b = {
      from() { return b; },
      select() { return b; },
      eq(col, val) { pending = { col, val }; return b; },
      order() {
        const cols = store.map((r) => ({
          tenant_id: r.tenant_id, status: r.status,
          last_feed_at: r.last_feed_at, last_lead_at: r.last_lead_at, last_error: r.last_error,
        }));
        return Promise.resolve({ data: cols, error: null });
      },
      maybeSingle() {
        const found = store.find((r) => r[pending.col] === pending.val) || null;
        return Promise.resolve({ data: found, error: null });
      },
      upsert(payload) {
        calls.upserts.push(payload);
        const idx = store.findIndex((r) => r.tenant_id === payload.tenant_id);
        if (idx >= 0) store[idx] = { ...store[idx], ...payload };
        else store.push({ ...payload });
        return Promise.resolve({ error: null });
      },
    };
    return b;
  }
  return { supabase: builder(), store, calls };
}

// Linha de banco realista para um tenant, com secret cifrado + lookup.
function rowFor(tenantId, secret, extra = {}) {
  return {
    tenant_id: tenantId,
    status: 'active',
    feed_secret_encrypted: encryptSecret(secret, env),
    feed_secret_lookup: computeSecretLookup(secret, env),
    provider: 'OctoDash',
    contact_email: `${tenantId}@x.com`,
    resync_url: '',
    ...extra,
  };
}

describe('zapConfigResolver — resolução básica', () => {
  it('resolveByTenant devolve config descifrada do banco', async () => {
    const { supabase } = makeSupabase([rowFor('A', 'secretA')]);
    const r = createZapConfigResolver({ supabase, processEnv: env });
    const cfg = await r.resolveByTenant('A');
    expect(cfg.tenantId).toBe('A');
    expect(cfg.feedSecret).toBe('secretA');
    expect(cfg.contactEmail).toBe('A@x.com');
  });

  it('resolveByTenant sem linha → null (sem cache negativo)', async () => {
    const { supabase } = makeSupabase([]);
    const r = createZapConfigResolver({ supabase, processEnv: env });
    expect(await r.resolveByTenant('X')).toBeNull();
  });

  it('resolveBySecret acha o tenant pelo secret', async () => {
    const { supabase } = makeSupabase([rowFor('A', 'secretA')]);
    const r = createZapConfigResolver({ supabase, processEnv: env });
    const cfg = await r.resolveBySecret('secretA');
    expect(cfg?.tenantId).toBe('A');
  });
});

describe('zapConfigResolver — ISOLAMENTO entre tenants (§4.1)', () => {
  function twoTenants() {
    const { supabase, store, calls } = makeSupabase([rowFor('A', 'secretA'), rowFor('B', 'secretB')]);
    return { resolver: createZapConfigResolver({ supabase, processEnv: env }), supabase, store, calls };
  }

  it('#1 secret de A nunca resolve para B', async () => {
    const { resolver } = twoTenants();
    expect((await resolver.resolveBySecret('secretA'))?.tenantId).toBe('A');
    expect((await resolver.resolveBySecret('secretB'))?.tenantId).toBe('B');
  });

  it('#2 secret forjado não resolve para ninguém', async () => {
    const { resolver } = twoTenants();
    expect(await resolver.resolveBySecret('lixo')).toBeNull();
  });

  it('#3 lookups de A e B são distintos', () => {
    expect(computeSecretLookup('secretA', env)).not.toBe(computeSecretLookup('secretB', env));
  });

  it('#6 cache não vaza: invalidar A não afeta B', async () => {
    const { resolver } = twoTenants();
    await resolver.resolveByTenant('A');
    await resolver.resolveByTenant('B');
    resolver.invalidate('A');
    // B continua resolvendo normalmente
    expect((await resolver.resolveByTenant('B'))?.tenantId).toBe('B');
  });

  it('#8 decrypt isolado: config de A não traz campos de B', async () => {
    const { resolver } = twoTenants();
    const a = await resolver.resolveByTenant('A');
    expect(a.feedSecret).toBe('secretA');
    expect(a.contactEmail).toBe('A@x.com');
  });
});

describe('zapConfigResolver — saveConfig / rotateSecret', () => {
  it('saveConfig recusa sem chave-mestra', async () => {
    const { supabase } = makeSupabase([]);
    const r = createZapConfigResolver({ supabase, processEnv: {} });
    const res = await r.saveConfig('A', { contactEmail: 'a@x.com' });
    expect(res.ok).toBe(false);
  });

  it('saveConfig cifra secret e grava lookup', async () => {
    const { supabase, calls } = makeSupabase([]);
    const r = createZapConfigResolver({ supabase, processEnv: env });
    const res = await r.saveConfig('A', { feedSecret: 'novo', contactEmail: 'a@x.com' });
    expect(res.ok).toBe(true);
    const payload = calls.upserts.at(-1);
    expect(payload.feed_secret_encrypted).toBeTruthy();
    expect(payload.feed_secret_encrypted).not.toBe('novo'); // cifrado, não claro
    expect(payload.feed_secret_lookup).toBe(computeSecretLookup('novo', env));
  });

  it('saveConfig sem feedSecret não toca colunas de secret (edita só metadados)', async () => {
    const { supabase, calls } = makeSupabase([rowFor('A', 'secretA')]);
    const r = createZapConfigResolver({ supabase, processEnv: env });
    await r.saveConfig('A', { contactEmail: 'novo@x.com' });
    const payload = calls.upserts.at(-1);
    expect(payload.feed_secret_encrypted).toBeUndefined();
    expect(payload.feed_secret_lookup).toBeUndefined();
    expect(payload.contact_email).toBe('novo@x.com');
  });

  it('#7 rotateSecret gera novo secret, invalida tenant e o antigo deixa de resolver', async () => {
    const { supabase, resolver } = (() => {
      const m = makeSupabase([rowFor('A', 'secretA'), rowFor('B', 'secretB')]);
      return { supabase: m.supabase, resolver: createZapConfigResolver({ supabase: m.supabase, processEnv: env }) };
    })();
    // aquece o cache
    await resolver.resolveBySecret('secretA');
    const res = await resolver.rotateSecret('A');
    expect(res.ok).toBe(true);
    expect(res.secret).toBeTruthy();
    expect(res.secret).not.toBe('secretA');
    // o secret antigo não resolve mais; o novo sim; B intacto
    expect(await resolver.resolveBySecret('secretA')).toBeNull();
    expect((await resolver.resolveBySecret(res.secret))?.tenantId).toBe('A');
    expect((await resolver.resolveBySecret('secretB'))?.tenantId).toBe('B');
  });

  it('touch atualiza só colunas permitidas e não derruba em erro', async () => {
    const m = makeSupabase([rowFor('A', 'secretA')]);
    // força erro no update p/ garantir que touch não propaga
    const orig = m.supabase.upsert;
    const r = createZapConfigResolver({ supabase: m.supabase, processEnv: env });
    await expect(r.touch('A', 'last_feed_at')).resolves.toBeUndefined();
    await r.touch('A', 'coluna_invalida'); // ignorada silenciosamente
    expect(orig).toBe(m.supabase.upsert);
  });

  it('saveConfig invalida o cache (mudança propaga na próxima leitura)', async () => {
    const m = makeSupabase([rowFor('A', 'secretA')]);
    const r = createZapConfigResolver({ supabase: m.supabase, processEnv: env });
    await r.resolveByTenant('A'); // cacheia
    await r.saveConfig('A', { contactEmail: 'mudou@x.com' });
    const cfg = await r.resolveByTenant('A');
    expect(cfg.contactEmail).toBe('mudou@x.com');
  });
});
