import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt' } } })) } } }));
import { listCampaigns, createCampaign, dispatchCampaign, deleteCampaign, listCampaignRuns } from './campaignsService';

describe('campaignsService', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('listCampaigns GET com tenant', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, campaigns: [] }) } as Response);
    await listCampaigns('t1');
    expect(spy.mock.calls[0][0]).toContain('/api/v1/communication/dispatch/campaigns?tenantId=t1');
  });
  it('createCampaign POST com payload', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, campaign: {} }) } as Response);
    await createCampaign('t1', { name: 'Promo', templateId: 'tpl1', audienceId: 'aud1', maxRecipients: 200, internalNote: 'nota' });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ tenantId: 't1', name: 'Promo', templateId: 'tpl1', audienceId: 'aud1', maxRecipients: 200, internalNote: 'nota' });
  });
  it('dispatchCampaign POST em /:id/dispatch', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, runId: 'r1' }) } as Response);
    await dispatchCampaign('t1', 'camp1');
    expect(spy.mock.calls[0][0]).toContain('/campaigns/camp1/dispatch');
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });
  it('listCampaignRuns GET em /:id/runs', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, runs: [] }) } as Response);
    await listCampaignRuns('t1', 'camp1');
    expect(spy.mock.calls[0][0]).toContain('/campaigns/camp1/runs?tenantId=t1');
  });
  it('deleteCampaign DELETE com id', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true }) } as Response);
    await deleteCampaign('t1', 'camp1');
    expect(spy.mock.calls[0][0]).toContain('/campaigns/camp1?tenantId=t1');
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
  it('cancelSchedule POST em /:id/cancel-schedule', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true }) } as Response);
    const { cancelSchedule } = await import('./campaignsService');
    await cancelSchedule('t1', 'camp1');
    expect(spy.mock.calls[0][0]).toContain('/campaigns/camp1/cancel-schedule');
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });
  it('updateCampaign envia scheduledAt quando fornecido', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, campaign: {} }) } as Response);
    const { updateCampaign } = await import('./campaignsService');
    await updateCampaign('t1', 'camp1', { scheduledAt: '2026-07-10T17:30:00.000Z' });
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ scheduledAt: '2026-07-10T17:30:00.000Z' });
  });
});
