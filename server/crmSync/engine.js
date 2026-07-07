/**
 * Engine genérico de sincronização de CRMs externos → kenlo_leads.
 *
 * Extraído de KenloSyncService (comportamento preservado 1:1; a suíte do Kenlo
 * é o guard-rail). O provider encapsula SOMENTE o que é específico do CRM de
 * origem: obtenção (páginas já normalizadas), janela/cursor e política de
 * merge. Todo o resto é compartilhado e idêntico para qualquer CRM (Kenlo,
 * Contact2Sale, ...): fingerprint gate, split insert/update, upsert idempotente
 * em batch, sync_state, isolamento de falha por tenant, soft-delete de tenants.
 * Adicionar um CRM novo = implementar um provider novo; nenhum fluxo paralelo.
 *
 * Contrato do provider:
 *   name          — 'kenlo' | 'contact2sale' | ... (prefixo de logs/eventos)
 *   configTable   — tabela de config por tenant (linhas status='active' sincronizam)
 *   resolveWindow(integration)
 *                 — decide { syncMode: 'BACKFILL'|'LIVE', suppressAutomations?,
 *                   ...campos opacos do provider (ex.: startDate) } a partir dos
 *                   cursores da config. `suppressAutomations: true` marca os
 *                   INSERTs com is_backfill=true (import histórico: o trigger de
 *                   outbox NÃO enfileira lead.created — Lia fica em silêncio).
 *
 * O engine estampa source_crm = provider.name em todo INSERT (proveniência é
 * responsabilidade do engine, não convenção do normalizador — provider que
 * esquecesse a coluna nasceria com DEFAULT 'kenlo' e corromperia a proveniência
 * em silêncio).
 *   fetchNormalizedPages(integration, window)
 *                 — async generator; cada página rende { rows, fetched,
 *                   skippedTest, cursor? } com rows JÁ normalizadas para o
 *                   schema de kenlo_leads (autenticação/paginação/detalhes são
 *                   problema do provider), ou { pageError: true } em falha.
 *   commitPage(integration, cursor)  [opcional]
 *                 — confirmação de progresso durável (ex.: backfill_cursor).
 *                   O ENGINE chama somente quando a página foi persistida sem
 *                   erro — o provider NUNCA deve persistir cursor por conta
 *                   própria, senão uma falha de upsert perderia leads para
 *                   sempre (cursor à frente dos dados).
 *   fingerprint(row)
 *                 — hash dos campos que o CRM de origem possui (gravado em
 *                   kenlo_leads.kenlo_fingerprint — coluna canônica p/ todos os
 *                   providers; payload idêntico ⇒ zero UPDATE ⇒ zero trigger).
 *   mergeUpdate(incoming, existing)
 *                 — política de conflito do provider: patch column-scoped
 *                   (incluindo o novo fingerprint) ou null se nada mudou.
 *   buildCursorPatch({ integration, syncWindow, syncMode, stats, finishedAt })
 *                 — avanço de cursor na config (semântica é do provider: Kenlo
 *                   usa cursor-piso; C2S avança para syncWindow.startedAt e só
 *                   em ciclo sem erro). Retornar {} = não avançar nada.
 */
import { getDeletedTenantIds } from '../utils/tenantSoftDelete.js';

// Tabela canônica de leads de CRM externo. É proposital que NÃO seja parâmetro:
// todos os consumidores (Kanban, Central, KPIs, triggers de outbox/WhatsApp/
// bolsão) leem esta tabela — um provider gravando em outro lugar sairia do
// pipeline único. A proveniência fica na coluna source_crm.
const CANONICAL_LEADS_TABLE = 'kenlo_leads';

// Colunas da linha existente necessárias para o merge column-scoped. Mantém o
// SELECT enxuto (sem raw_data, que é volumoso) — só o que decide patch/conflito.
// archived_at: sinal CANÔNICO de arquivamento em kenlo_leads (NÃO existe coluna
// is_archived — consumidores filtram archived_at IS NULL). O merge C2S (D4)
// detecta transição de arquivamento por nulidade; o merge Kenlo a ignora.
const EXISTING_COLS = 'id,external_id,stage,attended_by_name,attended_by_id,kenlo_fingerprint,archived_at';

const noopLogger = { info() {}, warn() {}, error() {} };

export function createCrmSyncEngine({ supabase, provider, logger = noopLogger, runId, now = Date.now }) {
  const name = provider.name;
  const rid = runId || name;

  // Observabilidade: snapshot do estado do sync por tenant (sobrescreve em sync_state).
  // É o que o card de status e o GET /sync/status leem — mata o "esperar cego".
  async function writeSyncState(tenantId, state) {
    const { error } = await supabase
      .from(provider.configTable)
      .update({ sync_state: JSON.stringify(state) })
      .eq('tenant_id', tenantId);
    if (error) logger.warn(`[${name}] writeSyncState falhou: ${error.message}`);
  }

  // Mapa external_id → linha existente (colunas necessárias ao merge).
  async function existingRows(tenantId, ids) {
    if (!ids.length) return new Map();
    const { data, error } = await supabase
      .from(CANONICAL_LEADS_TABLE).select(EXISTING_COLS).eq('tenant_id', tenantId).in('external_id', ids);
    // Degradação herdada: Map vazio ⇒ a página inteira vira "insert" de linha cheia
    // e o ON CONFLICT atualiza os existentes (o upsert idempotente absorve; custo:
    // colunas de origem sobrescritas e, no 1º sync, is_backfill carimbado neles).
    if (error) { logger.warn(`[${name}] select existentes falhou: ${error.message}`); return new Map(); }
    return new Map((data || []).filter((r) => r.external_id).map((r) => [r.external_id, r]));
  }

  // IMPORTANTE: inserts e updates são chamadas SEPARADAS de upsertRows de propósito.
  // O supabase-js monta o `columns` do UPSERT como a UNIÃO das chaves de todas as
  // linhas do lote (postgrest-js: values.reduce(Object.keys)). Misturar a row "gorda"
  // de insert com a "magra" de update faria as colunas locais (temperature, archived_at,
  // first_response_at, is_exclusive...) entrarem na união e serem NULADAS nas rows de
  // update que não as têm. Mantenha os dois lotes separados (upsertColumns.test.js).
  async function upsertRows(rows, stats) {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { data, error } = await supabase
        .from(CANONICAL_LEADS_TABLE)
        .upsert(batch, { onConflict: 'tenant_id,external_id', ignoreDuplicates: false })
        .select('external_id');
      if (error) { stats.errors++; logger.warn(`[${name}] upsert falhou: ${error.message}`); continue; }
      stats.saved += data?.length || batch.length;
    }
  }

  async function syncTenant(integration, syncWindow = {}) {
    const { syncMode = 'BACKFILL' } = syncWindow;
    const tenantId = integration.tenant_id;
    const stats = { fetched: 0, new: 0, updated: 0, saved: 0, skippedTest: 0, errors: 0 };
    const startedAt = new Date(now()).toISOString();
    logger.info(`[${name}] {"event":"${name}.sync.start","runId":"${rid}","tenantId":"${tenantId}","mode":"${syncMode}"}`);
    await writeSyncState(tenantId, {
      status: 'running', mode: syncMode, started_at: startedAt, heartbeat_at: startedAt,
      fetched: 0, new: 0, updated: 0, saved: 0, errors: 0,
    });

    async function writeHeartbeat() {
      await writeSyncState(tenantId, {
        status: 'running', mode: syncMode, started_at: startedAt,
        heartbeat_at: new Date(now()).toISOString(),
        fetched: stats.fetched, new: stats.new, updated: stats.updated,
        saved: stats.saved, errors: stats.errors,
      });
    }

    for await (const page of provider.fetchNormalizedPages(integration, syncWindow)) {
      if (page.pageError) { stats.errors++; continue; } // página falhou: sync incompleto desta fatia
      const errorsBefore = stats.errors;
      stats.fetched += page.fetched || 0;
      stats.skippedTest += page.skippedTest || 0;
      const rows = page.rows || [];
      if (!rows.length) {
        if (page.cursor != null && provider.commitPage) await provider.commitPage(integration, page.cursor);
        await writeHeartbeat();
        continue;
      }

      const known = await existingRows(tenantId, rows.map((r) => r.external_id));
      const inserts = [];   // leads novos: linha completa + fingerprint
      const updates = [];   // leads existentes alterados: linha mesclada
      for (const row of rows) {
        const prev = known.get(row.external_id);
        if (!prev) {
          // Import histórico marca a linha: o trigger de outbox (WHEN is_backfill
          // IS NOT TRUE) não enfileira lead.created — Lia em silêncio no backfill.
          // Fora do backfill a coluna nem é enviada (DEFAULT false no banco).
          inserts.push({
            ...row,
            kenlo_fingerprint: provider.fingerprint(row),
            source_crm: provider.name,
            ...(syncWindow.suppressAutomations && { is_backfill: true }),
          });
        } else {
          const patch = provider.mergeUpdate(row, prev); // null = nada da origem mudou
          // Row de update = SÓ chaves de conflito + campos do patch. NÃO espalhar
          // `prev`: incluir stage/attended_by lidos no SELECT faria o upsert reescrevê-los
          // (são EXCLUDED.col) e poderia reverter uma edição simultânea do corretor
          // feita entre o nosso SELECT e o UPSERT. Por omissão, o upsert não toca neles.
          if (patch) updates.push({ tenant_id: tenantId, external_id: prev.external_id, ...patch });
        }
      }

      if (inserts.length) await upsertRows(inserts, stats);
      if (updates.length) { await upsertRows(updates, stats); stats.updated += updates.length; }
      stats.new += inserts.length;

      // Progresso durável só com a página 100% persistida: upsert com erro NÃO
      // confirma o cursor — senão os leads da página falhada sumiriam do backfill.
      if (page.cursor != null && stats.errors === errorsBefore && provider.commitPage) {
        await provider.commitPage(integration, page.cursor);
      }

      // Heartbeat por página: um backfill legítimo dura horas — sem isso o
      // status não distingue "processando" de "processo morreu" (stalled), e o
      // card fica cego ao progresso (contadores parciais).
      await writeHeartbeat();
    }

    logger.info(`[${name}] {"event":"${name}.sync.done","runId":"${rid}","tenantId":"${tenantId}","mode":"${syncMode}","new":${stats.new},"updated":${stats.updated},"saved":${stats.saved}}`);
    return stats;
  }

  // Integrações ativas do provider, já sem tenants soft-deletados
  // (service_role bypassa RLS, então o filtro é explícito aqui).
  async function listActiveIntegrations() {
    const { data, error } = await supabase
      .from(provider.configTable).select('*').eq('status', 'active');
    if (error) { logger.error(`[${name}] listar tenants falhou: ${error.message}`); return null; }
    const deletedIds = await getDeletedTenantIds(supabase, (data || []).map((i) => i.tenant_id));
    return (data || []).filter((i) => !deletedIds.has(i.tenant_id));
  }

  // Ciclo COMPLETO de um tenant: janela → sync → cursor + sync_state final.
  // É a unidade que um runner por-tenant agenda de forma independente.
  async function runTenantCycle(integ) {
    // `|| {}`: provider que retorne undefined não pode travar sync_state em
    // 'running' (o catch abaixo referencia syncWindow.syncMode).
    const syncWindow = provider.resolveWindow(integ) || {};
    try {
      const stats = await syncTenant(integ, syncWindow);
      const finishedAt = new Date(now()).toISOString();
      // await: buildCursorPatch pode ser assíncrono (ex.: C2S conta leads_count);
      // await de valor não-Promise (Kenlo) é no-op.
      const cursorPatch = await provider.buildCursorPatch({ integration: integ, syncWindow, syncMode: syncWindow.syncMode, stats, finishedAt });
      const patch = {
        ...cursorPatch,
        sync_state: JSON.stringify({
          status: stats.errors > 0 ? 'error' : 'done', mode: syncWindow.syncMode, finished_at: finishedAt,
          fetched: stats.fetched, new: stats.new, updated: stats.updated, saved: stats.saved, errors: stats.errors,
          error_message: stats.errors > 0 ? `${stats.errors} falha(s) durante o sync` : null,
        }),
      };
      await supabase.from(provider.configTable).update(patch).eq('tenant_id', integ.tenant_id);
      return stats;
    } catch (e) {
      // Exceção dura (ex: login falhou, credenciais ausentes): grava o erro no card
      // em vez de deixar sync_state preso em 'running'. NÃO avança o cursor.
      await writeSyncState(integ.tenant_id, { status: 'error', mode: syncWindow.syncMode, finished_at: new Date(now()).toISOString(), error_message: e?.message || 'erro desconhecido' });
      throw e;
    }
  }

  async function syncAllTenants() {
    const integrations = await listActiveIntegrations();
    if (!integrations) return [];
    const results = await Promise.allSettled(integrations.map(runTenantCycle));
    return results.map((r, idx) => ({
      tenantId: integrations[idx]?.tenant_id,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    }));
  }

  return { syncTenant, syncAllTenants, listActiveIntegrations, runTenantCycle };
}
