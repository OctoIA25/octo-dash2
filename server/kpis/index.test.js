import { describe, it, expect } from 'vitest';
import { resolveTenant, makeKpisHandler } from './index.js';

const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

/**
 * Fake Supabase mínimo para os caminhos de resolução de tenant e do handler.
 * `memberships` = linhas de tenant_memberships do usuário.
 * `tenants` = ids existentes (para o caminho do owner).
 * `leads`/`goals`/`imoveis_locais` retornam vazio por padrão.
 */
function makeSupabase({ memberships = [], tenants = [], leads = [], dashboardKpis = [], imoveisExclusivos = 0, imoveisSemExcl = 0, corretores = 0 } = {}) {
  function tableQuery(table) {
    let rangeServed = false;
    const node = {
      _filters: {},
      select() { return node; },
      eq(col, val) { node._filters[col] = val; return node; },
      in(col, vals) { node._filters[col] = vals; return node; },
      is() { return node; },
      gte() { return node; },
      lte() { return node; },
      order() { return node; },
      range() {
        // fetchLeads pagina: 1ª página devolve os leads, 2ª devolve vazio (corta o loop).
        const page = !rangeServed ? leads : [];
        rangeServed = true;
        return Promise.resolve({ data: page, error: null });
      },
      maybeSingle() {
        if (table === 'tenants') {
          const found = tenants.includes(node._filters.id) ? { id: node._filters.id } : null;
          return Promise.resolve({ data: found, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve) {
        if (table === 'tenant_memberships') {
          // Resolução de tenant (sem count): lista de tenant_ids do usuário.
          // Contagem de corretores (com count): head:true → devolve count.
          // Discrimina pelo filtro de role (a contagem filtra .in('role', [...]);
          // a resolução de tenant filtra por user_id) — não há coluna `status`.
          if (node._filters.role) {
            return resolve({ data: [], error: null, count: corretores });
          }
          const rows = memberships
            .filter((m) => m.user_id === node._filters.user_id)
            .map((m) => ({ tenant_id: m.tenant_id }));
          return resolve({ data: rows, error: null });
        }
        if (table === 'dashboard_kpis') return resolve({ data: dashboardKpis, error: null });
        if (table === 'imoveis_locais') {
          // countCaptacao: filtra exclusivo true/false; countImoveisAtivos: sem esse filtro.
          if (node._filters.exclusivo === true) return resolve({ count: imoveisExclusivos, error: null });
          if (node._filters.exclusivo === false) return resolve({ count: imoveisSemExcl, error: null });
          return resolve({ count: imoveisExclusivos + imoveisSemExcl, error: null });
        }
        if (table === 'goals') return resolve({ data: [], error: null });
        if (table === 'kpi_targets' || table === 'kpi_values') return resolve({ data: [], error: null });
        return resolve({ data: [], error: null, count: 0 });
      },
    };
    return node;
  }

  return {
    from: (table) => tableQuery(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
}

describe('resolveTenant — isolamento por tenant', () => {
  it('usuário comum: tenant vem da membership (cliente não escolhe)', async () => {
    const supabase = makeSupabase({ memberships: [{ user_id: 'u1', tenant_id: 't1' }] });
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: {} };
    expect(await resolveTenant(supabase, req)).toEqual({ tenantId: 't1' });
  });

  it('usuário comum sem membership → 403', async () => {
    const supabase = makeSupabase({ memberships: [] });
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: {} };
    expect(await resolveTenant(supabase, req)).toEqual({ error: 'no_tenant_access', status: 403 });
  });

  it('usuário comum não pode pedir tenant onde não é membro → 403', async () => {
    const supabase = makeSupabase({ memberships: [{ user_id: 'u1', tenant_id: 't1' }] });
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: { tenantId: 't2' } };
    expect(await resolveTenant(supabase, req)).toEqual({ error: 'tenant_forbidden', status: 403 });
  });

  it('usuário comum pode pedir tenant onde É membro', async () => {
    const supabase = makeSupabase({
      memberships: [{ user_id: 'u1', tenant_id: 't1' }, { user_id: 'u1', tenant_id: 't2' }],
    });
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: { tenantId: 't2' } };
    expect(await resolveTenant(supabase, req)).toEqual({ tenantId: 't2' });
  });

  it('owner precisa informar tenantId', async () => {
    const supabase = makeSupabase({ tenants: ['t9'] });
    const req = { userId: 'owner', userEmail: OWNER_EMAIL, query: {} };
    expect(await resolveTenant(supabase, req)).toEqual({ error: 'tenant_required_for_owner', status: 400 });
  });

  it('owner pode impersonar tenant existente', async () => {
    const supabase = makeSupabase({ tenants: ['t9'] });
    const req = { userId: 'owner', userEmail: OWNER_EMAIL, query: { tenantId: 't9' } };
    expect(await resolveTenant(supabase, req)).toEqual({ tenantId: 't9' });
  });

  it('owner pedindo tenant inexistente → 404', async () => {
    const supabase = makeSupabase({ tenants: ['t9'] });
    const req = { userId: 'owner', userEmail: OWNER_EMAIL, query: { tenantId: 'nope' } };
    expect(await resolveTenant(supabase, req)).toEqual({ error: 'tenant_not_found', status: 404 });
  });
});

describe('makeKpisHandler', () => {
  const makeRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
  };

  it('responde 200 com overview no shape esperado', async () => {
    const supabase = makeSupabase({ memberships: [{ user_id: 'u1', tenant_id: 't1' }] });
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: {} };
    const res = makeRes();
    await makeKpisHandler(supabase)(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.overview.cards).toHaveLength(6);
    expect(res.body.overview.funnel.stages).toHaveLength(5);
    expect(Array.isArray(res.body.overview.sources)).toBe(true);
    expect(res.body.overview.priceRanges).toHaveLength(3);
  });

  it('lê o estágio do funil da coluna `status` (não etapa_atual) e soma vendas', async () => {
    const supabase = makeSupabase({
      memberships: [{ user_id: 'u1', tenant_id: 't1' }],
      leads: [
        { status: 'Proposta Assinada', final_sale_value: 700000, source: 'Zap', created_at: '2026-06-10T12:00:00Z', first_response_at: '2026-06-10T12:05:00Z' },
        { status: 'Novos Leads', final_sale_value: null, source: 'OLX', created_at: '2026-06-11T12:00:00Z', first_response_at: null },
      ],
    });
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: { month: '2026-06-01' } };
    const res = makeRes();
    await makeKpisHandler(supabase)(req, res);

    expect(res.statusCode).toBe(200);
    const ov = res.body.overview;
    // lead com status 'Proposta Assinada' cai na etapa 'Fechamento'
    const fechamento = ov.funnel.stages.find((s) => s.label === 'Fechamento');
    expect(fechamento.count).toBe(1);
    // venda contabilizada (final_sale_value > 0)
    const vendas = ov.cards.find((c) => c.key === 'vendas');
    expect(vendas.rawValue).toBe(1);
  });

  it('propaga 403 quando o usuário não tem tenant', async () => {
    const supabase = makeSupabase({ memberships: [] });
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: {} };
    const res = makeRes();
    await makeKpisHandler(supabase)(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ ok: false, error: 'no_tenant_access' });
  });
});

describe('makeKpisHandler — counts de captação/equipe chegam ao card', () => {
  it('KPI crm captacaoExclusiva reflete o count de imoveis_locais (exclusivo=true)', async () => {
    const supabase = makeSupabase({
      memberships: [{ user_id: 'u1', tenant_id: 't1' }],
      imoveisExclusivos: 7, imoveisSemExcl: 12, corretores: 9,
      dashboardKpis: [{
        id: 'k1', name: 'Captação Exclusiva', category_id: 'operacao',
        source: 'crm', metric_key: 'captacaoExclusiva', unit: 'count',
        status: 'active', is_visible: true, is_featured: true, display_order: 0,
      }],
    });
    const handler = makeKpisHandler(supabase);
    const req = { userId: 'u1', userEmail: 'corretor@x.com', query: { month: '2026-06-01' } };
    let payload;
    const res = { status: () => res, json: (b) => { payload = b; return res; } };
    await handler(req, res);

    const card = payload.overview.cards.find((c) => c.metricKey === 'captacaoExclusiva');
    expect(card).toBeTruthy();
    expect(card.rawValue).toBe(7);
    expect(card.category).toBe('operacao');
  });
});
