import { describe, it, expect, vi } from 'vitest';
import { sendWhatsappTemplate, loadWhatsappContext } from './whatsappSender.js';

const config = { phone_number_id: 'pn1', access_token: 'tok', is_active: true };
const template = { name: 'recomendacao', language: 'pt_BR' };

describe('sendWhatsappTemplate', () => {
  it('monta payload de template e retorna messageId', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.123' }] }),
    }));
    const r = await sendWhatsappTemplate({ config, template, to: '5511999998888', params: ['Ana', '3'], fetchImpl });
    expect(r.messageId).toBe('wamid.123');

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toContain('/pn1/messages');
    const body = JSON.parse(opts.body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('recomendacao');
    expect(body.template.components[0].parameters.map((p) => p.text)).toEqual(['Ana', '3']);
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('lança erro com a mensagem da Meta quando falha', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'template not found' } }),
    }));
    await expect(
      sendWhatsappTemplate({ config, template, to: '551199', fetchImpl }),
    ).rejects.toThrow('template not found');
  });
});

describe('loadWhatsappContext', () => {
  const makeSupabase = (cfg, rec) => ({
    from(table) {
      const data = table === 'whatsapp_config' ? cfg : rec;
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) };
    },
  });

  it('ok quando config ativa + template definido', async () => {
    const supabase = makeSupabase(config, { whatsapp_template_name: 'recomendacao', whatsapp_template_language: 'pt_BR' });
    const ctx = await loadWhatsappContext(supabase, 't1', {});
    expect(ctx.ok).toBe(true);
    expect(ctx.template.name).toBe('recomendacao');
  });

  it('erro quando WhatsApp não configurado', async () => {
    const supabase = makeSupabase(null, null);
    const ctx = await loadWhatsappContext(supabase, 't1', {});
    expect(ctx).toMatchObject({ ok: false, error: 'whatsapp_not_configured' });
  });

  it('erro quando template ausente', async () => {
    const supabase = makeSupabase(config, { whatsapp_template_name: null });
    const ctx = await loadWhatsappContext(supabase, 't1', {});
    expect(ctx).toMatchObject({ ok: false, error: 'whatsapp_template_missing' });
  });
});
