import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt' } } })) } },
}));
import { listAudiences, createAudience, deleteAudience, getAudienceCount } from './audiencesService';

describe('audiencesService', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('listAudiences faz GET com tenant', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, audiences: [] }) } as Response);
    await listAudiences('t1');
    expect(spy.mock.calls[0][0]).toContain('/api/v1/communication/dispatch/audiences?tenantId=t1');
  });
  it('createAudience faz POST com name+segment', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, audience: {} }) } as Response);
    await createAudience('t1', { name: 'Arquivados', segment: { type: 'archived' } });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ tenantId: 't1', name: 'Arquivados', segment: { type: 'archived' } });
  });
  it('deleteAudience faz DELETE com id', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true }) } as Response);
    await deleteAudience('t1', 'a1');
    expect(spy.mock.calls[0][0]).toContain('/audiences/a1?tenantId=t1');
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
  it('getAudienceCount chama /count', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, count: 42 }) } as Response);
    const r = await getAudienceCount('t1', 'a1');
    expect(spy.mock.calls[0][0]).toContain('/audiences/a1/count?tenantId=t1');
    expect(r.count).toBe(42);
  });
});
