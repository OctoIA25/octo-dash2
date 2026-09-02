import { describe, it, expect } from 'vitest';
import { createSantaAngelaSyncService } from './santaAngelaSyncService.js';

// Supabase fake mínimo: select de existentes (paginado via .range) + insert/update.
// `existingError` simula falha de leitura (statement timeout) no getExisting.
function makeSupabase({ existing = [], existingError = null } = {}) {
  const state = { inserted: [], updated: [], statusUpdated: null };
  const supabase = {
    from(table) { this._table = table; return this; },
    select() { this._op = 'select'; this._range = null; return this; },
    eq() { return this; },
    order() { return this; },
    range(from, to) { this._range = [from, to]; return this; },
    insert(row) { state.inserted.push(row); return Promise.resolve({ error: null }); },
    update(payload) {
      const table = this._table; // 'leads' (updateExisting) ou config (touchSync)
      // encadeia .update().eq().eq() e resolve (touchSync usa .eq() único; updateExisting usa dois)
      const resolved = () => { state.updated.push({ table, payload }); return Promise.resolve({ error: null }); };
      const chain = { eq: () => chain, then: (res) => resolved().then(res) };
      return chain;
    },
    then(res) { // resolve o select de existentes (fatiado pelo .range, como o PostgREST)
      if (existingError) return Promise.resolve({ data: null, error: { message: existingError } }).then(res);
      const [from, to] = this._range || [0, existing.length - 1];
      return Promise.resolve({ data: existing.slice(from, to + 1), error: null }).then(res);
    },
  };
  return { supabase, state };
}

// Supabase fake para syncAllTenants: .from(config).select('tenant_id').eq('status','active')
// resolve a lista de tenants ativos; .in().not() (getDeletedTenantIds) resolve a
// lista de soft-deletados; demais operações (leads) resolvem vazio/sucesso.
// Aceita string (tenant já sincronizado, last_sync_at preenchido → modo página 1)
// ou objeto { tenant_id, last_sync_at } para exercitar o primeiro sync (full).
function makeSupabaseWithTenants(activeTenants, deletedTenantIds = []) {
  const rows = activeTenants.map((t) => (typeof t === 'string'
    ? { tenant_id: t, last_sync_at: '2026-01-01T00:00:00Z' }
    : t));
  return {
    from() { return this; },
    select() { return this; },
    order() { return this; },
    range() { return this; },
    in() {
      return { not: () => Promise.resolve({ data: deletedTenantIds.map((id) => ({ id })), error: null }) };
    },
    eq(col, val) {
      if (col === 'status' && val === 'active') {
        return Promise.resolve({ data: rows, error: null });
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

// `leads` pode ser um array (uma página) ou array de arrays (grid paginado p/ full sync).
// detalhes: { [prospectId]: empreendimento_id }; empreendimentos: id → { id, codigo, nome }
const okClient = (leads, { detalhes = {}, empreendimentos = {}, calls } = {}) => {
  const pages = Array.isArray(leads[0]) ? leads : [leads];
  return {
    fetchLeads: async (_t, page = 1) => {
      if (calls) calls.pages?.push(page);
      return { ok: true, leads: pages[page - 1] || [], status: 200, ultimaPagina: pages.length };
    },
    fetchProspectDetail: async (_t, id) => {
      if (calls) calls.detalhes.push(id);
      return id in detalhes ? { id, empreendimento_id: detalhes[id] } : null;
    },
    fetchEmpreendimentos: async () => {
      if (calls) calls.empreendimentos++;
      return new Map(Object.entries(empreendimentos));
    },
  };
};

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

it('syncTenant: falha lendo existentes ABORTA o ciclo (não re-insere a página inteira)', async () => {
  // Regressão da fábrica de duplicatas: getExisting falhava (statement timeout)
  // e devolvia sets vazios → o sync tratava os 100 da página 1 como novos e
  // re-inseria tudo, a cada ciclo com falha (7 cópias do mesmo lead em prod).
  const { supabase, state } = makeSupabase({ existingError: 'statement timeout' });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'x1', nome: 'Já existo', celular: '111' }]) });
  const r = await svc.syncTenant('t1');
  expect(r.success).toBe(false);
  expect(r.message).toMatch(/existentes/);
  expect(state.inserted.length).toBe(0);
});

it('syncTenant: existentes além de 1000 linhas são lidos (paginação do PostgREST)', async () => {
  // PostgREST corta em 1000 linhas sem erro; um existente na "página 2" ficava
  // invisível ao dedup e era re-inserido como novo.
  const existing = Array.from({ length: 1000 }, (_, i) => ({
    phone: `p${i}`, source_lead_id: `s${i}`, status: 'Novos Leads', assigned_agent_name: null,
  }));
  existing.push({ phone: 'alvo', source_lead_id: 'alvo', status: 'Interação', assigned_agent_name: 'Ana' });
  const { supabase, state } = makeSupabase({ existing });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([{ id: 'alvo', nome: 'Alvo', celular: 'alvo',
      situacaocadastropessoa_titulo: 'EM ATENDIMENTO', corretor_nome: 'Ana' }]) });
  const r = await svc.syncTenant('t1');
  expect(state.inserted.length).toBe(0); // dedup enxergou o lead da página 2
  expect(r.newLeads).toBe(0);
});

it('primeiro sync (full): varre todas as páginas; histórico entra fora do bolsão e sem Lia via assigned_at/created_at originais', async () => {
  const calls = { detalhes: [], empreendimentos: 0, pages: [] };
  const antigo = { id: 'a1', nome: 'Antigo', celular: '111', datahoracadastro: '2019-10-21T14:00:44.000' };
  const recente = { id: 'r1', nome: 'Recente', celular: '222', datahoracadastro: new Date().toISOString() };
  const { supabase, state } = makeSupabase({ existing: [] });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([[recente], [antigo]], { calls }) });
  const r = await svc.syncTenant('t1', 'run', { full: true });
  expect(calls.pages).toEqual([1, 2]); // andou o grid inteiro
  expect(r.newLeads).toBe(2);
  const antigoRow = state.inserted.find((l) => l.source_lead_id === 'a1');
  const recenteRow = state.inserted.find((l) => l.source_lead_id === 'r1');
  expect(antigoRow.participa_bolsao).toBe(false);          // histórico não inunda o bolsão
  expect(antigoRow.assigned_at).toBe(antigoRow.created_at); // nem os KPIs de atribuição
  expect(calls.detalhes).not.toContain('a1');              // sem 1 req/lead de empreendimento no full
  expect(recenteRow.participa_bolsao).toBe(true);          // lead fresco segue o fluxo vivo
});

it('sync normal continua lendo só a página 1 mesmo com grid paginado', async () => {
  const calls = { detalhes: [], empreendimentos: 0, pages: [] };
  const { supabase } = makeSupabase({ existing: [] });
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([[{ id: 'n1', nome: 'Novo', celular: '111' }], [{ id: 'v1', nome: 'Velho', celular: '222' }]], { calls }) });
  await svc.syncTenant('t1');
  expect(calls.pages).toEqual([1]);
});

it('syncAllTenants: tenant sem last_sync_at faz o primeiro sync completo; os demais, página 1', async () => {
  const calls = { detalhes: [], empreendimentos: 0, pages: [] };
  const supabase = makeSupabaseWithTenants([
    { tenant_id: 'novo', last_sync_at: null },
  ]);
  const svc = createSantaAngelaSyncService({ supabase,
    apiClient: okClient([[{ id: 'p1', nome: 'A', celular: '1' }], [{ id: 'p2', nome: 'B', celular: '2' }]], { calls }),
    pLimitImpl: makeBoundedLimit() });
  const results = await svc.syncAllTenants('run-full');
  expect(results[0].success).toBe(true);
  expect(calls.pages).toEqual([1, 2]); // full: andou as duas páginas
});
