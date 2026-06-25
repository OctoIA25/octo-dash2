import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-token' } } })) } },
}));

import { listRuns, getRunProgress } from './historicoService';

describe('historicoService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('listRuns monta a querystring com tenant e filtros', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ ok: true, runs: [], limit: 50, offset: 0 }),
    } as Response);

    await listRuns('t1', { status: 'done', q: 'arquiv', limit: 20 });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/communication/dispatch/runs?');
    expect(url).toContain('tenantId=t1');
    expect(url).toContain('status=done');
    expect(url).toContain('q=arquiv');
    expect(url).toContain('limit=20');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
  });

  it('getRunProgress chama a rota de progresso do run', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ ok: true, status: 'running', done: 3, failed: 0, pending: 7, total: 10 }),
    } as Response);

    const p = await getRunProgress('t1', 'run-9');
    expect(p.done).toBe(3);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/communication/dispatch/runs/run-9/progress');
    expect(url).toContain('tenantId=t1');
  });
});
