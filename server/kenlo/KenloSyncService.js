/**
 * Orquestra a sincronização por tenant: busca incremental por portal, filtra
 * teste/duplicados, enriquece, atribui corretor, faz upsert idempotente e dispara
 * o webhook da Lia para cada lead novo. Isola falha por tenant.
 */
import { MEDIA_ORIGINS, loadKenloEnv } from './kenloConfig.js';
import { resolveStartDate } from './dateWindow.js';
import { normalizeLead, isTestLead, kenloFingerprint, mergeLeadUpdate } from './leadNormalizer.js';

// Colunas da linha existente necessárias para o merge column-scoped. Mantém o SELECT
// enxuto (sem raw_data, que é volumoso) — só o que decide patch/conflito.
const EXISTING_COLS = 'id,external_id,stage,attended_by_name,attended_by_id,kenlo_fingerprint';

const noopLogger = { info() {}, warn() {}, error() {} };
const idOf = (l) => l._id || l.id;

export function createKenloSyncService({
  supabase, leadService, brokerAssigner, processEnv = process.env,
  fetchImpl = fetch, logger = noopLogger, runId = 'kenlo', now = Date.now,
}) {
  const cfg = loadKenloEnv(processEnv);

  // Observabilidade: snapshot do estado do sync por tenant (sobrescreve em sync_state).
  // É o que o card de status e o GET /sync/status leem — mata o "esperar cego".
  async function writeSyncState(tenantId, state) {
    const { error } = await supabase
      .from('kenlo_integrations')
      .update({ sync_state: JSON.stringify(state) })
      .eq('tenant_id', tenantId);
    if (error) logger.warn(`[kenlo] writeSyncState falhou: ${error.message}`);
  }

  // Mapa external_id → linha existente (colunas necessárias ao merge). Substitui o
  // antigo Set de ids: agora precisamos da linha para mesclar, não só saber que existe.
  async function existingRows(tenantId, ids) {
    if (!ids.length) return new Map();
    const { data, error } = await supabase
      .from('kenlo_leads').select(EXISTING_COLS).eq('tenant_id', tenantId).in('external_id', ids);
    if (error) { logger.warn(`[kenlo] select existentes falhou: ${error.message}`); return new Map(); }
    return new Map((data || []).filter((r) => r.external_id).map((r) => [r.external_id, r]));
  }

  // IMPORTANTE: inserts e updates são chamadas SEPARADAS de upsertRows de propósito.
  // O supabase-js monta o `columns` do UPSERT como a UNIÃO das chaves de todas as
  // linhas do lote (postgrest-js: values.reduce(Object.keys)). Misturar a row "gorda"
  // de insert com a "magra" de update faria as colunas locais (temperature, archived_at,
  // first_response_at, is_exclusive...) entrarem na união e serem NULADAS nas rows de
  // update que não as têm. Mantenha os dois lotes separados.
  async function upsertRows(rows, stats) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { data, error } = await supabase
        .from('kenlo_leads')
        .upsert(batch, { onConflict: 'tenant_id,external_id', ignoreDuplicates: false })
        .select('external_id');
      if (error) { stats.errors++; logger.warn(`[kenlo] upsert falhou: ${error.message}`); continue; }
      stats.saved += data?.length || batch.length;
    }
  }

  async function syncTenant(integration, opts = {}) {
    const { syncMode = 'BACKFILL', startDate } = opts;
    const tenantId = integration.tenant_id;
    const stats = { fetched: 0, new: 0, updated: 0, saved: 0, skippedTest: 0, errors: 0 };
    logger.info(`[kenlo] {"event":"kenlo.sync.start","runId":"${runId}","tenantId":"${tenantId}","mode":"${syncMode}"}`);
    brokerAssigner.reset?.(); // cache de corretor é por tenant; limpa antes de começar
    await writeSyncState(tenantId, { status: 'running', mode: syncMode, started_at: new Date(now()).toISOString(), fetched: 0, new: 0, saved: 0, errors: 0 });

    for (const mediaOrigin of MEDIA_ORIGINS) {
      for (let page = 1; ; page++) {
        const { status, leads, isLast } = await leadService.fetchPage(integration, { mediaOrigin, page, startDate });
        if (status !== 200) { stats.errors++; break; } // página falhou: sync incompleto deste portal
        stats.fetched += leads.length;

        const nonTest = leads.filter((l) => { if (isTestLead(l)) { stats.skippedTest++; return false; } return true; });
        const ids = nonTest.map(idOf).filter(Boolean);
        const known = await existingRows(tenantId, ids);
        const withId = nonTest.filter((l) => idOf(l));

        if (withId.length) {
          // Enriquece TODOS (novos e existentes): existentes podem ter mudado corretor/
          // interesse/etapa no Kenlo, e o detalhe é a fonte desses campos.
          const detailed = await leadService.fetchDetails(integration, withId);
          let normalized = detailed.map((l) => normalizeLead(l, tenantId));
          normalized = await brokerAssigner.assign(tenantId, normalized);

          const inserts = [];   // leads novos: linha completa + fingerprint
          const updates = [];   // leads existentes alterados: linha mesclada
          const newOnes = [];   // p/ disparar a Lia só nos genuinamente novos
          for (const row of normalized) {
            const prev = known.get(row.external_id);
            if (!prev) {
              inserts.push({ ...row, kenlo_fingerprint: kenloFingerprint(row) });
              newOnes.push(row);
            } else {
              const patch = mergeLeadUpdate(row, prev); // null = nada do Kenlo mudou
              // Row de update = SÓ chaves de conflito + campos do patch. NÃO espalhar
              // `prev`: incluir stage/attended_by lidos no SELECT faria o upsert reescrevê-los
              // (são EXCLUDED.col) e poderia reverter uma edição simultânea do corretor
              // feita entre o nosso SELECT e o UPSERT. Por omissão, o upsert não toca neles.
              if (patch) updates.push({ tenant_id: tenantId, external_id: prev.external_id, ...patch });
            }
          }

          if (inserts.length) await upsertRows(inserts, stats);
          if (updates.length) { await upsertRows(updates, stats); stats.updated += updates.length; }
          stats.new += newOnes.length;
        }
        if (isLast) break; // última página deste portal; libera e vai ao próximo
      }
    }

    logger.info(`[kenlo] {"event":"kenlo.sync.done","runId":"${runId}","tenantId":"${tenantId}","mode":"${syncMode}","new":${stats.new},"updated":${stats.updated},"saved":${stats.saved}}`);
    return stats;
  }

  async function syncAllTenants() {
    const { data, error } = await supabase
      .from('kenlo_integrations').select('*').eq('status', 'active');
    if (error) { logger.error(`[kenlo] listar tenants falhou: ${error.message}`); return []; }
    const results = await Promise.allSettled((data || []).map(async (integ) => {
      const ttl = cfg.fullSyncTtlMs;
      const lastFull = integ.last_full_sync_at ? Date.parse(integ.last_full_sync_at) : 0;
      const dueFull = !integ.last_full_sync_at || (now() - lastFull >= ttl);
      // BACKFILL no 1º sync (sem cursor) OU na reconciliação periódica vencida.
      const syncMode = (!integ.last_sync_at || dueFull) ? 'BACKFILL' : 'LIVE';
      const startDate = resolveStartDate({ syncMode, lastSyncAt: integ.last_sync_at, cfg, now });
      try {
        const stats = await syncTenant(integ, { syncMode, startDate });
        // Cursor é PISO: avança sempre que o ciclo rodou. Falhas transitórias de fetch
        // são cobertas pela reconciliação BACKFILL periódica + upsert idempotente — travar
        // o cursor num hiccup paralisaria o sync para sempre (era o bug do last_sync travado).
        const finishedAt = new Date(now()).toISOString();
        const patch = { last_sync_at: finishedAt };
        if (syncMode === 'BACKFILL') patch.last_full_sync_at = finishedAt;
        patch.sync_state = JSON.stringify({
          status: stats.errors > 0 ? 'error' : 'done', mode: syncMode, finished_at: finishedAt,
          fetched: stats.fetched, new: stats.new, updated: stats.updated, saved: stats.saved, errors: stats.errors,
          error_message: stats.errors > 0 ? `${stats.errors} falha(s) durante o sync` : null,
        });
        await supabase.from('kenlo_integrations').update(patch).eq('tenant_id', integ.tenant_id);
        return stats;
      } catch (e) {
        // Exceção dura (ex: login falhou, credenciais ausentes): grava o erro no card
        // em vez de deixar sync_state preso em 'running'. NÃO avança o cursor.
        await writeSyncState(integ.tenant_id, { status: 'error', mode: syncMode, finished_at: new Date(now()).toISOString(), error_message: e?.message || 'erro desconhecido' });
        throw e;
      }
    }));
    return results.map((r, idx) => ({
      tenantId: data[idx]?.tenant_id,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    }));
  }

  return { syncTenant, syncAllTenants };
}
