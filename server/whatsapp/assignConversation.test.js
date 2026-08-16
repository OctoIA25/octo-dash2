/**
 * POST /api/v1/whatsapp/conversations/assign — a Lia define o corretor dono da
 * conversa. É o que torna a conversa (e o telefone do lead) visível para o
 * corretor: enquanto assigned_user_id é NULL, a RLS da 20260816 só mostra a
 * conversa para admin/owner.
 *
 * Mesmo padrão de fake app/res de server/enps/routes.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerWhatsappRoutes } from './index.js';

const ROUTE = 'POST /api/v1/whatsapp/conversations/assign';
const TENANT = '11111111-1111-1111-1111-111111111111';
const CORRETOR = '22222222-2222-2222-2222-222222222222';
const CONVERSA = '33333333-3333-3333-3333-333333333333';

function fakeApp() {
  const routes = {};
  return { routes, post(p, ...h) { routes[`POST ${p}`] = h; }, get(p, ...h) { routes[`GET ${p}`] = h; } };
}
function makeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
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

/** validateApiKey de mentira: identifica o tenant pela API key, como em produção. */
const validateApiKey = (req, _res, next) => { req.tenantId = TENANT; next(); };

/**
 * @param {{ member?: object|null, conversations?: object[] }} state
 */
function fakeSupabase(state = {}) {
  const calls = { filters: [], updates: [] };
  const { member = { user_id: CORRETOR }, conversations = [] } = state;

  const query = (table) => {
    let updated = false;
    const q = {
      select() { return q; },
      eq(col, val) { calls.filters.push([table, 'eq', col, val]); return q; },
      in(col, vals) { calls.filters.push([table, 'in', col, vals]); return q; },
      order() { return q; },
      limit() { return q; },
      update(patch) { updated = true; calls.updates.push(patch); return q; },
      maybeSingle: async () => ({ data: table === 'tenant_memberships' ? member : conversations[0] ?? null, error: null }),
      then(resolve, reject) {
        const result = updated ? { data: null, error: null } : { data: conversations, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  };

  return { calls, from: (table) => query(table) };
}

function register(supabase, options = { validateApiKey }) {
  const app = fakeApp();
  registerWhatsappRoutes(app, supabase, { verbose: false, ...options });
  return app;
}

describe('POST /api/v1/whatsapp/conversations/assign', () => {
  it('só existe quando o entrypoint passa validateApiKey (sem auth, sem rota)', () => {
    expect(register(fakeSupabase(), {}).routes[ROUTE]).toBeUndefined();
    expect(register(fakeSupabase()).routes[ROUTE]).toBeDefined();
  });

  it('userId ausente ou não-uuid → 400', async () => {
    const app = register(fakeSupabase());
    expect((await call(app.routes[ROUTE], { body: { phone: '11988887777' } })).body).toEqual({ error: 'invalid_user_id' });
    expect((await call(app.routes[ROUTE], { body: { phone: '11988887777', userId: 'joao' } })).statusCode).toBe(400);
  });

  it('sem telefone e sem conversationId → 400', async () => {
    const app = register(fakeSupabase());
    const res = await call(app.routes[ROUTE], { body: { userId: CORRETOR } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'missing_phone_or_conversation_id' });
  });

  it('corretor de outro tenant → 400 e nada é gravado', async () => {
    const supabase = fakeSupabase({ member: null });
    const app = register(supabase);
    const res = await call(app.routes[ROUTE], { body: { phone: '5511988887777', userId: CORRETOR } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'user_not_in_tenant' });
    expect(supabase.calls.updates).toEqual([]);
  });

  it('telefone sem conversa no tenant → 404', async () => {
    const supabase = fakeSupabase({ conversations: [] });
    const app = register(supabase);
    const res = await call(app.routes[ROUTE], { body: { phone: '5511988887777', userId: CORRETOR } });
    expect(res.statusCode).toBe(404);
    expect(supabase.calls.updates).toEqual([]);
  });

  it('grava assigned_user_id e devolve o dono anterior', async () => {
    const supabase = fakeSupabase({ conversations: [{ id: CONVERSA, assigned_user_id: null }] });
    const app = register(supabase);
    const res = await call(app.routes[ROUTE], { body: { phone: '5511988887777', userId: CORRETOR } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      conversationId: CONVERSA,
      assignedUserId: CORRETOR,
      previousAssignedUserId: null,
    });
    expect(supabase.calls.updates).toEqual([{ assigned_user_id: CORRETOR }]);
  });

  it('procura o número em todas as variantes (sem 9º dígito, sem DDI, com "+")', async () => {
    // O wa_id da Meta às vezes vem sem o 9º dígito e conversas antigas podem
    // estar sem DDI — buscar só a forma canônica não acharia a conversa real.
    const supabase = fakeSupabase({ conversations: [{ id: CONVERSA, assigned_user_id: null }] });
    const app = register(supabase);
    await call(app.routes[ROUTE], { body: { phone: '(11) 98888-7777', userId: CORRETOR } });
    const variantes = supabase.calls.filters.find(([, op]) => op === 'in')[3];
    expect(variantes).toEqual(expect.arrayContaining([
      '5511988887777', '551188887777', '11988887777', '+5511988887777',
    ]));
  });

  it('restringe a busca ao tenant da API key (nunca ao tenant do body)', async () => {
    const supabase = fakeSupabase({ conversations: [{ id: CONVERSA, assigned_user_id: null }] });
    const app = register(supabase);
    await call(app.routes[ROUTE], {
      body: { conversationId: CONVERSA, userId: CORRETOR, tenantId: 'tenant-de-outra-imobiliaria' },
    });
    const tenantFilters = supabase.calls.filters.filter(([, op, col]) => op === 'eq' && col === 'tenant_id');
    expect(tenantFilters.length).toBeGreaterThan(0);
    for (const [, , , val] of tenantFilters) expect(val).toBe(TENANT);
  });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../../supabase/migrations/20260816_whatsapp_conversation_visibility.sql'),
  'utf8',
);

describe('migração 20260816 — visibilidade das conversas', () => {
  it('regra única: gestor do tenant OU dono da conversa, sempre exigindo membership', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_read_whatsapp_conversation(');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
    expect(sql).toMatch(/FROM public\.tenant_memberships tm[\s\S]*tm\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/tm\.role IN \('admin', 'owner'\) OR p_assigned_user_id = auth\.uid\(\)/);
  });

  it('substitui as policies antigas (que davam o tenant inteiro a qualquer membro)', () => {
    for (const policy of [
      'whatsapp_conversations_select_tenant',
      'whatsapp_conversations_write_tenant',
      'whatsapp_messages_select_tenant',
      'whatsapp_messages_insert_tenant',
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}"`);
      expect(sql).toContain(`CREATE POLICY "${policy}"`);
    }
  });

  it('escrita usa o MESMO predicado (corretor não transfere conversa para outro)', () => {
    expect(sql).toMatch(
      /USING \(public\.can_read_whatsapp_conversation\(tenant_id, assigned_user_id\)\)\s+WITH CHECK \(public\.can_read_whatsapp_conversation\(tenant_id, assigned_user_id\)\)/,
    );
  });

  it('mensagens herdam a visibilidade da conversa (sem duplicar o predicado)', () => {
    const exists = sql.match(/EXISTS \(\s*SELECT 1 FROM public\.whatsapp_conversations c\s+WHERE c\.id = whatsapp_messages\.conversation_id\s*\)/g);
    expect(exists).toHaveLength(2); // SELECT e INSERT
  });

  it('cria o índice do recorte por corretor', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant_assigned[\s\S]*\(tenant_id, assigned_user_id\)/);
  });
});
