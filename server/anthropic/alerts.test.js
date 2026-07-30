// server/anthropic/alerts.test.js
import { describe, it, expect, vi } from 'vitest';
import { shouldAlert, resolveOwnerRecipient, buildAlertContent, sendOwnerAlert, markAlerted } from './alerts.js';

const dtoWarning = {
  provider: 'anthropic', status: 'warning',
  window: { startsAt: '2026-07-23T00:00:00.000Z', endsAt: '2026-07-30T12:00:00.000Z' },
  usage: { current: 76, limit: 500, percentage: 15.2 },
  fetchedAt: '2026-07-30T12:00:00.000Z',
};

describe('shouldAlert (dedup por transição)', () => {
  it('warning vindo de normal → true', () => { expect(shouldAlert(dtoWarning, 'normal')).toBe(true); });
  it('warning vindo de warning → false (não re-alerta)', () => { expect(shouldAlert(dtoWarning, 'warning')).toBe(false); });
  it('warning sem estado anterior (null) → true', () => { expect(shouldAlert(dtoWarning, null)).toBe(true); });
  it('normal → false', () => { expect(shouldAlert({ ...dtoWarning, status: 'normal' }, 'normal')).toBe(false); });
});

function fakeSupabaseOwners(row) {
  const api = {
    _updates: [],
    from(t) { api._t = t; return api; },
    select() { return api; },
    eq(_c, v) { api._v = v; return api; },
    async maybeSingle() { return { data: row ?? null, error: null }; },
    update(payload) { api._updates.push(payload); return api; },
    // update(...).eq(...) precisa resolver como promise:
    then(res) { res({ error: null }); },
    insert(payload) { api._inserted = payload; return { select: () => ({ single: async () => ({ data: { id: 'n1' }, error: null }) }) }; },
  };
  return api;
}

describe('resolveOwnerRecipient', () => {
  it('acha user_id por email (lowercased)', async () => {
    const sb = fakeSupabaseOwners({ user_id: 'u-1' });
    const r = await resolveOwnerRecipient(sb, 'Owner@X.com');
    expect(r).toEqual({ email: 'owner@x.com', userId: 'u-1' });
  });
  it('user_id null → userId null (email-only)', async () => {
    const r = await resolveOwnerRecipient(fakeSupabaseOwners({ user_id: null }), 'o@x.com');
    expect(r.userId).toBeNull();
  });
  it('sem linha → userId null', async () => {
    const r = await resolveOwnerRecipient(fakeSupabaseOwners(null), 'o@x.com');
    expect(r.userId).toBeNull();
  });
});

describe('buildAlertContent', () => {
  it('conteúdo com % e janela reais; sem vazar segredo', () => {
    const c = buildAlertContent(dtoWarning, 'tenant-1');
    expect(c.subject).toContain('15,20%');
    expect(c.text).toContain('tenant-1');
    expect(c.text).toContain('US$ 76.00');
    expect(c.text).toContain('US$ 500.00');
    expect(JSON.stringify(c)).not.toMatch(/sk-ant/);
  });
});

describe('sendOwnerAlert (best-effort, 2 canais)', () => {
  const from = 'A <a@b.c>';
  it('envia email e insere notification quando há userId', async () => {
    const sb = fakeSupabaseOwners();
    const transport = { send: vi.fn().mockResolvedValue({ transport: 'simulated' }) };
    const r = await sendOwnerAlert(sb, { dto: dtoWarning, tenantId: 't1', recipient: { email: 'o@x.com', userId: 'u-1' }, transport, from });
    expect(r).toEqual({ emailOk: true, bellOk: true });
    expect(transport.send).toHaveBeenCalledOnce();
    expect(sb._inserted).toMatchObject({ tenant_id: 't1', user_id: 'u-1', type: 'warning' });
  });
  it('falha do email não impede o sino; nunca lança', async () => {
    const sb = fakeSupabaseOwners();
    const transport = { send: vi.fn().mockRejectedValue(new Error('smtp down')) };
    const r = await sendOwnerAlert(sb, { dto: dtoWarning, tenantId: 't1', recipient: { email: 'o@x.com', userId: 'u-1' }, transport, from });
    expect(r).toEqual({ emailOk: false, bellOk: true });
  });
  it('sem userId → só email, bellOk false', async () => {
    const sb = fakeSupabaseOwners();
    const transport = { send: vi.fn().mockResolvedValue({}) };
    const r = await sendOwnerAlert(sb, { dto: dtoWarning, tenantId: 't1', recipient: { email: 'o@x.com', userId: null }, transport, from });
    expect(r).toEqual({ emailOk: true, bellOk: false });
    expect(sb._inserted).toBeUndefined();
  });
});

describe('markAlerted', () => {
  it('grava last_alerted_at', async () => {
    const sb = fakeSupabaseOwners();
    await markAlerted(sb, 't1', '2026-07-30T12:00:00.000Z');
    expect(sb._updates[0]).toMatchObject({ last_alerted_at: '2026-07-30T12:00:00.000Z' });
  });
});
