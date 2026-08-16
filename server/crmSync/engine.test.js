/**
 * Testes do CONTRATO engine×provider que nenhum provider específico cobre:
 * a confirmação de progresso durável (commitPage) só pode acontecer quando a
 * página foi persistida sem erro. Regressão aqui = leads perdidos em backfill.
 * O comportamento fim-a-fim do engine é coberto pela suíte do Kenlo (provider
 * real) — aqui só o que é do contrato.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCrmSyncEngine } from './engine.js';

// O ambiente de teste deste projeto é jsdom (vite.config.ts), que substitui o
// URL global por uma implementação própria: `new URL(rel, import.meta.url)`
// resolve contra o location fake do jsdom (http://localhost:.../) em vez do
// file:// real, e o readFileSync rejeita o resultado. Mesmo desvio de
// leadClassificationTriggers.test.js: sair pelo fileURLToPath (Node, não jsdom).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function stubProvider({ pages, commitPage }) {
  return {
    name: 'stub',
    configTable: 'stub_config',
    resolveWindow: () => ({ syncMode: 'BACKFILL' }),
    async *fetchNormalizedPages() { for (const p of pages) yield p; },
    fingerprint: () => 'fp',
    mergeUpdate: () => null,
    buildCursorPatch: () => ({}),
    ...(commitPage && { commitPage }),
  };
}

function supabaseWith({ upsertError = null, updates = [] } = {}) {
  return {
    from() {
      return {
        update: (payload) => ({ eq: () => { updates.push(payload); return Promise.resolve({ error: null }); } }),
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
        upsert: (b) => ({
          select: () => Promise.resolve(upsertError ? { data: null, error: { message: upsertError } } : { data: b, error: null }),
        }),
      };
    },
  };
}

const page = (cursor, rows = [{ tenant_id: 't1', external_id: 'x1' }]) => ({ rows, fetched: rows.length, ...(cursor && { cursor }) });

describe('crmSync engine — contrato commitPage', () => {
  it('página persistida sem erro confirma o cursor via commitPage', async () => {
    const commitPage = vi.fn();
    const engine = createCrmSyncEngine({
      supabase: supabaseWith(), provider: stubProvider({ pages: [page('c1'), page('c2')], commitPage }),
    });
    await engine.syncTenant({ tenant_id: 't1' }, { syncMode: 'BACKFILL' });
    expect(commitPage.mock.calls.map((c) => c[1])).toEqual(['c1', 'c2']);
  });

  it('upsert com erro NÃO confirma o cursor da página (leads não podem sumir do backfill)', async () => {
    const commitPage = vi.fn();
    const engine = createCrmSyncEngine({
      supabase: supabaseWith({ upsertError: 'boom' }), provider: stubProvider({ pages: [page('c1')], commitPage }),
    });
    const stats = await engine.syncTenant({ tenant_id: 't1' }, { syncMode: 'BACKFILL' });
    expect(stats.errors).toBe(1);
    expect(commitPage).not.toHaveBeenCalled();
  });

  it('página vazia com cursor ainda confirma (fatia sem leads novos avança a retomada)', async () => {
    const commitPage = vi.fn();
    const engine = createCrmSyncEngine({
      supabase: supabaseWith(), provider: stubProvider({ pages: [page('c1', [])], commitPage }),
    });
    await engine.syncTenant({ tenant_id: 't1' }, { syncMode: 'BACKFILL' });
    expect(commitPage).toHaveBeenCalledWith({ tenant_id: 't1' }, 'c1');
  });

  it('grava heartbeat inicial e também em página vazia', async () => {
    const updates = [];
    const nowValues = [
      Date.parse('2026-07-06T10:00:00.000Z'),
      Date.parse('2026-07-06T10:01:00.000Z'),
    ];
    const now = vi.fn(() => nowValues.shift() ?? Date.parse('2026-07-06T10:02:00.000Z'));
    const engine = createCrmSyncEngine({
      supabase: supabaseWith({ updates }),
      provider: stubProvider({ pages: [page(null, [])] }),
      now,
    });
    await engine.syncTenant({ tenant_id: 't1' }, { syncMode: 'BACKFILL' });
    const states = updates.map((u) => u.sync_state && JSON.parse(u.sync_state)).filter(Boolean);
    expect(states[0]).toMatchObject({ status: 'running', started_at: '2026-07-06T10:00:00.000Z', heartbeat_at: '2026-07-06T10:00:00.000Z' });
    expect(states[1]).toMatchObject({ status: 'running', heartbeat_at: '2026-07-06T10:01:00.000Z' });
  });

  it('provider sem commitPage e páginas sem cursor seguem funcionando (Kenlo)', async () => {
    const engine = createCrmSyncEngine({
      supabase: supabaseWith(), provider: stubProvider({ pages: [page(null)] }),
    });
    const stats = await engine.syncTenant({ tenant_id: 't1' }, { syncMode: 'LIVE' });
    expect(stats.saved).toBe(1);
  });
});

describe('classificação é coluna LOCAL — o sync não pode encostar', () => {
  it('a linha de UPDATE é só chave de conflito + patch do provider', () => {
    const src = readFileSync(path.join(__dirname, './engine.js'), 'utf8');
    // Se isto mudar para espalhar `prev` ou `row`, classification (e temperature,
    // e archived_at) passam a ser reescritas a cada sync.
    expect(src).toMatch(/updates\.push\(\{ tenant_id: tenantId, external_id: prev\.external_id, \.\.\.patch \}\)/);
    expect(src).not.toMatch(/updates\.push\(\{[^}]*\.\.\.prev/);
  });

  it('nenhum normalizer emite classification — ela só nasce no trigger', () => {
    for (const f of ['../kenlo/leadNormalizer.js', '../contact2sale/c2sNormalizer.js']) {
      const src = readFileSync(path.join(__dirname, f), 'utf8');
      expect(src).not.toContain('classification');
    }
  });
});
