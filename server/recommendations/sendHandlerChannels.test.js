import { describe, it, expect, vi } from 'vitest';
import { makeSendHandler } from './index.js';

function makeFakeSupabase({ membership = { user_id: 'u1' } } = {}) {
  const inserts = [];
  const supabase = {
    from(table) {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership, error: null }) }) }) }) };
      }
      if (table === 'lead_recommendations') {
        return {
          insert: (row) => {
            inserts.push(row);
            return { select: () => ({ single: async () => ({ data: { id: 'hist-1' }, error: null }) }) };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
  return { supabase, inserts };
}

const makeRes = () => ({
  statusCode: 0,
  body: null,
  status(c) { this.statusCode = c; return this; },
  json(o) { this.body = o; return this; },
});

const waReq = (over = {}) => ({
  userId: 'u1',
  userEmail: 'c@imob.com',
  body: {
    tenantId: 't1',
    channel: 'whatsapp',
    lead: { id: 42, source: 'bolsao', name: 'Ana', email: null, phone: '5511999998888' },
    whatsappBody: 'Olá Ana! ...',
    properties: [{ referencia: 'A', titulo: 'Casa A', preco: 500000 }],
    ...over,
  },
});

const noDup = async () => null;

describe('sendHandler — canal WhatsApp', () => {
  it('produção: envia via template e registra channel=whatsapp', async () => {
    const { supabase, inserts } = makeFakeSupabase();
    const sendWhatsapp = vi.fn(async () => ({ messageId: 'wamid.1' }));
    const handler = makeSendHandler(supabase, {
      getEnvironment: () => 'production',
      sendWhatsapp,
      findDuplicate: noDup,
    });
    const res = makeRes();
    await handler(waReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'sent', channel: 'whatsapp', recipient: '5511999998888' });
    expect(sendWhatsapp).toHaveBeenCalledWith(expect.objectContaining({ to: '5511999998888' }));
    expect(inserts[0]).toMatchObject({ channel: 'whatsapp', recipient: '5511999998888', status: 'sent', message_id: 'wamid.1', recipient_email: null });
  });

  it('desenvolvimento: SIMULA (não chama a Meta)', async () => {
    const { supabase, inserts } = makeFakeSupabase();
    const sendWhatsapp = vi.fn();
    const handler = makeSendHandler(supabase, { getEnvironment: () => 'development', sendWhatsapp, findDuplicate: noDup });
    const res = makeRes();
    await handler(waReq(), res);

    expect(res.body.status).toBe('simulated');
    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect(inserts[0].channel).toBe('whatsapp');
  });

  it('falha no envio WhatsApp → 502 e status failed', async () => {
    const { supabase, inserts } = makeFakeSupabase();
    const sendWhatsapp = vi.fn(async () => { throw new Error('whatsapp_template_missing'); });
    const handler = makeSendHandler(supabase, { getEnvironment: () => 'production', sendWhatsapp, findDuplicate: noDup });
    const res = makeRes();
    await handler(waReq(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('send_failed');
    expect(inserts[0].status).toBe('failed');
    expect(inserts[0].error_message).toContain('whatsapp_template_missing');
  });

  it('sem telefone → 422 missing_lead_phone', async () => {
    const { supabase } = makeFakeSupabase();
    const handler = makeSendHandler(supabase, { getEnvironment: () => 'production', sendWhatsapp: vi.fn(), findDuplicate: noDup });
    const res = makeRes();
    const req = waReq();
    req.body.lead.phone = null;
    await handler(req, res);
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('missing_lead_phone');
  });

  it('conteúdo WhatsApp ausente → 400', async () => {
    const { supabase } = makeFakeSupabase();
    const handler = makeSendHandler(supabase, { getEnvironment: () => 'production', sendWhatsapp: vi.fn(), findDuplicate: noDup });
    const res = makeRes();
    const req = waReq();
    delete req.body.whatsappBody;
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('missing_whatsapp_content');
  });
});

describe('sendHandler — idempotência', () => {
  it('retry idêntico dentro da janela NÃO duplica (não insere de novo)', async () => {
    const { supabase, inserts } = makeFakeSupabase();
    const findDuplicate = async () => ({ id: 'hist-prev', status: 'sent', recipient: '5511999998888', message_id: 'wamid.prev' });
    const sendWhatsapp = vi.fn(async () => ({ messageId: 'wamid.new' }));
    const handler = makeSendHandler(supabase, { getEnvironment: () => 'production', sendWhatsapp, findDuplicate });
    const res = makeRes();
    await handler(waReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, deduplicated: true, historyId: 'hist-prev' });
    expect(sendWhatsapp).not.toHaveBeenCalled(); // não reenviou
    expect(inserts).toHaveLength(0); // não duplicou histórico
  });
});
