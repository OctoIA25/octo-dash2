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
    expect(w.createdGteFloor).toBe('2026-07-06T11:45:00.000Z');
  });

  it('com cursores → LIVE com piso de criação = last_sync_at − 5min (overlap)', () => {
    const w = provider.resolveWindow({
      tenant_id: 't1',
      last_sync_at: '2026-07-06T11:50:00.000Z',
      last_full_sync_at: '2026-07-05T00:00:00.000Z',
    });
    expect(w.syncMode).toBe('LIVE');
    expect(w.suppressAutomations).toBe(false);
    expect(w.createdGteFloor).toBe('2026-07-06T11:45:00.000Z'); // last_sync_at − 5min
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

    // FASE 2 (destrave): backfillPages já viu o topo (maior created = 2026-01-03) e
    // gravou em integration.maxCreatedSeen. commitPage persiste isso como last_sync_at
    // JUNTO com o backfill_cursor → no próximo ciclo resolveWindow escolhe LIVE, sem
    // esperar o walk histórico (que pode nunca fechar numa base grande) terminar.
    expect(integration.maxCreatedSeen).toBe('2026-01-03T10:00:00Z');
    await provider.commitPage(integration, pages[0].cursor);
    expect(supabase.cursorUpdates).toEqual([{ backfill_cursor: '2026-01-02T10:00:00Z', last_sync_at: '2026-01-03T10:00:00Z' }]);

    // Idempotente: com last_sync_at já preenchido, commitPage NÃO regrava o last_sync_at
    // (o LIVE passa a ser dono dele) — só continua avançando o backfill_cursor.
    const integration2 = { tenant_id: 't1', last_sync_at: '2026-01-03T10:00:00Z', maxCreatedSeen: '2026-01-03T10:00:00Z' };
    await provider.commitPage(integration2, '2026-01-01T10:00:00Z');
    expect(supabase.cursorUpdates[1]).toEqual({ backfill_cursor: '2026-01-01T10:00:00Z' });
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

  it('FASE 2: backfill INTERROMPIDO no meio (base grande) já destrava p/ LIVE — last_sync_at gravado no commitPage da 1ª página', async () => {
    // Cenário real (Japi 68k leads): o walk NUNCA fecha (deploy/restart no meio),
    // então buildCursorPatch nunca roda. Antes, last_sync_at ficava null p/ sempre
    // → resolveWindow escolhia BACKFILL eternamente → leads novos parados.
    // Agora: a 1ª página processa o topo, backfillPages grava integration.maxCreatedSeen,
    // e o commitPage (por página, sem erro) persiste last_sync_at → próximo ciclo vira LIVE.
    const supabase = fakeSupabase();
    const getLeads = vi.fn().mockResolvedValue({
      ok: true, status: 200, hasMore: true, // hasMore=true p/ sempre: simula base "infinita"
      items: [rawLead('hoje', '2026-07-06T11:00:00Z'), rawLead('ontem', '2026-07-05T09:00:00Z')],
    });
    const provider = createC2sProvider({ supabase, apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const integration = { tenant_id: 't1', backfill_cursor: null, last_sync_at: null, last_full_sync_at: null };
    const gen = provider.fetchNormalizedPages(integration, provider.resolveWindow(integration));
    const first = await gen.next(); // processa só a 1ª página (walk seria interrompido aqui)

    // O topo foi visto e memorizado; o engine chama commitPage com o cursor da página.
    expect(integration.maxCreatedSeen).toBe('2026-07-06T11:00:00Z');
    await provider.commitPage(integration, first.value.cursor);
    // last_sync_at gravado JUNTO com o backfill_cursor → tenant destravado.
    expect(supabase.cursorUpdates[0]).toEqual({
      backfill_cursor: '2026-07-05T09:00:00Z',
      last_sync_at: '2026-07-06T11:00:00Z',
    });

    // Próximo ciclo: com last_sync_at preenchido, resolveWindow escolhe LIVE.
    const next = provider.resolveWindow({ ...integration, last_sync_at: '2026-07-06T11:00:00Z' });
    expect(next.syncMode).toBe('LIVE');
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
  // last_sync_at = maior created_at já processado; piso = last_sync_at − 5min = 11:45.
  const liveIntegration = { tenant_id: 't1', last_sync_at: '2026-07-06T11:50:00.000Z', last_full_sync_at: '2026-07-05T00:00:00Z' };

  it('desce por created_at DESC com created_lt (o ÚNICO filtro que a C2S respeita), NUNCA updated_gte', async () => {
    const getLeads = vi.fn().mockResolvedValue({ ok: true, status: 200, items: [rawLead('l9', '2026-07-06T11:58:00Z')], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(1);
    expect(getLeads.mock.calls[0][1]).toMatchObject({ sort: '-created_at', page: 1 });
    // 1ª página do topo NÃO leva created_lt (só a retomada dentro do ciclo leva).
    expect(getLeads.mock.calls[0][1]).not.toHaveProperty('created_lt');
    // GARANTIA anti-regressão: o filtro morto nunca mais é enviado.
    expect(getLeads.mock.calls[0][1]).not.toHaveProperty('updated_gte');
  });

  it('encontra lead novo: created acima do piso vira row e o cursor avança para o maior created', async () => {
    // Lead criado 11:58 (> piso 11:45) → entra. Página incompleta encerra o ciclo.
    const getLeads = vi.fn().mockResolvedValue({ ok: true, status: 200, items: [rawLead('novo', '2026-07-06T11:58:00Z')], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages[0].rows.map((r) => r.external_id)).toEqual(['novo']);
    expect(pages[0].fetched).toBe(1);
    expect(w.maxCreatedSeen).toBe('2026-07-06T11:58:00Z'); // cursor = maior created processado
  });

  it('sem leads novos (só histórico abaixo do piso): descarta as rows e NÃO avança o cursor', async () => {
    // Todos criados 11:40 (< piso 11:45): nada novo. keep=0 → nenhuma row, encerra.
    const getLeads = vi.fn().mockResolvedValue({ ok: true, status: 200, items: [rawLead('velho', '2026-07-06T11:40:00Z')], hasMore: true });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(1);
    expect(pages[0].rows).toEqual([]);          // nada acima do piso
    expect(pages[0].fetched).toBe(1);           // mas contou o que a API mandou
    expect(w.maxCreatedSeen).toBeUndefined();   // cursor NÃO avança (mantém last_sync_at anterior)
    expect(getLeads).toHaveBeenCalledTimes(1);  // parou ao cruzar o piso (não pediu página 2)
  });

  it('atravessa a fronteira do cursor: importa os novos e PARA na página que cruza o piso', async () => {
    // Página 1 (topo): 2 novos (11:58, 11:50) + 1 do piso pra baixo (11:40) → cruza → para.
    const getLeads = vi.fn().mockResolvedValue({
      ok: true, status: 200, hasMore: true,
      items: [rawLead('n2', '2026-07-06T11:58:00Z'), rawLead('n1', '2026-07-06T11:50:00Z'), rawLead('velho', '2026-07-06T11:40:00Z')],
    });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(1);
    expect(pages[0].rows.map((r) => r.external_id)).toEqual(['n2', 'n1']); // só os acima do piso
    expect(w.maxCreatedSeen).toBe('2026-07-06T11:58:00Z');
    expect(getLeads).toHaveBeenCalledTimes(1); // cruzou o piso na pág 1 → não paginou
  });

  it('multi-página: retomada usa created_lt = min(created) da página cheia (não perde nada no overlap)', async () => {
    // Página 1 cheia (só novos, não cruzou o piso) → continua com created_lt do min da pág.
    // Página 2 traz o resto e cruza o piso → encerra.
    const getLeads = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, hasMore: true,
        items: [rawLead('n3', '2026-07-06T11:59:00Z'), rawLead('n2', '2026-07-06T11:52:00Z')] })
      .mockResolvedValueOnce({ ok: true, status: 200, hasMore: true,
        items: [rawLead('n1', '2026-07-06T11:48:00Z'), rawLead('velho', '2026-07-06T11:40:00Z')] });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(2);
    expect(pages[0].rows.map((r) => r.external_id)).toEqual(['n3', 'n2']);
    expect(pages[1].rows.map((r) => r.external_id)).toEqual(['n1']); // 'velho' abaixo do piso, cortado
    // 1ª chamada sem created_lt; 2ª com created_lt = min(created) da pág 1 (11:52), formato %FT%TZ.
    expect(getLeads.mock.calls[0][1]).not.toHaveProperty('created_lt');
    expect(getLeads.mock.calls[1][1]).toMatchObject({ created_lt: '2026-07-06T11:52:00Z', sort: '-created_at', page: 1 });
    expect(w.maxCreatedSeen).toBe('2026-07-06T11:59:00Z'); // maior de todos os processados
  });

  it('página incompleta encerra o ciclo mesmo sem cruzar o piso (fim do stream)', async () => {
    const getLeads = vi.fn().mockResolvedValue({ ok: true, status: 200, hasMore: false, items: [rawLead('n1', '2026-07-06T11:58:00Z')] });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toHaveLength(1);
    expect(getLeads).toHaveBeenCalledTimes(1); // hasMore=false → não pediu página 2
  });

  it('normaliza created_lt para %FT%TZ: remove ms E converte offset -03:00 da C2S para UTC (senão 403)', async () => {
    // A C2S devolve created_at com offset. O created_lt de retomada PRECISA sair
    // como UTC sem ms — senão "invalid date or strptime format".
    const getLeads = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, hasMore: true,
        items: [rawLead('a', '2026-07-06T09:58:00.000-03:00'), rawLead('b', '2026-07-06T09:50:00.000-03:00')] }) // 12:58 e 12:50 UTC, ambos > piso
      .mockResolvedValueOnce({ ok: true, status: 200, hasMore: false, items: [] });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    await drain(provider.fetchNormalizedPages(liveIntegration, w));
    const sent = getLeads.mock.calls[1][1].created_lt;
    // min da pág 1 = 09:50 -03:00 == 12:50 UTC, sem ms.
    expect(sent).toBe('2026-07-06T12:50:00Z');
    expect(sent).not.toMatch(/\.\d{3}Z$/);        // sem milissegundos
    expect(sent).not.toMatch(/[+-]\d{2}:\d{2}$/); // sem offset
  });

  it('página com erro no LIVE → yield pageError e ABORTA (cursor congela no buildCursorPatch)', async () => {
    const getLeads = vi.fn().mockResolvedValue({ ok: false, status: 503, items: [], hasMore: false });
    const provider = createC2sProvider({ supabase: fakeSupabase(), apiClient: { getLeads }, processEnv: {}, now: () => NOW });
    const w = provider.resolveWindow(liveIntegration);
    const pages = await drain(provider.fetchNormalizedPages(liveIntegration, w));
    expect(pages).toEqual([{ pageError: true }]);
    expect(w.maxCreatedSeen).toBeUndefined();
  });
});

describe('createC2sProvider.buildCursorPatch (avança SÓ em ciclo sem erro)', () => {
  const integration = { tenant_id: 't1', last_sync_at: '2026-07-06T11:50:00.000Z' };
  const provider = createC2sProvider({ supabase: fakeSupabase({ leadsCount: 7 }), apiClient: {}, processEnv: {}, now: () => NOW });
  const startedAt = iso(NOW);
  const finishedAt = iso(NOW + 60_000);

  it('LIVE sem novidade (maxCreatedSeen ausente) → MANTÉM last_sync_at anterior (não pula p/ o relógio)', async () => {
    const patch = await provider.buildCursorPatch({ integration, syncWindow: { syncMode: 'LIVE', startedAt }, syncMode: 'LIVE', stats: { errors: 0, new: 0 }, finishedAt });
    expect(patch).toEqual({ last_sync_at: '2026-07-06T11:50:00.000Z' });
  });

  it('LIVE com leads novos → last_sync_at = maior created processado + atualiza leads_count', async () => {
    const patch = await provider.buildCursorPatch({
      integration,
      syncWindow: { syncMode: 'LIVE', startedAt, maxCreatedSeen: '2026-07-06T11:58:00Z' },
      syncMode: 'LIVE', stats: { errors: 0, new: 3 }, finishedAt,
    });
    expect(patch).toEqual({ last_sync_at: '2026-07-06T11:58:00Z', leads_count: 7 });
  });

  it('BACKFILL completo → carimba full, zera backfill_cursor, ancora last_sync_at no TOPO visto (maxCreatedSeen) e conta', async () => {
    // backfillPages gravou o maior created visto em integration.maxCreatedSeen.
    const integ = { tenant_id: 't1', maxCreatedSeen: '2026-07-06T11:59:00Z' };
    const patch = await provider.buildCursorPatch({ integration: integ, syncWindow: { syncMode: 'BACKFILL', startedAt }, syncMode: 'BACKFILL', stats: { errors: 0, new: 0 }, finishedAt });
    expect(patch).toEqual({ last_sync_at: '2026-07-06T11:59:00Z', last_full_sync_at: finishedAt, backfill_cursor: null, leads_count: 7 });
  });

  it('BACKFILL sem nada processado (maxCreatedSeen ausente) → mantém last_sync_at anterior; não regride', async () => {
    const patch = await provider.buildCursorPatch({ integration, syncWindow: { syncMode: 'BACKFILL', startedAt }, syncMode: 'BACKFILL', stats: { errors: 0, new: 0 }, finishedAt });
    expect(patch).toMatchObject({ last_sync_at: '2026-07-06T11:50:00.000Z', last_full_sync_at: finishedAt, backfill_cursor: null });
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
