import { describe, it, expect } from 'vitest';
import { makeCreateScheduleHandler, makeListSchedulesHandler } from './index.js';

function makeFake({ membership = { user_id: 'u1' }, list = [] } = {}) {
  const inserts = [];
  const supabase = {
    from(table) {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership, error: null }) }) }) }) };
      }
      if (table === 'recommendation_schedules') {
        // Nó chainable E thenable: select/eq/order/limit retornam o nó; await
        // resolve via .then (espelha o query builder do supabase-js).
        const node = {
          insert(row) {
            inserts.push(row);
            return { select: () => ({ single: async () => ({ data: { id: 'sch-1' }, error: null }) }) };
          },
          select: () => node,
          eq: () => node,
          order: () => node,
          limit: () => node,
          then: (resolve) => resolve({ data: list, error: null }),
        };
        return node;
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

const req = (over = {}) => ({ userId: 'u1', userEmail: 'c@imob.com', query: {}, body: {}, ...over });

describe('makeCreateScheduleHandler', () => {
  const validBody = {
    tenantId: 't1',
    lead: { id: 42, source: 'bolsao', name: 'Ana', email: 'ana@x.com', phone: '5511999998888' },
    channels: ['email', 'whatsapp'],
    content: { subject: 'Imóveis', message: 'oi', html: '<html>', text: 'oi', whatsappBody: 'Olá' },
    properties: [{ referencia: 'A', titulo: 'Casa', preco: 500000 }],
  };

  it('cria agendamento com snapshot e next_run futuro', async () => {
    const { supabase, inserts } = makeFake();
    const res = makeRes();
    await makeCreateScheduleHandler(supabase)(req({ body: validBody }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ ok: true, id: 'sch-1' });
    expect(inserts[0]).toMatchObject({
      tenant_id: 't1',
      channels: ['email', 'whatsapp'],
      email_html: '<html>',
      whatsapp_body: 'Olá',
      active: true,
      frequency: 'weekly',
    });
    expect(new Date(inserts[0].next_run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('400 sem canais', async () => {
    const { supabase } = makeFake();
    const res = makeRes();
    await makeCreateScheduleHandler(supabase)(req({ body: { ...validBody, channels: [] } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('no_channels');
  });

  it('400 sem imóveis', async () => {
    const { supabase } = makeFake();
    const res = makeRes();
    await makeCreateScheduleHandler(supabase)(req({ body: { ...validBody, properties: [] } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('no_properties_selected');
  });

  it('403 sem acesso ao tenant', async () => {
    const { supabase } = makeFake({ membership: null });
    const res = makeRes();
    await makeCreateScheduleHandler(supabase)(req({ body: validBody }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('makeListSchedulesHandler', () => {
  it('lista agendamentos do lead', async () => {
    const { supabase } = makeFake({ list: [{ id: 'sch-1', active: true, channels: ['email'] }] });
    const res = makeRes();
    await makeListSchedulesHandler(supabase)(req({ query: { tenantId: 't1', leadId: '42' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});
