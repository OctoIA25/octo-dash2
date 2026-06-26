import { describe, it, expect, vi } from 'vitest';
import { executeCampaignDispatch, makeCampaignDispatchDeps } from './campaignDispatch.js';

const campaign = { id: 'camp1', audience_id: 'aud1', template_id: 'tpl1', max_recipients: null, variable_mapping: {} };
const baseDeps = () => ({
  assertTemplateUsable: vi.fn(async () => ({ ok: true, body: 'Olá', name: 'promo', variables: [] })),
  validateMapping: vi.fn(() => ({ ok: true, missing: [] })),
  loadMetaCreds: vi.fn(async () => ({ ok: true, wabaId: 'W', accessToken: 'T' })),
  resolvePublicSourceMode: vi.fn(async () => 'kenlo_only'),
  previewOperation: vi.fn(async () => ({ ok: true, previewToken: 'pt' })),
  confirmOperation: vi.fn(async () => ({ ok: true, runId: 'run1', enqueued: 3 })),
  runDueActions: vi.fn(async () => ({})),
  schedulerDeps: { deliver: vi.fn(), getEnvironment: vi.fn() },
});

describe('executeCampaignDispatch', () => {
  const user = { id: 'u1', email: 'a@x.com', role: 'admin', brokerName: null };
  it('caminho feliz: preview→confirm→drain, devolve runId', async () => {
    const deps = baseDeps();
    const r = await executeCampaignDispatch({}, { campaign, tenantId: 't1', user, deps });
    expect(r).toEqual({ ok: true, runId: 'run1', enqueued: 3 });
    expect(deps.previewOperation).toHaveBeenCalled();
    expect(deps.confirmOperation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ templateName: 'promo', message: 'Olá' }));
    // Trava a aridade (supabase, tenantId, templateId) do guard de template.
    expect(deps.assertTemplateUsable).toHaveBeenCalledWith(expect.anything(), 't1', 'tpl1');
  });
  it('template não-aprovado → {ok:false, error}', async () => {
    const deps = baseDeps(); deps.assertTemplateUsable = vi.fn(async () => ({ ok: false, error: 'template_not_approved' }));
    const r = await executeCampaignDispatch({}, { campaign, tenantId: 't1', user, deps });
    expect(r).toEqual({ ok: false, error: 'template_not_approved' });
  });
  it('mapping incompleto → {ok:false, error:incomplete_mapping}', async () => {
    const deps = baseDeps(); deps.validateMapping = vi.fn(() => ({ ok: false, missing: ['1'] }));
    const r = await executeCampaignDispatch({}, { campaign, tenantId: 't1', user, deps });
    expect(r).toEqual({ ok: false, error: 'incomplete_mapping' });
  });
  it('sem config Meta → {ok:false, error}', async () => {
    const deps = baseDeps(); deps.loadMetaCreds = vi.fn(async () => ({ ok: false, error: 'whatsapp_not_configured' }));
    const r = await executeCampaignDispatch({}, { campaign, tenantId: 't1', user, deps });
    expect(r).toEqual({ ok: false, error: 'whatsapp_not_configured' });
  });
  it('preview falha → {ok:false}', async () => {
    const deps = baseDeps(); deps.previewOperation = vi.fn(async () => ({ ok: false, error: 'no_recipients' }));
    const r = await executeCampaignDispatch({}, { campaign, tenantId: 't1', user, deps });
    expect(r.ok).toBe(false);
  });
});

describe('makeCampaignDispatchDeps', () => {
  it('schedulerDeps é o bundle cru (tem as funções que deliverRecommendation precisa)', () => {
    const bundle = { deliver: () => {}, getEnvironment: () => {}, resolveTransport: () => {}, sendWhatsapp: () => {}, findDuplicate: () => {} };
    const deps = makeCampaignDispatchDeps(bundle);
    // schedulerDeps deve ser o bundle cru — NÃO um objeto { deliver, schedulerDeps, getEnvironment } embrulhado.
    expect(deps.schedulerDeps).toBe(bundle);
    expect(typeof deps.schedulerDeps.resolveTransport).toBe('function');
    expect(typeof deps.schedulerDeps.sendWhatsapp).toBe('function');
    expect(typeof deps.schedulerDeps.findDuplicate).toBe('function');
    expect(typeof deps.executeCampaignDispatch).toBe('function');
  });
});
