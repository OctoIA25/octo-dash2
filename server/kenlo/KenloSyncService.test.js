import { describe, it, expect, vi } from 'vitest';
import { createKenloSyncService } from './KenloSyncService.js';

const integration = { tenant_id: 't1' };

// Supabase fake: select existentes (.eq().in()) + upsert (.upsert().select()).
function fakeSupabase({ existing = [] } = {}) {
  const upserts = [];
  return {
    upserts,
    from() {
      return {
        select() {
          return { eq() { return { in() { return Promise.resolve({ data: existing.map((id) => ({ external_id: id })), error: null }); } }; } };
        },
        upsert(rows) { upserts.push(rows); return { select() { return Promise.resolve({ data: rows, error: null }); } }; },
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
  it('salva apenas leads novos e dispara webhook Lia para cada um', async () => {
    const leads = [
      { _id: 'novo', timestamp: '2026-06-25T10:00:00Z', client: { name: 'A', phone: '11900000000' }, idMediaOrigin: 8, interest: { reference: 'R' } },
      { _id: 'velho', timestamp: '2026-06-25T09:00:00Z', client: { name: 'B' }, idMediaOrigin: 8 },
    ];
    const supabase = fakeSupabase({ existing: ['velho'] });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const svc = createKenloSyncService({
      supabase, leadService: leadServiceStub(leads), brokerAssigner: brokerStub,
      processEnv: { KENLO_LIA_WEBHOOK_URL: 'https://webhook/lia' }, fetchImpl,
    });
    // syncMode LIVE: a Lia dispara (em BACKFILL o guard a suprime).
    const r = await svc.syncTenant(integration, { syncMode: 'LIVE' });
    expect(r.new).toBe(1);
    const saved = supabase.upserts.flat().map((x) => x.external_id);
    expect(saved).toContain('novo');
    expect(saved).not.toContain('velho');
    expect(fetchImpl).toHaveBeenCalledWith('https://webhook/lia', expect.objectContaining({ method: 'POST' }));
  });

  it('syncTenant faz upsert por página (streaming), não acumula tudo', async () => {
    const upsertCalls = [];
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
        upsert: (batch) => { upsertCalls.push(batch.length); return { select: () => Promise.resolve({ data: batch, error: null }) }; },
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

  it('idempotência: lead já existente não é reprocessado', async () => {
    const leads = [{ _id: 'x', timestamp: '2026-06-25T10:00:00Z', client: {}, idMediaOrigin: 8 }];
    const svc = createKenloSyncService({
      supabase: fakeSupabase({ existing: ['x'] }), leadService: leadServiceStub(leads), brokerAssigner: brokerStub,
      processEnv: {}, fetchImpl: vi.fn(),
    });
    const r = await svc.syncTenant(integration);
    expect(r.new).toBe(0);
  });
});
