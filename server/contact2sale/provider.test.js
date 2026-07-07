import { describe, it, expect, vi } from 'vitest';
import { createC2sProvider } from './provider.js';

const NOW = Date.parse('2026-07-06T12:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

const rawLead = (id, createdAt, name = 'A') => ({
  id,
  attributes: {
    customer: { name, phone: '11988887777' },
    lead_status: { alias: 'new' },
    created_at: createdAt,
    updated_at: createdAt,
    archive_details: { archived: false },
  },
  messages: [],
});

function fakeSupabase({ leadsCount = 7 } = {}) {
  const cursorUpdates = [];
  return {
    cursorUpdates,
    from(table) {
      if (table === 'kenlo_leads') {
        // count de leads_count: select('id', {count,head}).eq().eq()
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: leadsCount, error: null }) }) }) };
      }
      expect(table).toBe('tenant_contact2sale_config');
      return {
        update: (p) => ({ eq: () => { cursorUpdates.push(p); return Promise.resolve({ error: null }); } }),
      };
    },
  };
}

async function drain(gen) {
  const pages = [];
  for await (const p of gen) pages.push(p);
  return pages;
}

describe('createC2sProvider.resolveWindow', () => {
  const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: {}, processEnv: {}, now: () => NOW });

  it('1º ciclo do tenant (sem last_sync_at) → BACKFILL com suppressAutomations (import histórico silencioso)', () => {
    const w = provider.resolveWindow({ tenant_id: 't1', last_sync_at: null, last_full_sync_at: null, backfill_cursor: null });
    expect(w.syncMode).toBe('BACKFILL');
    expect(w.suppressAutomations).toBe(true);
    expect(w.startedAt).toBe(iso(NOW));
  });

  it('resync com backfill_cursor mas sem last_sync_at retoma o BACKFILL do cursor', () => {
    const w = provider.resolveWindow({ tenant_id: 't1', last_sync_at: null, last_full_sync_at: null, backfill_cursor: '2026-05-01T00:00:00Z' });
    expect(w.syncMode).toBe('BACKFILL');
    expect(w.backfillCursor).toBe('2026-05-01T00:00:00Z');
  });

  // REGRESSÃO (bug do atraso): com last_sync_at presente, o modo é LIVE MESMO
  // com last_full_sync_at null — o scheduler pega leads novos sozinho, sem esperar
  // o backfill histórico fechar. Antes, isto retornava BACKFILL e o lead novo só
  // entrava por resync manual.
  it('last_sync_at presente + last_full_sync_at null → LIVE (leads novos entram sozinhos, sem resync)', () => {
    const w = provider.resolveWindow({
      tenant_id: 't1',
      last_sync_at: '2026-07-06T11:50:00.000Z',
      last_full_sync_at: null,
      backfill_cursor: '2025-11-29T00:00:00Z', // histórico ainda não drenado — NÃO deve travar o LIVE
    });
    expect(w.syncMode).toBe('LIVE');
    expect(w.suppressAutomations).toBe(false);
    expect(w.updatedGte).toBe('2026-07-06T11:45:00.000Z');
  });

  it('com cursores → LIVE incremental com overlap de 5min (updated_gte)', () => {
    const w = provider.resolveWindow({
      tenant_id: 't1',
      last_sync_at: '2026-07-06T11:50:00.000Z',
      last_full_sync_at: '2026-07-05T00:00:00.000Z',
    });
    expect(w.syncMode).toBe('LIVE');
    expect(w.suppressAutomations).toBe(false);
    expect(w.updatedGte).toBe('2026-07-06T11:45:00.000Z'); // last_sync_at − 5min
  });
});

describe('createC2sProvider.fetchNormalizedPages — BACKFILL', () => {
  it('caminha por created_at DESC (mais recente 1º) com created_lt de retomada; cursor = min da página', async () => {
    const supabase = fakeSupabase();
    // Ordem decrescente: página 1 = os mais recentes; página 2 = mais antigos.
    const getLeads = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, items: [rawLead('l3', '2026-01-03T10:00:00Z'), rawLead('l2', '2026-01-02T10:00:00Z')], hasMore: true })
      .mockResolvedValueOnce({ ok: true, status: 200, items: [rawLead('l1', '2026-01-01T10:00:00Z')], hasMore: false });
    const provider = createC2sProvider({ supabase, apiClient: { getLeads }, processEnv: {}, now: () => NOW });

    // Retomada: já vimos até 2026-01-04 → busca criados ANTES disso (created_lt).
    const integration = { tenant_id: 't1', backfill_cursor: '2026-01-04T00:00:00Z', last_full_sync_at: null };
    const w = provider.resolveWindow(integration);
    const pages = await drain(provider.fetchNormalizedPages(integration, w));

    expect(pages).toHaveLength(2);
    expect(pages[0].rows.map((r) => r.external_id)).toEqual(['l3', 'l2']); // recentes primeiro
    expect(pages[1].rows.map((r) => r.external_id)).toEqual(['l1']);

    // created_lt FIXO (fronteira do início do ciclo) nas duas páginas; sort desc; page avança.
    expect(getLeads.mock.calls[0][1]).toMatchObject({ created_lt: '2026-01-04T00:00:00Z', sort: '-created_at', page: 1 });
    expect(getLeads.mock.calls[1][1]).toMatchObject({ created_lt: '2026-01-04T00:00:00Z', sort: '-created_at', page: 2 });

    // Cursor = MENOR created_at da página (fronteira já percorrida, desce no tempo).
    expect(pages[0].cursor).toBe('2026-01-02T10:00:00Z');
    expect(pages[1].cursor).toBe('2026-01-01T10:00:00Z');
    expect(supabase.cursorUpdates).toHaveLength(0); // quem persiste é o engine (commitPage)

    await provider.commitPage(integration, pages[0].cursor);
    expect(supabase.cursorUpdates).toEqual([{ backfill_cursor: '2026-01-02T10:00:00Z' }]);
  });

  it('primeira sync sem cursor começa do TOPO (sem created_lt, sort desc = base inteira do mais recente)', async () => {
    const getLeads = vi.fn().mockResolvedValue({ ok: true, status: 200, items: [], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const integration = { tenant_id: 't1', backfill_cursor: null, last_full_sync_at: null };
    await drain(provider.fetchNormalizedPages(integration, provider.resolveWindow(integration)));
    expect(getLeads.mock.calls[0][1]).not.toHaveProperty('created_lt'); // topo: sem fronteira
    expect(getLeads.mock.calls[0][1]).toMatchObject({ sort: '-created_at' });
  });

  it('página com erro → yield pageError e ABORTA o ciclo (cursor preservado para retomar)', async () => {
    const supabase = fakeSupabase();
    const getLeads = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, items: [rawLead('l1', '2026-01-01T10:00:00Z')], hasMore: true })
      .mockResolvedValueOnce({ ok: false, status: 503, items: [], hasMore: false });
    const provider = createC2sProvider({ supabase, apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const integration = { tenant_id: 't1', backfill_cursor: null, last_full_sync_at: null };
    const pages = await drain(provider.fetchNormalizedPages(integration, provider.resolveWindow(integration)));

    expect(pages).toHaveLength(2);
    expect(pages[1].pageError).toBe(true);
    expect(getLeads).toHaveBeenCalledTimes(2); // não pediu a página 3
    expect(pages[0].cursor).toBe('2026-01-01T10:00:00Z'); // página boa rendeu cursor
    expect(supabase.cursorUpdates).toHaveLength(0);       // provider nunca persiste sozinho
  });

  it('leads sem id são descartados (nunca viram linha com external_id vazio)', async () => {
    const semId = { attributes: { customer: { name: 'X' }, created_at: '2026-01-01T10:00:00Z' } };
    const getLeads = vi.fn().mockResolvedValue({ ok: true, status: 200, items: [semId, rawLead('l1', '2026-01-01T10:00:00Z')], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const integration = { tenant_id: 't1', backfill_cursor: null, last_full_sync_at: null };
    const pages = await drain(provider.fetchNormalizedPages(integration, provider.resolveWindow(integration)));
    expect(pages[0].rows.map((r) => r.external_id)).toEqual(['l1']);
    expect(pages[0].fetched).toBe(2); // contou o que veio da API
  });
});

describe('createC2sProvider.fetchNormalizedPages — LIVE', () => {
  const liveIntegration = { tenant_id: 't1', last_sync_at: '2026-07-06T11:50:00.000Z', last_full_sync_at: '2026-07-05T00:00:00Z' };

  it('usa updated_gte + sort=updated_at e pagina até total_pages', async () => {
    const getLeads = vi.fn().mockResolvedValue({ ok: true, status: 200, items: [rawLead('l9', '2026-07-06T11:58:00Z')], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(1);
    // Formato %FT%TZ (SEM milissegundos): a C2S rejeita ".000Z" com 403.
    expect(getLeads.mock.calls[0][1]).toMatchObject({ updated_gte: '2026-07-06T11:45:00Z', sort: 'updated_at', page: 1 });
  });

  it('multi-página avança o updated_gte (cursor real) e volta a page=1 — imune a deslocamento de página', async () => {
    // sort=updated_at é chave MUTÁVEL: paginar por offset pularia itens quando um
    // lead é atualizado no meio do walk. Avançar o gte por página é imune a isso.
    const getLeads = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, items: [rawLead('a', '2026-07-06T11:50:00.000Z')], hasMore: true })
      .mockResolvedValueOnce({ ok: true, status: 200, items: [rawLead('b', '2026-07-06T11:58:00.000Z')], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(2);
    expect(getLeads.mock.calls[0][1]).toMatchObject({ updated_gte: '2026-07-06T11:45:00Z', page: 1 });
    // gte avançou p/ o max updated_at da página (normalizado sem ms), page reset.
    expect(getLeads.mock.calls[1][1]).toMatchObject({ updated_gte: '2026-07-06T11:50:00Z', page: 1 });
  });

  it('cluster de updated_at idêntico ocupando a página inteira cai para page++ (não trava)', async () => {
    // gte não avançou (max == gte atual) → única saída é offset dentro do cluster.
    const cluster = [rawLead('a', '2026-07-06T11:45:00.000Z'), rawLead('b', '2026-07-06T11:45:00.000Z')];
    const getLeads = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, items: cluster, hasMore: true })
      .mockResolvedValueOnce({ ok: true, status: 200, items: [rawLead('c', '2026-07-06T11:45:00.000Z')], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(2);
    expect(getLeads.mock.calls[1][1]).toMatchObject({ updated_gte: '2026-07-06T11:45:00Z', page: 2 });
  });

  it('normaliza a data para %FT%TZ: remove ms E converte offset -03:00 da C2S para UTC (senão 403)', async () => {
    // A C2S devolve updated_at com offset (2026-07-06T08:58:00.000-03:00). Ao
    // avançar o cursor com esse valor, o próximo request PRECISA sair como UTC
    // sem ms — senão "invalid date or strptime format".
    const getLeads = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, items: [rawLead('a', '2026-07-06T08:58:00.000-03:00')], hasMore: true })
      .mockResolvedValueOnce({ ok: true, status: 200, items: [], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    await drain(provider.fetchNormalizedPages(liveIntegration, w));
    const sent = getLeads.mock.calls[1][1].updated_gte;
    // 08:58 -03:00 == 11:58 UTC, sem ms.
    expect(sent).toBe('2026-07-06T11:58:00Z');
    expect(sent).not.toMatch(/\.\d{3}Z$/);   // sem milissegundos
    expect(sent).not.toMatch(/[+-]\d{2}:\d{2}$/); // sem offset
  });
});

describe('createC2sProvider.buildCursorPatch (avança SÓ em ciclo sem erro)', () => {
  const integration = { tenant_id: 't1' };
  const provider = createC2sProvider({ supabase: fakeSupabase({ leadsCount: 7 }), apiClient: {}, processEnv: {}, now: () => NOW });
  const startedAt = iso(NOW);
  const finishedAt = iso(NOW + 60_000);

  it('LIVE ok sem novidade → last_sync_at = INÍCIO do ciclo (t0), nada mais (nem count)', async () => {
    const patch = await provider.buildCursorPatch({ integration, syncWindow: { syncMode: 'LIVE', startedAt }, syncMode: 'LIVE', stats: { errors: 0, new: 0 }, finishedAt });
    expect(patch).toEqual({ last_sync_at: startedAt });
  });

  it('LIVE com leads novos atualiza leads_count (card de status)', async () => {
    const patch = await provider.buildCursorPatch({ integration, syncWindow: { syncMode: 'LIVE', startedAt }, syncMode: 'LIVE', stats: { errors: 0, new: 3 }, finishedAt });
    expect(patch).toEqual({ last_sync_at: startedAt, leads_count: 7 });
  });

  it('BACKFILL completo → carimba full, zera backfill_cursor, ancora last_sync_at no início do walk e conta', async () => {
    const patch = await provider.buildCursorPatch({ integration, syncWindow: { syncMode: 'BACKFILL', startedAt }, syncMode: 'BACKFILL', stats: { errors: 0, new: 0 }, finishedAt });
    expect(patch).toEqual({ last_sync_at: startedAt, last_full_sync_at: finishedAt, backfill_cursor: null, leads_count: 7 });
  });

  it('ciclo com erro → {} (cursor congelado; releitura idempotente cobre)', async () => {
    const patch = await provider.buildCursorPatch({ integration, syncWindow: { syncMode: 'LIVE', startedAt }, syncMode: 'LIVE', stats: { errors: 2 }, finishedAt });
    expect(patch).toEqual({});
  });
});

describe('contrato com o engine', () => {
  it('expõe name/configTable/fingerprint/mergeUpdate/commitPage', () => {
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: {}, processEnv: {}, now: () => NOW });
    expect(provider.name).toBe('contact2sale');
    expect(provider.configTable).toBe('tenant_contact2sale_config');
    expect(typeof provider.fingerprint).toBe('function');
    expect(typeof provider.mergeUpdate).toBe('function');
    expect(typeof provider.commitPage).toBe('function');
  });
});
