import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { registerRecrutamentoRoutes } from './index.js';

/**
 * Supabase fake que HONRA os `.eq()` — diferente do fake do GA, aqui o filtro é
 * o objeto do teste: as rotas se apoiam em `.eq('tenant_id', ...)` para isolar
 * tenant, e um fake que ignora filtro daria verde justamente no caso que
 * importa. `then` no chain cobre o `await` sem maybeSingle.
 */
function fakeSupabase({ user = { id: 'u1', email: 'user@t.com' }, tables = {}, rpcData = [] } = {}) {
  const calls = { inserts: [], updates: [], rpc: [], reads: [] };
  const rows = (t) => tables[t] || [];

  const from = (table) => {
    const filters = [];
    let pendingInsert = null;
    let pendingUpdate = null;
    calls.reads.push(table);
    const match = () => rows(table).filter((r) => filters.every(([c, v]) => r[c] === v));
    const chain = {
      select: () => chain,
      eq: (col, val) => { filters.push([col, val]); return chain; },
      order: () => chain,
      limit: () => chain,
      insert: (row) => { pendingInsert = row; calls.inserts.push({ table, row }); return chain; },
      update: (row) => { pendingUpdate = row; calls.updates.push({ table, row }); return chain; },
      maybeSingle: async () => {
        if (pendingInsert) return { data: { id: 'novo-id', ...pendingInsert }, error: null };
        if (pendingUpdate) {
          const hit = match()[0];
          return { data: hit ? { ...hit, ...pendingUpdate } : null, error: null };
        }
        return { data: match()[0] || null, error: null };
      },
      then: (resolve) => resolve({ data: pendingInsert ? [] : match(), error: null }),
    };
    return chain;
  };

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(from),
    rpc: vi.fn(async (fn, args) => { calls.rpc.push({ fn, args }); return { data: rpcData, error: null }; }),
    _calls: calls,
  };
}

async function servir(supabase) {
  const app = express();
  app.use(express.json());
  registerRecrutamentoRoutes(app, supabase);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/recrutamento`;
  const call = (path, init = {}) => fetch(base + path, {
    ...init,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json', ...(init.headers || {}) },
  });
  return { call, close: () => new Promise((r) => server.close(r)) };
}

const admin = { tenant_memberships: [{ user_id: 'u1', tenant_id: 't1', role: 'admin' }] };

describe('rotas de recrutamento', () => {
  it('exige Authorization', async () => {
    const s = await servir(fakeSupabase({ tables: admin }));
    const r = await s.call('/fila-acao', { headers: { authorization: '' } });
    expect(r.status).toBe(401);
    await s.close();
  });

  it('barra quem não é admin/owner', async () => {
    const s = await servir(fakeSupabase({
      tables: { tenant_memberships: [{ user_id: 'u1', tenant_id: 't1', role: 'corretor' }] },
    }));
    const r = await s.call('/fila-acao');
    expect(r.status).toBe(403);
    await s.close();
  });

  it('recusa encerrar sem motivo, sem tocar no banco', async () => {
    const supabase = fakeSupabase({ tables: admin });
    const s = await servir(supabase);
    const r = await s.call('/candidatos/c1/encerrar', { method: 'POST', body: JSON.stringify({}) });
    expect(r.status).toBe(422);
    expect(supabase._calls.updates).toHaveLength(0);
    expect(supabase._calls.inserts).toHaveLength(0);
    await s.close();
  });

  it('recusa evento de tipo inventado', async () => {
    const supabase = fakeSupabase({ tables: admin });
    const s = await servir(supabase);
    const r = await s.call('/candidatos/c1/eventos', { method: 'POST', body: JSON.stringify({ tipo: 'virou_socio' }) });
    expect(r.status).toBe(400);
    expect(supabase._calls.inserts).toHaveLength(0);
    await s.close();
  });

  it('é idempotente por telefone: não cria de novo, mas registra o evento', async () => {
    const supabase = fakeSupabase({
      tables: {
        ...admin,
        recrut_candidato: [{ id: 'c1', tenant_id: 't1', telefone: '5511999998888', nome: 'Kelly' }],
      },
    });
    const s = await servir(supabase);
    const r = await s.call('/candidatos', {
      method: 'POST',
      body: JSON.stringify({ nome: 'Kelly de novo', telefone: '(11) 99999-8888' }), // sem DDI
    });
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.criado).toBe(false);
    expect(body.candidato.id).toBe('c1');
    expect(supabase._calls.inserts.map((i) => i.table)).toEqual(['recrut_evento']);
    await s.close();
  });

  it('funil roda no tenant do JWT', async () => {
    const supabase = fakeSupabase({ tables: admin, rpcData: [{ lead: 41, onboard: 1 }] });
    const s = await servir(supabase);
    const r = await s.call('/funil?canal=indicacao');
    expect(r.status).toBe(200);
    expect(supabase._calls.rpc[0].args.p_tenant_id).toBe('t1');
    expect(supabase._calls.rpc[0].args.p_canal).toBe('indicacao');
    await s.close();
  });

  it('funil de outro tenant é negado, não silenciosamente trocado', async () => {
    const supabase = fakeSupabase({ tables: admin });
    const s = await servir(supabase);
    const r = await s.call('/funil?tenantId=t2-do-vizinho');
    expect(r.status).toBe(403);
    expect(supabase._calls.rpc).toHaveLength(0);
    await s.close();
  });

  it('ficha de candidato de outro tenant dá 404 e não lê a timeline', async () => {
    const supabase = fakeSupabase({
      tables: { ...admin, recrut_candidato: [{ id: 'c9', tenant_id: 't2', nome: 'Do vizinho' }] },
    });
    const s = await servir(supabase);
    const r = await s.call('/candidatos/c9');
    expect(r.status).toBe(404);
    expect(supabase._calls.reads).not.toContain('recrut_evento');
    await s.close();
  });
});
