import { describe, it, expect } from 'vitest';
import { makeCreateScheduleHandler, makeListSchedulesHandler } from './index.js';

function makeFake({ membership = { user_id: 'u1' }, list = [], config = null } = {}) {
  const inserts = [];
  const supabase = {
    from(table) {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership, error: null }) }) }) }) };
      }
      if (table === 'tenant_recommendation_config') {
        // Defaults de cadência do tenant (intervalo + janela). Uma única `.eq()`.
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: config, error: null }) }) }) };
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
    // Sem config do tenant → cadência padrão de 7 dias (snapshot no agendamento).
    expect(inserts[0]).toMatchObject({ interval_days: 7, interest_window_days: 7 });
  });

  it('usa a cadência configurada pelo tenant como snapshot (intervalo + janela)', async () => {
    const { supabase, inserts } = makeFake({
      config: { recommendation_interval_days: 14, interest_window_days: 30 },
    });
    const res = makeRes();
    await makeCreateScheduleHandler(supabase)(req({ body: validBody }), res);

    expect(res.statusCode).toBe(201);
    expect(inserts[0]).toMatchObject({ interval_days: 14, interest_window_days: 30 });
    const days = (new Date(inserts[0].next_run_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15);
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
