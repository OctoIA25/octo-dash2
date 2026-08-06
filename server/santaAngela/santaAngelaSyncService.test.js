import { describe, it, expect } from 'vitest';
import { createSantaAngelaSyncService } from './santaAngelaSyncService.js';

// Supabase fake mínimo: select de existentes + insert/update + update de status.
function makeSupabase({ existing = [] } = {}) {
  const state = { inserted: [], updated: [], statusUpdated: null };
  const supabase = {
    from(table) { this._table = table; return this; },
    select() { this._op = 'select'; return this; },
    eq() { return this; },
    insert(row) { state.inserted.push(row); return Promise.resolve({ error: null }); },
    update(payload) {
      const table = this._table; // 'leads' (updateExisting) ou config (touchSync)
      // encadeia .update().eq().eq() e resolve (touchSync usa .eq() único; updateExisting usa dois)
      const resolved = () => { state.updated.push({ table, payload }); return Promise.resolve({ error: null }); };
      const chain = { eq: () => chain, then: (res) => resolved().then(res) };
      return chain;
    },
    then(res) { // resolve o select de existentes
      return Promise.resolve({ data: existing, error: null }).then(res);
    },
  };
  return { supabase, state };
}

// Supabase fake para syncAllTenants: .from(config).select('tenant_id').eq('status','active')
// resolve a lista de tenants ativos; .in().not() (getDeletedTenantIds) resolve a
// lista de soft-deletados; demais operações (leads) resolvem vazio/sucesso.
function makeSupabaseWithTenants(activeTenantIds, deletedTenantIds = []) {
  return {
    from() { return this; },
    select() { return this; },
    in() {
      return { not: () => Promise.resolve({ data: deletedTenantIds.map((id) => ({ id })), error: null }) };
    },
    eq(col, val) {
      if (col === 'status' && val === 'active') {
        return Promise.resolve({ data: activeTenantIds.map((t) => ({ tenant_id: t })), error: null });
      }
      return this;
    },
    insert() { return Promise.resolve({ error: null }); },
    update() { const chain = { eq: () => chain, then: (r) => Promise.resolve({ error: null }).then(r) }; return chain; },
    then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
  };
}

// pLimit fake com semáforo real: garante no máximo n execuções simultâneas e
// rastreia o pico observado, para o teste provar que a concorrência é limitada.
function makeBoundedLimit() {
  const tracker = { max: 0, active: 0 };
  const factory = (n) => {
    let active = 0;
    const queue = [];
    const next = () => {
      if (active >= n || queue.length === 0) return;
      active++;
      const { fn, resolve, reject } = queue.shift();
      tracker.active++; tracker.max = Math.max(tracker.max, tracker.active);
      Promise.resolve().then(fn).then(resolve, reject).finally(() => {
        active--; tracker.active--; next();
      });
    };
    return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
  };
  factory.tracker = tracker;
  return factory;
}

// detalhes: { [prospectId]: empreendimento_id }; empreendimentos: id → { id, codigo, nome }
const okClient = (leads, { detalhes = {}, empreendimentos = {}, calls } = {}) => ({
  fetchLeads: async () => ({ ok: true, leads, status: 200 }),
  fetchProspectDetail: async (_t, id) => {
    if (calls) calls.detalhes.push(id);
    return id in detalhes ? { id, empreendimento_id: detalhes[id] } : null;
  },
  fetchEmpreendimentos: async () => {
    if (calls) calls.empreendimentos++;
    return new Map(Object.entries(empreendimentos));
  },
});

it('syncTenant insere lead novo', async () => {
  const { supabase, state } = makeSupabase({ existing: [] });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'n1', nome: 'Novo', celular: '111' }]) });
  const r = await svc.syncTenant('t1');
  expect(r.success).toBe(true);
  expect(r.totalFetched).toBe(1);
  expect(r.newLeads).toBe(1);
  expect(state.inserted.length).toBe(1);
});

it('syncTenant: lead sem id não casa com source_lead_id nulo existente (insere, não atualiza)', async () => {
  // Regressão C2: existente com source_lead_id null + saLead sem id não deve virar "update".
  const { supabase, state } = makeSupabase({ existing: [{ phone: null, source_lead_id: null }] });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ nome: 'Sem ID', celular: '222' }]) });
  const r = await svc.syncTenant('t1');
  expect(r.updatedLeads).toBe(0);
  expect(r.newLeads).toBe(1);
  expect(state.inserted.length).toBe(1);
});

it('syncTenant: UPDATE de lead existente NÃO reescreve assigned_at (não reinicia o bolsão)', async () => {
  // Regressão C1: assigned_at é a base do countdown do bolsão. O UPDATE nunca
  // grava assigned_at diretamente — quem reinicia o countdown é o trigger
  // tg_update_leads_assigned_at, e SÓ quando o corretor muda de fato.
  // Aqui o status muda (NOVO→atendimento) mas assigned_at não está no payload.
  const { supabase, state } = makeSupabase({
    existing: [{ phone: '999', source_lead_id: 'x1', status: 'Novos Leads', assigned_agent_name: null }],
  });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'x1', nome: 'Existente', celular: '999', situacaocadastropessoa_titulo: 'EM ATENDIMENTO' }]) });
  const r = await svc.syncTenant('t1');
  expect(r.updatedLeads).toBe(1);
  const leadsUpdate = state.updated.find((u) => u.table === 'leads');
  expect(leadsUpdate).toBeTruthy();
  expect('assigned_at' in leadsUpdate.payload).toBe(false);
  expect('updated_at' in leadsUpdate.payload).toBe(true);
});

it('syncTenant: origem vence — status e corretor são atualizados no lead existente', async () => {
  // Cenário do enunciado: João entra Novo/sem corretor; depois a origem manda
  // EM ATENDIMENTO / Carlos. O UPDATE deve gravar status e assigned_agent_name.
  const { supabase, state } = makeSupabase({
    existing: [{ phone: 'X', source_lead_id: 'joao', status: 'Novos Leads', assigned_agent_name: null }],
  });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'joao', nome: 'João', celular: 'X',
      situacaocadastropessoa_titulo: 'EM ATENDIMENTO', corretor_nome: 'Carlos' }]) });
  const r = await svc.syncTenant('t1');
  expect(r.updatedLeads).toBe(1);
  const leadsUpdate = state.updated.find((u) => u.table === 'leads');
  expect(leadsUpdate.payload.status).toBe('Interação'); // EM ATENDIMENTO → Interação
  expect(leadsUpdate.payload.assigned_agent_name).toBe('Carlos');
});

it('syncTenant: dirty-check — nada mudou ⇒ nenhum UPDATE em leads (evita escrita inútil no polling)', async () => {
  const { supabase, state } = makeSupabase({
    existing: [{ phone: 'X', source_lead_id: 'joao', status: 'Interação', assigned_agent_name: 'Carlos' }],
  });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'joao', nome: 'João', celular: 'X',
      situacaocadastropessoa_titulo: 'EM ATENDIMENTO', corretor_nome: 'Carlos' }]) });
  const r = await svc.syncTenant('t1');
  expect(r.updatedLeads).toBe(0); // unchanged, não conta como atualizado
  expect(state.updated.find((u) => u.table === 'leads')).toBeUndefined(); // não escreveu na tabela leads
});

it('syncTenant: atualização parcial — só status muda, corretor permanece', async () => {
  const { supabase, state } = makeSupabase({
    existing: [{ phone: 'X', source_lead_id: 'joao', status: 'Novos Leads', assigned_agent_name: 'Carlos' }],
  });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'joao', nome: 'João', celular: 'X',
      situacaocadastropessoa_titulo: 'EM ATENDIMENTO', corretor_nome: 'Carlos' }]) });
  await svc.syncTenant('t1');
  const leadsUpdate = state.updated.find((u) => u.table === 'leads');
  expect(leadsUpdate.payload.status).toBe('Interação');
  expect(leadsUpdate.payload.assigned_agent_name).toBe('Carlos'); // inalterado, mas re-gravado (origem vence)
});

it('syncTenant falha da API => success=false', async () => {
  const { supabase } = makeSupabase();
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: { fetchLeads: async () => ({ ok: false, leads: [], status: 401, error: 'HTTP 401' }) } });
  const r = await svc.syncTenant('t1');
  expect(r.success).toBe(false);
  expect(r.message).toMatch(/401/);
});

it('syncTenant zero leads => success com mensagem', async () => {
  const { supabase } = makeSupabase();
  const svc = createSantaAngelaSyncService({ supabase, apiClient: okClient([]) });
  const r = await svc.syncTenant('t1');
  expect(r.success).toBe(true);
  expect(r.totalFetched).toBe(0);
});

it('syncAllTenants varre todos os tenants active e respeita o limite de concorrência', async () => {
  const supabase = makeSupabaseWithTenants(['a', 'b', 'c', 'd', 'e']);
  const limit = makeBoundedLimit();
  const svc = createSantaAngelaSyncService({
    supabase, apiClient: okClient([]), pLimitImpl: limit,
    processEnv: { SANTA_ANGELA_SYNC_CONCURRENCY: '2' },
  });
  const results = await svc.syncAllTenants('run-1');
  expect(results.length).toBe(5);
  expect(results.every((r) => r.success)).toBe(true);
  expect(limit.tracker.max).toBeLessThanOrEqual(2); // nunca mais que 2 em paralelo
});

it('syncAllTenants: tenant soft-deletado (tenants.deleted_at) é pulado', async () => {
  const supabase = makeSupabaseWithTenants(['vivo', 'morto'], ['morto']);
  const synced = [];
  const apiClient = {
    fetchLeads: async (t) => { synced.push(t); return { ok: true, leads: [], status: 200 }; },
  };
  const svc = createSantaAngelaSyncService({ supabase, apiClient, pLimitImpl: makeBoundedLimit() });
  const results = await svc.syncAllTenants('run-sd');
  expect(results.map((r) => r.tenantId)).toEqual(['vivo']);
  expect(synced).not.toContain('morto');
});

it('syncAllTenants: um tenant que falha não derruba os outros (allSettled isola)', async () => {
  const supabase = makeSupabaseWithTenants(['ok1', 'boom', 'ok2']);
  const apiClient = {
    fetchLeads: async (t) => (t === 'boom'
      ? { ok: false, leads: [], status: 500, error: 'HTTP 500' }
      : { ok: true, leads: [], status: 200 }),
  };
  const svc = createSantaAngelaSyncService({ supabase, apiClient, pLimitImpl: makeBoundedLimit() });
  const results = await svc.syncAllTenants('run-2');
  expect(results.length).toBe(3);
  expect(results.filter((r) => r.success).length).toBe(2);
  expect(results.find((r) => r.tenantId === 'boom').success).toBe(false);
});

it('syncAllTenants: tenant pendurado estoura por timeout sem bloquear os demais', async () => {
  const supabase = makeSupabaseWithTenants(['fast', 'hang']);
  const apiClient = {
    fetchLeads: async (t) => (t === 'hang'
      ? new Promise(() => {}) // nunca resolve
      : { ok: true, leads: [], status: 200 }),
  };
  const svc = createSantaAngelaSyncService({
    supabase, apiClient, pLimitImpl: makeBoundedLimit(),
    processEnv: { SANTA_ANGELA_TENANT_TIMEOUT_MS: '20' },
  });
  const results = await svc.syncAllTenants('run-3');
  expect(results.length).toBe(2);
  expect(results.find((r) => r.tenantId === 'fast').success).toBe(true);
  const hang = results.find((r) => r.tenantId === 'hang');
  expect(hang.success).toBe(false);
  expect(hang.message).toMatch(/timeout/);
});

it('syncTenant: lead novo entra com o empreendimento em property_code', async () => {
  const { supabase, state } = makeSupabase({ existing: [] });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'p1', nome: 'Novo', celular: '111' }], {
      detalhes: { p1: '55' },
      empreendimentos: { 55: { id: '55', codigo: '8801', nome: 'RESERVA CASTANHEIRA' } },
    }) });
  await svc.syncTenant('t1');
  expect(state.inserted[0].property_code).toBe('RESERVA CASTANHEIRA');
});

it('syncTenant: lead existente SEM código é preenchido; quem já tem não gasta requisição', async () => {
  const calls = { detalhes: [], empreendimentos: 0 };
  const { supabase, state } = makeSupabase({
    existing: [
      { phone: 'A', source_lead_id: 'semCodigo', status: 'Novos Leads', assigned_agent_name: null, property_code: null },
      { phone: 'B', source_lead_id: 'comCodigo', status: 'Novos Leads', assigned_agent_name: null, property_code: 'PORTAL DOS LAGOS' },
    ],
  });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient(
      [{ id: 'semCodigo', nome: 'A', celular: 'A' }, { id: 'comCodigo', nome: 'B', celular: 'B' }],
      { detalhes: { semCodigo: '55' },
        empreendimentos: { 55: { id: '55', codigo: '8801', nome: 'RESERVA CASTANHEIRA' } },
        calls },
    ) });
  await svc.syncTenant('t1');

  expect(calls.detalhes).toEqual(['semCodigo']); // 'comCodigo' não é consultado de novo
  const upd = state.updated.filter((u) => u.table === 'leads');
  expect(upd.length).toBe(1);
  expect(upd[0].payload.property_code).toBe('RESERVA CASTANHEIRA');
});

it('syncTenant: detalhe indisponível não apaga o código já gravado', async () => {
  // /prospects/{id} responde 400 em prospect de outra carteira → fetchProspectDetail = null.
  const { supabase, state } = makeSupabase({
    existing: [{ phone: 'C', source_lead_id: 'x', status: 'Novos Leads', assigned_agent_name: null, property_code: null }],
  });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'x', nome: 'C', celular: 'C', situacaocadastropessoa_titulo: 'EM ATENDIMENTO' }], { detalhes: {} }) });
  await svc.syncTenant('t1');
  const upd = state.updated.find((u) => u.table === 'leads');
  expect(upd.payload.status).toBe('Interação');       // o status ainda é atualizado
  expect('property_code' in upd.payload).toBe(false); // mas o código não é sobrescrito com null
});
