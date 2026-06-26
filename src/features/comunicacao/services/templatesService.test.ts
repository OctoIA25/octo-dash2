import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt' } } })) } } }));
import { listTemplates, createTemplate, submitTemplate, refreshStatus, deleteTemplate } from './templatesService';

describe('templatesService', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('listTemplates GET com tenant', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, templates: [] }) } as Response);
    await listTemplates('t1');
    expect(spy.mock.calls[0][0]).toContain('/api/v1/communication/dispatch/templates?tenantId=t1');
  });
  it('createTemplate POST com name/body/category/exampleValues', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, template: {} }) } as Response);
    await createTemplate('t1', { name: 'Promo', body: 'Olá {{nome}}', category: 'MARKETING', exampleValues: ['João'] });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ tenantId: 't1', name: 'Promo', body: 'Olá {{nome}}', category: 'MARKETING', exampleValues: ['João'] });
  });
  it('submitTemplate POST em /:id/submit', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, template: {} }) } as Response);
    await submitTemplate('t1', 'tpl1');
    expect(spy.mock.calls[0][0]).toContain('/templates/tpl1/submit');
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });
  it('refreshStatus POST em /:id/refresh-status', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, template: {} }) } as Response);
    await refreshStatus('t1', 'tpl1');
    expect(spy.mock.calls[0][0]).toContain('/templates/tpl1/refresh-status');
  });
  it('deleteTemplate DELETE com id', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true }) } as Response);
    await deleteTemplate('t1', 'tpl1');
    expect(spy.mock.calls[0][0]).toContain('/templates/tpl1?tenantId=t1');
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
});
