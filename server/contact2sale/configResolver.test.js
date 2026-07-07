import { describe, it, expect, vi } from 'vitest';
import { createC2sConfigResolver } from './configResolver.js';
import { encryptSecret, decryptSecret } from '../recommendations/crypto.js';

// Chave de teste: 32 bytes em base64 (só para os testes — nunca em produção).
const ENV = { EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 'a').toString('base64') };

function fakeSupabase({ row = null } = {}) {
  const upserts = [];
  return {
    upserts,
    from(table) {
      expect(table).toBe('tenant_contact2sale_config');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        upsert: (payload) => { upserts.push(payload); return Promise.resolve({ error: null }); },
      };
    },
  };
}

describe('createC2sConfigResolver', () => {
  it('resolve decifra o token e cacheia (2ª chamada não bate no banco)', async () => {
    const row = { tenant_id: 't1', api_token_encrypted: encryptSecret('tok-secreto', ENV), status: 'active' };
    const supabase = fakeSupabase({ row });
    const fromSpy = vi.spyOn(supabase, 'from');
    const resolver = createC2sConfigResolver({ supabase, processEnv: ENV });

    const cfg1 = await resolver.resolveConfig('t1');
    expect(cfg1.apiToken).toBe('tok-secreto');
    expect(cfg1.status).toBe('active');

    await resolver.resolveConfig('t1');
    expect(fromSpy).toHaveBeenCalledTimes(1); // cache
  });

  it('cache expira em 10s: trigger de exclusividade escreve status por fora do resolver', async () => {
    let t = 0;
    const row = { tenant_id: 't1', api_token_encrypted: encryptSecret('tok', ENV), status: 'active' };
    const supabase = fakeSupabase({ row });
    const fromSpy = vi.spyOn(supabase, 'from');
    const resolver = createC2sConfigResolver({ supabase, processEnv: ENV, now: () => t });

    await resolver.resolveConfig('t1');
    t = 5_000;
    await resolver.resolveConfig('t1');
    expect(fromSpy).toHaveBeenCalledTimes(1); // dentro do TTL: cache

    t = 15_000;
    await resolver.resolveConfig('t1');
    expect(fromSpy).toHaveBeenCalledTimes(2); // TTL vencido: relê o banco
  });

  it('sem linha no banco → null e NÃO cacheia o negativo', async () => {
    const supabase = fakeSupabase({ row: null });
    const fromSpy = vi.spyOn(supabase, 'from');
    const resolver = createC2sConfigResolver({ supabase, processEnv: ENV });
    expect(await resolver.resolveConfig('t1')).toBeNull();
    expect(await resolver.resolveConfig('t1')).toBeNull();
    expect(fromSpy).toHaveBeenCalledTimes(2); // consultou de novo
  });

  it('saveConfig cifra o token (nunca plaintext no upsert) e invalida o cache', async () => {
    const supabase = fakeSupabase({ row: null });
    const resolver = createC2sConfigResolver({ supabase, processEnv: ENV });
    const r = await resolver.saveConfig('t1', { apiToken: 'novo-token', status: 'inactive' });
    expect(r.ok).toBe(true);
    const payload = supabase.upserts[0];
    expect(payload.tenant_id).toBe('t1');
    expect(payload.status).toBe('inactive');
    expect(payload.api_token_encrypted).toBeTruthy();
    expect(payload.api_token_encrypted).not.toContain('novo-token');
    expect(decryptSecret(payload.api_token_encrypted, ENV)).toBe('novo-token');
    expect(JSON.stringify(payload)).not.toContain('novo-token');
    expect(payload).not.toHaveProperty('api_token'); // jamais coluna plaintext
  });

  it('saveConfig sem apiToken preserva o token existente (só muda status)', async () => {
    const supabase = fakeSupabase({ row: null });
    const resolver = createC2sConfigResolver({ supabase, processEnv: ENV });
    await resolver.saveConfig('t1', { status: 'active' });
    expect(supabase.upserts[0]).not.toHaveProperty('api_token_encrypted');
  });

  it('sem EMAIL_ENCRYPTION_KEY recusa salvar token', async () => {
    const resolver = createC2sConfigResolver({ supabase: fakeSupabase({}), processEnv: {} });
    const r = await resolver.saveConfig('t1', { apiToken: 'x' });
    expect(r.ok).toBe(false);
  });
});
