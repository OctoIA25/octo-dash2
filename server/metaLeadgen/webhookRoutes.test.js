import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { registerMetaWebhookRoutes } from './webhookRoutes.js';

const APP_SECRET = 'segredo-do-app';

function fakeApp() {
  const routes = {};
  return { routes, post(p, ...h) { routes[`POST ${p}`] = h; }, get(p, ...h) { routes[`GET ${p}`] = h; } };
}

function makeRes() {
  return {
    statusCode: 200, body: null, sent: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    send(t) { this.sent = t; return this; },
  };
}

async function call(handlers, req) {
  const res = makeRes();
  for (const h of handlers) {
    let nexted = false;
    await h(req, res, () => { nexted = true; });
    if (!nexted) break;
  }
  return res;
}

// Coleta as chamadas de upsert em meta_leadgen_events (uma por requisição, com
// o lote inteiro). `error` simula falha do upsert em lote (ex.: erro de
// conexão); ON CONFLICT DO NOTHING vive no lado do banco de verdade, não
// precisa ser simulado aqui — o fake só precisa devolver `{ error: null }`
// para o caminho feliz, reentrega incluída.
function fakeSupabase({ error = null } = {}) {
  const upsertCalls = [];
  return {
    upsertCalls,
    get inserted() {
      return error ? [] : upsertCalls.flatMap((c) => c.rows);
    },
    from() {
      return {
        upsert: async (rows, opts) => {
          upsertCalls.push({ rows, opts });
          return { error };
        },
      };
    },
  };
}

const activeConfig = {
  tenantId: 't1', appSecret: APP_SECRET, verifyToken: 'vt-xyz',
  webhookToken: 'wt-abc', status: 'active',
};

const fakeResolver = (cfg = activeConfig) => ({ resolveByWebhookToken: async () => cfg });

const payload = {
  object: 'page',
  entry: [{
    id: 'page-1',
    time: 1754481600,
    changes: [{
      field: 'leadgen',
      value: { leadgen_id: 'lg-1', page_id: 'page-1', form_id: 'form-1', ad_id: 'ad-1', created_time: 1754481600 },
    }],
  }],
};

const signed = (body, secret = APP_SECRET) => {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    params: { token: 'wt-abc' },
    rawBody: raw,
    body,
    headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex') },
  };
};

describe('GET handshake', () => {
  const handshake = (query, resolver = fakeResolver()) => {
    const app = fakeApp();
    registerMetaWebhookRoutes(app, fakeSupabase(), { resolver });
    return call(app.routes['GET /api/v1/integrations/meta/webhook/:token'], { params: { token: 'wt-abc' }, query });
  };

  it('devolve o challenge com verify token correto', async () => {
    const res = await handshake({ 'hub.mode': 'subscribe', 'hub.verify_token': 'vt-xyz', 'hub.challenge': '12345' });
    expect(res.statusCode).toBe(200);
    expect(res.sent).toBe('12345');
  });

  it('rejeita verify token errado', async () => {
    const res = await handshake({ 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '12345' });
    expect(res.statusCode).toBe(403);
    expect(res.sent).toBeNull();
  });

  it('rejeita mode diferente de subscribe', async () => {
    const res = await handshake({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'vt-xyz', 'hub.challenge': '1' });
    expect(res.statusCode).toBe(403);
  });

  it('token de webhook desconhecido devolve 404', async () => {
    const res = await handshake({ 'hub.mode': 'subscribe', 'hub.verify_token': 'vt-xyz', 'hub.challenge': '1' }, fakeResolver(null));
    expect(res.statusCode).toBe(404);
  });
});

describe('POST receiver', () => {
  const post = (req, { supabase = fakeSupabase(), resolver = fakeResolver() } = {}) => {
    const app = fakeApp();
    registerMetaWebhookRoutes(app, supabase, { resolver });
    return call(app.routes['POST /api/v1/integrations/meta/webhook/:token'], req).then((res) => ({ res, supabase }));
  };

  it('persiste o evento e responde 200', async () => {
    const { res, supabase } = await post(signed(payload));
    expect(res.statusCode).toBe(200);
    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0].leadgen_id).toBe('lg-1');
    expect(supabase.inserted[0].tenant_id).toBe('t1');
    expect(supabase.inserted[0].form_id).toBe('form-1');
    expect(supabase.inserted[0].status).toBe('pending');
  });

  it('rejeita assinatura inválida sem persistir', async () => {
    const { res, supabase } = await post(signed(payload, 'outro-segredo'));
    expect(res.statusCode).toBe(401);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('rejeita sem header de assinatura', async () => {
    const req = signed(payload);
    req.headers = {};
    const { res, supabase } = await post(req);
    expect(res.statusCode).toBe(401);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('token de webhook desconhecido devolve 404 sem revelar nada', async () => {
    const { res } = await post(signed(payload), { resolver: fakeResolver(null) });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('t1');
  });

  it('integração inativa devolve 404', async () => {
    const { res, supabase } = await post(signed(payload), {
      resolver: fakeResolver({ ...activeConfig, status: 'inactive' }),
    });
    expect(res.statusCode).toBe(404);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('reentrega do mesmo leadgen_id responde 200 e chama upsert com dedup por ON CONFLICT DO NOTHING', async () => {
    const supabase = fakeSupabase();
    const { res } = await post(signed(payload), { supabase });
    expect(res.statusCode).toBe(200);
    expect(supabase.upsertCalls).toHaveLength(1);
    expect(supabase.upsertCalls[0].rows.map((r) => r.leadgen_id)).toEqual(['lg-1']);
    expect(supabase.upsertCalls[0].opts).toEqual({ onConflict: 'leadgen_id', ignoreDuplicates: true });
  });

  it('ignora change que não seja leadgen e nem chama o upsert (eventos vazio)', async () => {
    const outro = { object: 'page', entry: [{ id: 'page-1', changes: [{ field: 'feed', value: {} }] }] };
    const { res, supabase } = await post(signed(outro));
    expect(res.statusCode).toBe(200);
    expect(supabase.inserted).toHaveLength(0);
    expect(supabase.upsertCalls).toHaveLength(0);
  });

  it('persiste todos os leads de um payload com vários changes num upsert só (não é mais laço sequencial)', async () => {
    const multi = {
      object: 'page',
      entry: [{
        id: 'page-1',
        changes: [
          { field: 'leadgen', value: { leadgen_id: 'lg-1', page_id: 'page-1', form_id: 'f1' } },
          { field: 'leadgen', value: { leadgen_id: 'lg-2', page_id: 'page-1', form_id: 'f1' } },
          { field: 'leadgen', value: { leadgen_id: 'lg-3', page_id: 'page-1', form_id: 'f1' } },
        ],
      }],
    };
    const { supabase } = await post(signed(multi));
    expect(supabase.upsertCalls).toHaveLength(1);
    expect(supabase.upsertCalls[0].rows.map((r) => r.leadgen_id)).toEqual(['lg-1', 'lg-2', 'lg-3']);
  });

  it('sem rawBody responde 401 em vez de estourar', async () => {
    const req = signed(payload);
    delete req.rawBody;
    const { res } = await post(req);
    expect(res.statusCode).toBe(401);
  });

  it('upsert em lote falhando com erro genérico responde 500 (lead não pode sumir em silêncio)', async () => {
    const supabase = fakeSupabase({ error: { code: '08006', message: 'connection failure' } });
    const { res } = await post(signed(payload), { supabase });
    expect(res.statusCode).toBe(500);
    expect(res.statusCode).not.toBe(200);
  });

  it('payload acima do teto de eventos é truncado, loga o descarte e responde 200 (retry não recuperaria o cortado)', async () => {
    const changes = Array.from({ length: 5001 }, (_, i) => ({
      field: 'leadgen',
      value: { leadgen_id: `lg-${i}`, page_id: 'page-1', form_id: 'f1' },
    }));
    const many = { object: 'page', entry: [{ id: 'page-1', changes }] };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { res, supabase } = await post(signed(many));
    expect(res.statusCode).toBe(200);
    expect(supabase.upsertCalls).toHaveLength(1);
    expect(supabase.upsertCalls[0].rows).toHaveLength(5000);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('descartando 1'));
    warnSpy.mockRestore();
  });

  it('leadgen_id de tipo inválido é ignorado, sem lançar e sem persistir', async () => {
    const bad = {
      object: 'page',
      entry: [{
        id: 'page-1',
        changes: [{ field: 'leadgen', value: { leadgen_id: { foo: 'bar' }, page_id: 'page-1' } }],
      }],
    };
    const { res, supabase } = await post(signed(bad));
    expect(res.statusCode).toBe(200);
    expect(supabase.inserted).toHaveLength(0);
    expect(supabase.upsertCalls).toHaveLength(0);
  });

  it('entry.changes de formato inesperado (não-array) não lança e não persiste', async () => {
    const weird = { object: 'page', entry: [{ id: 'page-1', changes: { not: 'an array' } }] };
    const { res, supabase } = await post(signed(weird));
    expect(res.statusCode).toBe(200);
    expect(supabase.inserted).toHaveLength(0);
    expect(supabase.upsertCalls).toHaveLength(0);
  });
});
