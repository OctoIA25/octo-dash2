import { describe, it, expect } from 'vitest';
import { createMetaConfigResolver } from './configResolver.js';
import { loadMetaEnv } from './metaConfig.js';
import { encryptSecret } from '../recommendations/crypto.js';

const ENV = { EMAIL_ENCRYPTION_KEY: 'a'.repeat(64) };

function fakeSupabase(row) {
  const saved = [];
  return {
    saved,
    from() {
      const q = {
        _filters: {},
        select() { return q; },
        eq(col, val) { q._filters[col] = val; return q; },
        maybeSingle: async () => ({ data: row, error: null }),
        upsert: async (payload) => { saved.push(payload); return { error: null }; },
      };
      return q;
    },
  };
}

describe('loadMetaEnv', () => {
  it('usa defaults quando o env está vazio', () => {
    const cfg = loadMetaEnv({});
    expect(cfg.graphVersion).toBe('v21.0');
    expect(cfg.selfBaseUrl).toBe('http://127.0.0.1:8080');
    expect(cfg.maxAttempts).toBe(8);
  });

  it('deriva o selfBaseUrl da PORT', () => {
    expect(loadMetaEnv({ PORT: '3001' }).selfBaseUrl).toBe('http://127.0.0.1:3001');
  });

  it('reusa META_GRAPH_VERSION do WhatsApp', () => {
    expect(loadMetaEnv({ META_GRAPH_VERSION: 'v23.0' }).graphVersion).toBe('v23.0');
  });
});

describe('createMetaConfigResolver', () => {
  const row = {
    tenant_id: 't1',
    page_id: 'p1',
    app_secret_encrypted: encryptSecret('segredo-do-app', ENV),
    system_user_token_encrypted: encryptSecret('token-do-system-user', ENV),
    webhook_token: 'wt-abc',
    verify_token: 'vt-xyz',
    status: 'active',
  };

  it('resolve pelo webhook_token e decifra os segredos', async () => {
    const resolver = createMetaConfigResolver({ supabase: fakeSupabase(row), processEnv: ENV });
    const cfg = await resolver.resolveByWebhookToken('wt-abc');
    expect(cfg.tenantId).toBe('t1');
    expect(cfg.appSecret).toBe('segredo-do-app');
    expect(cfg.accessToken).toBe('token-do-system-user');
  });

  it('resolve por tenant', async () => {
    const resolver = createMetaConfigResolver({ supabase: fakeSupabase(row), processEnv: ENV });
    expect((await resolver.resolveByTenant('t1')).pageId).toBe('p1');
  });

  it('devolve null quando não há linha', async () => {
    const resolver = createMetaConfigResolver({ supabase: fakeSupabase(null), processEnv: ENV });
    expect(await resolver.resolveByWebhookToken('nao-existe')).toBeNull();
  });

  it('sem chave-mestra, segredo vira null em vez de vazar cifrado', async () => {
    const resolver = createMetaConfigResolver({ supabase: fakeSupabase(row), processEnv: {} });
    expect((await resolver.resolveByTenant('t1')).appSecret).toBeNull();
  });

  // Sem log, o operador vê `appSecret: null` e uma falha de assinatura lá na
  // frente, sem nada ligando as duas coisas.
  it('decifragem falhando avisa com o tenant, sem vazar o segredo', async () => {
    const avisos = [];
    const logger = { info() {}, warn: (m) => avisos.push(m), error() {} };
    const resolver = createMetaConfigResolver({ supabase: fakeSupabase(row), processEnv: {}, logger });
    await resolver.resolveByTenant('t1');
    expect(avisos.join('\n')).toContain('t1');
    expect(avisos.join('\n')).toContain('app_secret');
    expect(avisos.join('\n')).not.toContain(row.app_secret_encrypted);
  });

  it('recusa salvar segredo sem chave-mestra', async () => {
    const supabase = fakeSupabase(null);
    const resolver = createMetaConfigResolver({ supabase, processEnv: {} });
    const r = await resolver.saveConfig('t1', { appSecret: 'x' });
    expect(r.ok).toBe(false);
    expect(supabase.saved).toHaveLength(0);
  });

  it('cifra ao salvar — o valor em claro não vai para o banco', async () => {
    const supabase = fakeSupabase(null);
    const resolver = createMetaConfigResolver({ supabase, processEnv: ENV });
    const r = await resolver.saveConfig('t1', { appSecret: 'segredo-do-app', pageId: 'p9' });
    expect(r.ok).toBe(true);
    expect(supabase.saved[0].app_secret_encrypted).not.toContain('segredo-do-app');
    expect(supabase.saved[0].page_id).toBe('p9');
  });

  it('não inclui webhook_token no payload ao salvar tenant novo', async () => {
    const supabase = fakeSupabase(null);
    const resolver = createMetaConfigResolver({ supabase, processEnv: ENV });
    await resolver.saveConfig('t1', { pageId: 'p1' });
    expect(supabase.saved[0]).not.toHaveProperty('webhook_token');
    expect(supabase.saved[0]).not.toHaveProperty('verify_token');
  });

  it('nunca reescreve webhook_token ao salvar tenant existente', async () => {
    const supabase = fakeSupabase(row);
    const resolver = createMetaConfigResolver({ supabase, processEnv: ENV });
    await resolver.saveConfig('t1', { pageId: 'p2', status: 'active' });
    expect(supabase.saved[0]).not.toHaveProperty('webhook_token');
    expect(supabase.saved[0]).not.toHaveProperty('verify_token');
  });
});
