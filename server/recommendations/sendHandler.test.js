import { describe, it, expect, vi } from 'vitest';
import { makeSendHandler } from './index.js';

/**
 * Fake do client Supabase suficiente para o handler:
 *  - tenant_memberships → maybeSingle() resolve o acesso
 *  - lead_recommendations → insert().select().single() registra a linha
 */
function makeFakeSupabase({ membership = { user_id: 'u1' }, onInsert } = {}) {
  const inserts = [];
  const supabase = {
    from(table) {
      if (table === 'tenant_memberships') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: membership, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'lead_recommendations') {
        return {
          insert: (row) => {
            inserts.push(row);
            onInsert?.(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'hist-1' }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
  return { supabase, inserts };
}

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
  };
}

const baseReq = (overrides = {}) => ({
  userId: 'u1',
  userEmail: 'corretor@imob.com',
  body: {
    tenantId: 't1',
    lead: { id: 42, source: 'bolsao', name: 'Cliente', email: 'lead@cliente.com' },
    subject: 'Imóveis pra você',
    message: 'oi',
    html: '<html>oi</html>',
    text: 'oi',
    properties: [{ referencia: 'A', titulo: 'Casa A', preco: 500000, score: 90 }],
    testEmail: 'teste@imob.com',
    ...overrides,
  },
});

const sentTransport = { kind: 'smtp', send: vi.fn(async () => ({ simulated: false, transport: 'smtp', messageId: 'm1' })) };
const simTransport = { kind: 'simulated', send: vi.fn(async () => ({ simulated: true, transport: 'simulated', messageId: 'sim-1' })) };

const handlerWith = (supabase, { env = 'production', transport = sentTransport } = {}) =>
  makeSendHandler(supabase, {
    getEnvironment: () => env,
    getTransport: async () => transport,
    fromAddress: 'no-reply@imob.com',
  });

describe('sendHandler — fluxo de envio', () => {
  it('produção + lead com e-mail: envia ao lead real e registra status "sent"', async () => {
    const { supabase, inserts } = makeFakeSupabase();
    const res = makeRes();
    await handlerWith(supabase, { env: 'production' })(baseReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('sent');
    expect(res.body.recipient).toBe('lead@cliente.com');
    expect(res.body.redirected).toBe(false);
    // histórico
    expect(inserts[0]).toMatchObject({
      tenant_id: 't1',
      lead_id: '42',
      recipient_email: 'lead@cliente.com',
      lead_email: 'lead@cliente.com',
      status: 'sent',
      environment: 'production',
      sent_by_email: 'corretor@imob.com',
      property_count: 1,
    });
  });

  it('desenvolvimento: redireciona para o e-mail de teste', async () => {
    const { supabase, inserts } = makeFakeSupabase();
    const res = makeRes();
    await handlerWith(supabase, { env: 'development' })(baseReq(), res);

    expect(res.body.recipient).toBe('teste@imob.com');
    expect(res.body.redirected).toBe(true);
    expect(inserts[0].redirected).toBe(true);
    expect(inserts[0].lead_email).toBe('lead@cliente.com'); // intenção preservada
    expect(inserts[0].subject).toContain('[REDIRECIONADO');
  });

  it('produção sem e-mail do lead: 422 (não envia)', async () => {
    const { supabase } = makeFakeSupabase();
    const res = makeRes();
    const req = baseReq();
    req.body.lead.email = null;
    await handlerWith(supabase, { env: 'production' })(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('missing_lead_email');
    expect(sentTransport.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: null }),
    );
  });

  it('modo teste: status "test", sempre para o e-mail de teste', async () => {
    const { supabase, inserts } = makeFakeSupabase();
    const res = makeRes();
    const req = baseReq({ isTest: true });
    await handlerWith(supabase, { env: 'production' })(req, res);

    expect(res.body.status).toBe('test');
    expect(res.body.recipient).toBe('teste@imob.com');
    expect(inserts[0].is_test).toBe(true);
  });

  it('transporte simulado: status "simulated"', async () => {
    const { supabase } = makeFakeSupabase();
    const res = makeRes();
    await handlerWith(supabase, { env: 'production', transport: simTransport })(baseReq(), res);
    expect(res.body.status).toBe('simulated');
  });

  it('falha no envio: 502 e histórico com status "failed"', async () => {
    const failing = { kind: 'smtp', send: vi.fn(async () => { throw new Error('SMTP down'); }) };
    const { supabase, inserts } = makeFakeSupabase();
    const res = makeRes();
    await handlerWith(supabase, { env: 'production', transport: failing })(baseReq(), res);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('send_failed');
    expect(inserts[0].status).toBe('failed');
    expect(inserts[0].error_message).toContain('SMTP down');
  });

  it('validação: tenantId ausente → 400', async () => {
    const { supabase } = makeFakeSupabase();
    const res = makeRes();
    const req = baseReq();
    delete req.body.tenantId;
    await handlerWith(supabase)(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('missing_tenant_id');
  });

  it('validação: sem imóveis (envio normal) → 400', async () => {
    const { supabase } = makeFakeSupabase();
    const res = makeRes();
    const req = baseReq();
    req.body.properties = [];
    await handlerWith(supabase)(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('no_properties_selected');
  });

  it('autorização: sem membership no tenant → 403', async () => {
    const { supabase } = makeFakeSupabase({ membership: null });
    const res = makeRes();
    await handlerWith(supabase)(baseReq(), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('forbidden_tenant');
  });
});
