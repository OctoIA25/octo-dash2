import { describe, it, expect, vi } from 'vitest';
import { createKenloSyncService } from './KenloSyncService.js';

const integration = { tenant_id: 't1' };

// Supabase fake: select existentes (.eq().in()) + upsert (.upsert().select()) + update (sync_state).
// `existing` aceita string (só external_id) OU objeto (linha completa do banco, p/ testar merge).
function fakeSupabase({ existing = [] } = {}) {
  const upserts = [];
  const syncStates = [];
  const rows = existing.map((e) => (typeof e === 'string' ? { external_id: e } : e));
  return {
    upserts,
    syncStates,
    from() {
      return {
        select() {
          return { eq() { return { in() { return Promise.resolve({ data: rows, error: null }); } }; } };
        },
        upsert(batch) { upserts.push(batch); return { select() { return Promise.resolve({ data: batch, error: null }); } }; },
        update(payload) { if (payload.sync_state) syncStates.push(JSON.parse(payload.sync_state)); return { eq() { return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

// Stub de página única: entrega todos os leads na página 1 do portal 8, isLast=true.
const leadServiceStub = (leads) => ({
  fetchPage: vi.fn().mockImplementation(async (_i, { mediaOrigin, page }) =>
    ({ status: 200, leads: mediaOrigin === 8 && page === 1 ? leads : [], isLast: true })),
  fetchDetails: vi.fn().mockImplementation(async (_i, ls) => ls),
});
const brokerStub = { assign: vi.fn().mockImplementation(async (_t, rows) => rows) };

describe('KenloSyncService.syncTenant', () => {
  it('leads novos são salvos e existente alterado é atualizado; Lia NÃO é mais acionada inline', async () => {
    const leads = [
      { _id: 'novo', timestamp: '2026-06-25T10:00:00Z', client: { name: 'A', phone: '11900000000' }, idMediaOrigin: 8, interest: { reference: 'R' } },
      { _id: 'velho', timestamp: '2026-06-25T09:00:00Z', client: { name: 'B Atualizado' }, idMediaOrigin: 8 },
    ];
    // 'velho' já existe com fingerprint defasado → o merge gera patch e ele é re-upsertado.
    const supabase = fakeSupabase({ existing: [{ id: 'row-velho', external_id: 'velho', stage: 'qualified', attended_by_name: 'X', attended_by_id: 'u1', client_name: 'B', kenlo_fingerprint: 'defasado' }] });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const svc = createKenloSyncService({
      supabase, leadService: leadServiceStub(leads), brokerAssigner: brokerStub,
      processEnv: {}, fetchImpl,
    });
    const r = await svc.syncTenant(integration, { syncMode: 'LIVE' });
    expect(r.new).toBe(1);                                  // só 'novo' conta como novo
    const saved = supabase.upserts.flat().map((x) => x.external_id);
    expect(saved).toContain('novo');
    expect(saved).toContain('velho');                       // existente alterado É atualizado agora
    // fireLia foi removido: o disparo da Lia agora é via outbox (trigger DB),
    // não mais inline no sync. O sync NÃO deve mais postar para a Lia.
    expect(fetchImpl).not.toHaveBeenCalledWith('https://webhook/lia', expect.anything());
  });

  it('lead existente ALTERADO no Kenlo é atualizado (stage do CRM preservado, campos Kenlo atualizados)', async () => {
    const leads = [
      { _id: 'joao', timestamp: '2026-06-25T10:00:00Z', client: { name: 'João', ddd: '11', phone: '988887777', email: 'j@x.com' }, idMediaOrigin: 8, status: 2, attendedBy: { name: 'Carlos' } },
    ];
    // CRM já tem o João: corretor moveu para 'qualified' e atribuiu corretor manual.
    const supabase = fakeSupabase({ existing: [{ id: 'row-joao', external_id: 'joao', stage: 'qualified', attended_by_name: 'Ana Manual', attended_by_id: 'u-ana', client_name: 'João', client_email: '', kenlo_fingerprint: 'antigo' }] });
    const svc = createKenloSyncService({ supabase, leadService: leadServiceStub(leads), brokerAssigner: brokerStub, processEnv: {}, fetchImpl: vi.fn() });
    const r = await svc.syncTenant(integration, { syncMode: 'LIVE' });
    expect(r.new).toBe(0);                                  // não é novo
    const merged = supabase.upserts.flat().find((x) => x.external_id === 'joao');
    expect(merged).toBeTruthy();                            // foi atualizado
    expect(merged.client_email).toBe('j@x.com');            // campo Kenlo atualizado
    // CRM vence por OMISSÃO: a row não inclui stage/attended_by, então o upsert não
    // toca essas colunas — o valor do corretor no banco permanece intacto.
    expect(merged).not.toHaveProperty('stage');
    expect(merged).not.toHaveProperty('attended_by_name');
  });

  it('row de update NÃO carrega stage/attended_by intocados (evita race read-modify-write do kanban)', async () => {
    // Só um campo Kenlo muda (email). A row enviada ao upsert deve conter apenas
    // chaves de conflito + campos Kenlo + fingerprint — NUNCA stage nem attended_by_*
    // lidos no SELECT, senão um upsert reverteria uma mudança simultânea do corretor.
    const leads = [
      { _id: 'joao', timestamp: '2026-06-25T10:00:00Z', client: { name: 'João', email: 'novo@x.com' }, idMediaOrigin: 8, status: 2 },
    ];
    const supabase = fakeSupabase({ existing: [{ id: 'row-joao', external_id: 'joao', stage: 'qualified', attended_by_name: 'Ana Manual', attended_by_id: 'u-ana', client_name: 'João', client_email: 'velho@x.com', kenlo_fingerprint: 'antigo' }] });
    const svc = createKenloSyncService({ supabase, leadService: leadServiceStub(leads), brokerAssigner: brokerStub, processEnv: {}, fetchImpl: vi.fn() });
    await svc.syncTenant(integration, { syncMode: 'LIVE' });
    const row = supabase.upserts.flat().find((x) => x.external_id === 'joao');
    expect(row.client_email).toBe('novo@x.com');     // campo Kenlo atualizado
    expect(row).toHaveProperty('tenant_id');          // chave de conflito presente
    expect(row).not.toHaveProperty('stage');          // stage fica de fora da row → upsert não o toca
    expect(row).not.toHaveProperty('attended_by_name');
    expect(row).not.toHaveProperty('attended_by_id');
  });

  it('lead existente SEM alteração no Kenlo (hash igual) NÃO gera UPDATE', async () => {
    const raw = { _id: 'estavel', timestamp: '2026-06-25T10:00:00Z', client: { name: 'Z', ddd: '11', phone: '988887777' }, idMediaOrigin: 8, status: 1 };
    // Pré-computa o fingerprint que o normalizeLead produzirá para este payload.
    const { normalizeLead, kenloFingerprint } = await import('./leadNormalizer.js');
    const fp = kenloFingerprint(normalizeLead(raw, 't1'));
    const supabase = fakeSupabase({ existing: [{ id: 'row-z', external_id: 'estavel', stage: 'new', attended_by_name: null, attended_by_id: null, kenlo_fingerprint: fp }] });
    const svc = createKenloSyncService({ supabase, leadService: leadServiceStub([raw]), brokerAssigner: brokerStub, processEnv: {}, fetchImpl: vi.fn() });
    const r = await svc.syncTenant(integration, { syncMode: 'LIVE' });
    expect(r.new).toBe(0);
    expect(supabase.upserts.flat()).toHaveLength(0);        // nenhuma escrita: hash idêntico
  });

  it('BACKFILL NÃO dispara webhook Lia (não spammar a IA no histórico)', async () => {
    const leads = [
      { _id: 'novo', timestamp: '2026-06-25T10:00:00Z', client: { name: 'A', phone: '11900000000' }, idMediaOrigin: 8, interest: { reference: 'R' } },
    ];
    const supabase = fakeSupabase({ existing: [] });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const svc = createKenloSyncService({
      supabase, leadService: leadServiceStub(leads), brokerAssigner: brokerStub,
      processEnv: {}, fetchImpl,
    });
    const r = await svc.syncTenant(integration, { syncMode: 'BACKFILL', startDate: '2026-04-27' });
    expect(r.saved).toBe(1);                 // grava o lead no banco
    expect(fetchImpl).not.toHaveBeenCalled(); // não aciona nenhum webhook inline
  });

  it('syncTenant faz upsert por página (streaming), não acumula tudo', async () => {
    const upsertCalls = [];
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
        upsert: (batch) => { upsertCalls.push(batch.length); return { select: () => Promise.resolve({ data: batch, error: null }) }; },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    };
    const leadService = {
      // página 1 cheia (2), página 2 incompleta (1) → 1 só portal de teste
      fetchPage: vi.fn()
        .mockResolvedValueOnce({ status: 200, leads: [{ _id: 'a' }, { _id: 'b' }], isLast: false })
        .mockResolvedValueOnce({ status: 200, leads: [{ _id: 'c' }], isLast: true })
        .mockResolvedValue({ status: 200, leads: [], isLast: true }), // demais portais vazios
      fetchDetails: vi.fn(async (_i, leads) => leads),
    };
    const brokerAssigner = { assign: vi.fn(async (_t, rows) => rows) };
    const svc = createKenloSyncService({ supabase, leadService, brokerAssigner, processEnv: { KENLO_PER_PAGE: '2' } });
    const stats = await svc.syncTenant({ tenant_id: 't1' }, { syncMode: 'BACKFILL', startDate: '2026-04-27' });
    // upsert chamado DUAS vezes no portal 8 (uma por página), não uma vez com tudo
    expect(upsertCalls.length).toBeGreaterThanOrEqual(2);
    expect(stats.saved).toBe(3);
  });

  it('filtra leads de teste', async () => {
    const leads = [{ _id: '67571a368b8373fff6d92ebc', client: {}, idMediaOrigin: 8 }];
    const svc = createKenloSyncService({
      supabase: fakeSupabase({ existing: [] }), leadService: leadServiceStub(leads), brokerAssigner: brokerStub,
      processEnv: {}, fetchImpl: vi.fn(),
    });
    const r = await svc.syncTenant(integration);
    expect(r.skippedTest).toBe(1);
    expect(r.saved).toBe(0);
  });

  it('idempotência: lead já existente não conta como novo (r.new=0)', async () => {
    const leads = [{ _id: 'x', timestamp: '2026-06-25T10:00:00Z', client: {}, idMediaOrigin: 8 }];
    const svc = createKenloSyncService({
      supabase: fakeSupabase({ existing: ['x'] }), leadService: leadServiceStub(leads), brokerAssigner: brokerStub,
      processEnv: {}, fetchImpl: vi.fn(),
    });
    const r = await svc.syncTenant(integration);
    expect(r.new).toBe(0);
  });
});

describe('KenloSyncService.syncAllTenants', () => {
  it('syncAllTenants grava last_sync_at após o sync (end-to-end, portais vazios)', async () => {
    const updates = [];
    const branchingSupabase = {
      from: (table) => table === 'kenlo_integrations'
        ? {
            select: () => ({ eq: () => Promise.resolve({ data: [{ tenant_id: 't1', last_sync_at: null }], error: null }) }),
            update: (payload) => ({ eq: () => { updates.push(payload); return Promise.resolve({ error: null }); } }),
          }
        : { // kenlo_leads
            select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
            upsert: (b) => ({ select: () => Promise.resolve({ data: b, error: null }) }),
          },
    };
    const leadService = { fetchPage: vi.fn().mockResolvedValue({ status: 200, leads: [], isLast: true }), fetchDetails: vi.fn() };
    const svc = createKenloSyncService({ supabase: branchingSupabase, leadService, brokerAssigner: { assign: async (_t, r) => r }, processEnv: {}, now: () => Date.parse('2026-06-26T12:00:00Z') });
    await svc.syncAllTenants();
    expect(updates.some((u) => u.last_sync_at)).toBe(true);
  });

  it('reconciliação: tenant LIVE com last_full_sync_at vencido roda BACKFILL', async () => {
    const calls = [];
    const branchingSupabase = {
      from: (table) => table === 'kenlo_integrations'
        ? {
            select: () => ({ eq: () => Promise.resolve({ data: [{
              tenant_id: 't1',
              last_sync_at: '2026-06-26T11:00:00Z',          // já LIVE
              last_full_sync_at: '2026-06-26T09:00:00Z',     // 3h atrás (> TTL 1h)
            }], error: null }) }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        : { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
            upsert: (b) => ({ select: () => Promise.resolve({ data: b, error: null }) }) },
    };
    const leadService = {
      fetchPage: vi.fn(async (_i, { startDate }) => { calls.push(startDate); return { status: 200, leads: [], isLast: true }; }),
      fetchDetails: vi.fn(),
    };
    const svc = createKenloSyncService({ supabase: branchingSupabase, leadService, brokerAssigner: { assign: async (_t, r) => r }, processEnv: { KENLO_FULL_SYNC_TTL_MS: '3600000' }, now: () => Date.parse('2026-06-26T12:00:00Z') });
    await svc.syncAllTenants();
    // startDate da reconciliação = janela histórica (60d), não o cursor de 5min
    expect(calls[0]).toBe('2026-04-27');
  });

  it('cursor é PISO: avança last_sync_at mesmo com falha transitória de página', async () => {
    // Antes este teste travava o cursor em errors>0. Provou-se incorreto: um único
    // hiccup de rede (status 0) em centenas de páginas paralisava o sync p/ sempre.
    // Cursor é piso; a reconciliação BACKFILL periódica cobre gaps transitórios.
    const updates = [];
    const branchingSupabase = {
      from: (table) => table === 'kenlo_integrations'
        ? {
            select: () => ({ eq: () => Promise.resolve({ data: [{ tenant_id: 't1', last_sync_at: '2026-06-26T11:00:00Z', last_full_sync_at: '2026-06-26T11:30:00Z' }], error: null }) }),
            update: (payload) => ({ eq: () => { updates.push(payload); return Promise.resolve({ error: null }); } }),
          }
        : { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
            upsert: (b) => ({ select: () => Promise.resolve({ data: b, error: null }) }) },
    };
    const leadService = {
      fetchPage: vi.fn().mockResolvedValue({ status: 0, leads: [], isLast: true }), // erro transitório
      fetchDetails: vi.fn(),
    };
    const svc = createKenloSyncService({ supabase: branchingSupabase, leadService, brokerAssigner: { assign: async (_t, r) => r }, processEnv: { KENLO_FULL_SYNC_TTL_MS: '3600000' }, now: () => Date.parse('2026-06-26T12:00:00Z') });
    await svc.syncAllTenants();
    expect(updates.some((u) => u.last_sync_at)).toBe(true); // cursor avança apesar do erro
  });

  it('persiste sync_state: running no início, done/contadores no fim', async () => {
    const states = [];
    const branchingSupabase = {
      from: (table) => table === 'kenlo_integrations'
        ? {
            select: () => ({ eq: () => Promise.resolve({ data: [{ tenant_id: 't1', last_sync_at: null }], error: null }) }),
            update: (payload) => ({ eq: () => { if (payload.sync_state) states.push(JSON.parse(payload.sync_state)); return Promise.resolve({ error: null }); } }),
          }
        : { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
            upsert: (b) => ({ select: () => Promise.resolve({ data: b, error: null }) }) },
    };
    const leadService = { fetchPage: vi.fn().mockResolvedValue({ status: 200, leads: [], isLast: true }), fetchDetails: vi.fn() };
    const svc = createKenloSyncService({ supabase: branchingSupabase, leadService, brokerAssigner: { assign: async (_t, r) => r }, processEnv: {}, now: () => Date.parse('2026-06-26T12:00:00Z') });
    await svc.syncAllTenants();
    expect(states[0].status).toBe('running');          // primeiro estado: rodando
    expect(states[states.length - 1].status).toBe('done'); // último: concluído
    expect(states[states.length - 1]).toHaveProperty('saved');
    expect(states[states.length - 1]).toHaveProperty('finished_at');
  });
});
