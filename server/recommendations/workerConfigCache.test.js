/**
 * Prova o cache de config por tenant dos WORKERS de envio:
 *  - makeDefaultSendWhatsapp({ configTtlMs }) lê whatsapp_config /
 *    tenant_recommendation_config UMA vez por tenant dentro do TTL;
 *  - sem configTtlMs (envio manual via HTTP), cada envio lê config fresca;
 *  - makeSchedulerDeps memoiza o guard de soft-delete e expõe os limiters.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeDefaultSendWhatsapp, makeSchedulerDeps } from './index.js';

function makeFakeSupabase() {
  const counts = { whatsapp_config: 0, tenant_recommendation_config: 0, tenants: 0 };
  const makeNode = (table) => ({
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    not() { return this; },
    async maybeSingle() {
      counts[table] += 1;
      if (table === 'whatsapp_config') {
        return { data: { phone_number_id: 'pn1', access_token: 'tok', is_active: true }, error: null };
      }
      return { data: { whatsapp_template_name: 'tpl', whatsapp_template_language: 'pt_BR' }, error: null };
    },
    // Query de soft-delete (tenants) é awaited direto no builder.
    then(resolve) {
      counts[table] += 1;
      return resolve({ data: [], error: null });
    },
  });
  return { supabase: { from: (t) => makeNode(t) }, counts };
}

const okFetch = () =>
  vi.fn(async () => ({ ok: true, json: async () => ({ messages: [{ id: 'wamid' }] }) }));

describe('makeDefaultSendWhatsapp — cache de config por tenant', () => {
  it('com configTtlMs: N envios do mesmo tenant leem a config UMA vez', async () => {
    const { supabase, counts } = makeFakeSupabase();
    const send = makeDefaultSendWhatsapp(supabase, { configTtlMs: 10_000, fetchImpl: okFetch() });

    await send({ tenantId: 't1', to: '5511999990000', params: ['oi'] });
    await send({ tenantId: 't1', to: '5511888880000', params: ['oi'] });
    await send({ tenantId: 't1', to: '5511777770000', params: ['oi'] });

    expect(counts.whatsapp_config).toBe(1);
    expect(counts.tenant_recommendation_config).toBe(1);
  });

  it('tenants diferentes têm caches independentes', async () => {
    const { supabase, counts } = makeFakeSupabase();
    const send = makeDefaultSendWhatsapp(supabase, { configTtlMs: 10_000, fetchImpl: okFetch() });

    await send({ tenantId: 't1', to: '5511999990000', params: ['oi'] });
    await send({ tenantId: 't2', to: '5511888880000', params: ['oi'] });

    expect(counts.whatsapp_config).toBe(2);
  });

  it('sem configTtlMs (envio manual): cada envio lê config fresca', async () => {
    const { supabase, counts } = makeFakeSupabase();
    const send = makeDefaultSendWhatsapp(supabase, { fetchImpl: okFetch() });

    await send({ tenantId: 't1', to: '5511999990000', params: ['oi'] });
    await send({ tenantId: 't1', to: '5511888880000', params: ['oi'] });

    expect(counts.whatsapp_config).toBe(2);
  });
});

describe('makeSchedulerDeps — deps compartilhadas dos workers', () => {
  it('memoiza o guard de soft-delete por tenant dentro do TTL', async () => {
    const { supabase, counts } = makeFakeSupabase();
    const deps = makeSchedulerDeps(supabase, { processEnv: {} });

    await deps.getDeletedTenantIds(supabase, ['t1']);
    await deps.getDeletedTenantIds(supabase, ['t1']);
    await deps.getDeletedTenantIds(supabase, ['t2']);

    expect(counts.tenants).toBe(2); // t1 cacheado; t2 é outra chave
  });

  it('expõe rateLimiter, campaignLimiters e tenantConcurrency para o worker', () => {
    const { supabase } = makeFakeSupabase();
    const deps = makeSchedulerDeps(supabase, { processEnv: {} });

    expect(typeof deps.rateLimiter.tryRemove).toBe('function');
    expect(deps.campaignLimiters).toBeInstanceOf(Map);
    expect(deps.tenantConcurrency).toBeGreaterThanOrEqual(1);
  });

  it('respeita OUTBOX_TENANT_CONCURRENCY do ambiente', () => {
    const { supabase } = makeFakeSupabase();
    const deps = makeSchedulerDeps(supabase, { processEnv: { OUTBOX_TENANT_CONCURRENCY: '2' } });
    expect(deps.tenantConcurrency).toBe(2);
  });
});
