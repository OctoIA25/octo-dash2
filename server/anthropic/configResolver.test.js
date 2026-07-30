import { describe, it, expect, beforeEach } from 'vitest';
import { createAnthropicConfigResolver } from './configResolver.js';
import { loadAnthropicEnv } from './config.js';
import { encryptSecret } from '../recommendations/crypto.js';

// Chave de cifra válida para os testes (32 bytes base64).
const ENV = { EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };

// Supabase fake: uma "tabela" em memória, só os métodos usados.
function fakeSupabase(rowByTenant = {}) {
  const store = { ...rowByTenant };
  const api = {
    _store: store,
    from() { return api; },
    select() { api._op = 'select'; return api; },
    eq(_col, val) { api._tenant = val; return api; },
    async maybeSingle() { return { data: store[api._tenant] ?? null, error: null }; },
    async upsert(payload) { store[payload.tenant_id] = { ...store[payload.tenant_id], ...payload }; return { error: null }; },
  };
  return api;
}

describe('createAnthropicConfigResolver', () => {
  let clock;
  beforeEach(() => { clock = 1_000_000; });
  const now = () => clock;

  it('resolveConfig decifra a key e devolve limite/status', async () => {
    const supabase = fakeSupabase({
      t1: { tenant_id: 't1', admin_api_key_encrypted: encryptSecret('sk-ant-admin01-secret', ENV), weekly_limit_usd: 500, status: 'normal', last_synced_at: '2026-07-29T12:00:00Z', alert_threshold_bps: 2000, last_alerted_at: null },
    });
    const r = createAnthropicConfigResolver({ supabase, processEnv: ENV, now });
    const cfg = await r.resolveConfig('t1');
    expect(cfg).toEqual({ tenantId: 't1', apiKey: 'sk-ant-admin01-secret', weeklyLimitUsd: 500, status: 'normal', lastSyncedAt: '2026-07-29T12:00:00Z', alertThresholdBps: 2000, lastAlertedAt: null });
  });

  it('sem linha → null', async () => {
    const r = createAnthropicConfigResolver({ supabase: fakeSupabase(), processEnv: ENV, now });
    expect(await r.resolveConfig('nope')).toBeNull();
  });

  it('saveConfig recusa key sem EMAIL_ENCRYPTION_KEY', async () => {
    const r = createAnthropicConfigResolver({ supabase: fakeSupabase(), processEnv: {}, now });
    const res = await r.saveConfig('t1', { apiKey: 'sk-ant-admin01-x' });
    expect(res.ok).toBe(false);
  });

  it('saveConfig grava limite sem key (config parcial permitida)', async () => {
    const supabase = fakeSupabase();
    const r = createAnthropicConfigResolver({ supabase, processEnv: ENV, now });
    const res = await r.saveConfig('t1', { weeklyLimitUsd: 750 });
    expect(res.ok).toBe(true);
    expect(supabase._store.t1.weekly_limit_usd).toBe(750);
    expect(supabase._store.t1.admin_api_key_encrypted).toBeUndefined();
  });

  it('alertThresholdBps default 1430 quando a coluna vem null', async () => {
    const supabase = fakeSupabase({ t1: { tenant_id: 't1', status: 'normal' } });
    const r = createAnthropicConfigResolver({ supabase, processEnv: ENV, now });
    const cfg = await r.resolveConfig('t1');
    expect(cfg.alertThresholdBps).toBe(1430);
  });

  it('saveConfig persiste alertThresholdBps', async () => {
    const supabase = fakeSupabase();
    const r = createAnthropicConfigResolver({ supabase, processEnv: ENV, now });
    const res = await r.saveConfig('t1', { alertThresholdBps: 5000 });
    expect(res.ok).toBe(true);
    expect(supabase._store.t1.alert_threshold_bps).toBe(5000);
  });
});

describe('loadAnthropicEnv (fase2)', () => {
  it('budgetUsd de env com default 0; alertEmail com default do owner', () => {
    expect(loadAnthropicEnv({}).budgetUsd).toBe(0);
    expect(loadAnthropicEnv({ ANTHROPIC_WEEKLY_BUDGET_USD: '500' }).budgetUsd).toBe(500);
    expect(loadAnthropicEnv({}).alertEmail).toBe('octo.inteligenciaimobiliaria@gmail.com');
    expect(loadAnthropicEnv({ ANTHROPIC_ALERT_EMAIL: 'x@y.com' }).alertEmail).toBe('x@y.com');
  });
});
