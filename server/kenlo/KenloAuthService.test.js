import { describe, it, expect, vi } from 'vitest';
import { createKenloAuthService } from './KenloAuthService.js';
import { encryptSecret } from '../recommendations/crypto.js';

const ENV = { EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };

// Supabase fake: registra updates em kenlo_integrations.
function fakeSupabase() {
  const updates = [];
  return {
    updates,
    from() {
      return {
        update(payload) {
          return { eq() { updates.push(payload); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
}

describe('KenloAuthService', () => {
  it('getToken usa auth_token_encrypted decifrado sem chamar o driver', async () => {
    const loginDriver = { login: vi.fn() };
    const svc = createKenloAuthService({ supabase: fakeSupabase(), loginDriver, processEnv: ENV });
    const integration = {
      tenant_id: 't1', kenlo_email: 'e', kenlo_password_encrypted: encryptSecret('pw', ENV),
      auth_token_encrypted: encryptSecret('TOKEN-CACHED', ENV), status: 'active',
    };
    const token = await svc.getToken(integration);
    expect(token).toBe('TOKEN-CACHED');
    expect(loginDriver.login).not.toHaveBeenCalled();
  });

  it('refresh chama o driver, cifra e persiste o novo token', async () => {
    const supabase = fakeSupabase();
    const loginDriver = { login: vi.fn().mockResolvedValue('TOKEN-NEW') };
    const svc = createKenloAuthService({ supabase, loginDriver, processEnv: ENV });
    const integration = {
      tenant_id: 't1', kenlo_email: 'e', kenlo_password_encrypted: encryptSecret('pw', ENV), status: 'active',
    };
    const token = await svc.refresh(integration);
    expect(token).toBe('TOKEN-NEW');
    expect(loginDriver.login).toHaveBeenCalledWith('e', 'pw');
    expect(supabase.updates.length).toBe(1);
    expect(supabase.updates[0].auth_token_encrypted).toBeTruthy();
    expect(JSON.stringify(supabase.updates[0])).not.toContain('TOKEN-NEW'); // cifrado, não em claro
  });

  it('getToken sem token chama refresh', async () => {
    const loginDriver = { login: vi.fn().mockResolvedValue('TOKEN-FRESH') };
    const svc = createKenloAuthService({ supabase: fakeSupabase(), loginDriver, processEnv: ENV });
    const integration = { tenant_id: 't1', kenlo_email: 'e', kenlo_password_encrypted: encryptSecret('pw', ENV), status: 'active' };
    const token = await svc.getToken(integration);
    expect(token).toBe('TOKEN-FRESH');
    expect(loginDriver.login).toHaveBeenCalledOnce();
  });

  it('migração preguiçosa: lê senha plana e regrava cifrada', async () => {
    const supabase = fakeSupabase();
    const loginDriver = { login: vi.fn().mockResolvedValue('T') };
    const svc = createKenloAuthService({ supabase, loginDriver, processEnv: ENV });
    const integration = { tenant_id: 't1', kenlo_email: 'e', kenlo_password: 'plain-pw', status: 'active' };
    await svc.refresh(integration);
    expect(loginDriver.login).toHaveBeenCalledWith('e', 'plain-pw');
    expect(supabase.updates[0].kenlo_password_encrypted).toBeTruthy();
  });
});
