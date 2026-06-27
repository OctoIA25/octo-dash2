import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sessão controlável: getSession devolve o token corrente; refreshSession
// rotaciona o token (simula o refresh do Supabase) e marca que foi chamado.
const state = { token: 'jwt-old', refreshed: false };
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.token ? { access_token: state.token } : null } })),
      refreshSession: vi.fn(async () => {
        state.refreshed = true;
        state.token = 'jwt-new';
        return { data: { session: { access_token: 'jwt-new' } }, error: null };
      }),
    },
  },
}));

import { authedFetch } from './authedFetch';

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

describe('authedFetch', () => {
  beforeEach(() => {
    state.token = 'jwt-old';
    state.refreshed = false;
    vi.restoreAllMocks();
  });

  it('anexa o Authorization: Bearer do token da sessão', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));
    await authedFetch('/api/x');
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-old');
  });

  it('em 401, faz refresh da sessão e re-tenta UMA vez com o token novo', async () => {
    const spy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_token' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await authedFetch('/api/x');

    expect(state.refreshed).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    // segunda tentativa usa o token rotacionado
    const retryInit = spy.mock.calls[1][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer jwt-new');
    expect(res.status).toBe(200);
  });

  it('não re-tenta mais de uma vez (evita loop em 401 persistente)', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(401, { error: 'invalid_token' }));
    const res = await authedFetch('/api/x');
    expect(spy).toHaveBeenCalledTimes(2); // original + 1 retry, e para
    expect(res.status).toBe(401);
  });

  it('não faz refresh quando a primeira resposta é 2xx', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));
    await authedFetch('/api/x');
    expect(state.refreshed).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('preserva method/body/headers do init original na re-tentativa', async () => {
    const spy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await authedFetch('/api/x', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const retryInit = spy.mock.calls[1][1] as RequestInit;
    expect(retryInit.method).toBe('POST');
    expect(retryInit.body).toBe(JSON.stringify({ a: 1 }));
    expect((retryInit.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});
