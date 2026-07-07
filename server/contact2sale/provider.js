/**
 * Provider Contact2Sale para o engine genérico de sync (server/crmSync/engine.js).
 * Encapsula SOMENTE o que é específico da C2S:
 *  - sincronização incremental REAL: a API tem updated_gte (diferente do Kenlo,
 *    que só filtra por criação) → LIVE custa O(mudanças), não O(janela);
 *  - BACKFILL resumível: walk da base por created_at asc; o cursor de retomada
 *    (backfill_cursor) é persistido pelo ENGINE via commitPage — somente após a
 *    página ser gravada sem erro (cursor nunca fica à frente dos dados);
 *  - LIVE paginado por CURSOR (updated_gte avança por página), não por offset:
 *    sort=updated_at é chave MUTÁVEL — um lead atualizado no meio do walk
 *    deslocaria as páginas e itens seriam pulados; avançar o gte é imune a isso
 *    (releituras da fronteira morrem no fingerprint);
 *  - normalização e merge origem-vence (c2sNormalizer, decisões D1/D4).
 *
 * Cursores (tenant_contact2sale_config):
 *  - last_sync_at: avança para o INÍCIO do ciclo (t0) e só em ciclo sem erro —
 *    conservador, pois a C2S não tem a reconciliação periódica do Kenlo.
 *    Leads criados/alterados DURANTE um walk são apanhados pelo primeiro LIVE
 *    (updated_gte ≥ t0 − overlap), por isso t0 e não o fim do ciclo.
 *  - backfill_cursor: max(created_at) por página, confirmado pelo engine.
 *  - last_full_sync_at: carimbado só quando um walk completo termina — enquanto
 *    for null, o modo é BACKFILL (com automações suprimidas via is_backfill).
 */
import { loadC2sEnv } from './c2sConfig.js';
import { normalizeC2sLead, c2sFingerprint, mergeC2sLeadUpdate } from './c2sNormalizer.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const CONFIG_TABLE = 'tenant_contact2sale_config';
const iso = (ms) => new Date(ms).toISOString();

// Extremos de timestamp por comparação NUMÉRICA (a C2S responde com offset
// -03:00; comparação lexicográfica entre offsets diferentes erraria).
const pickTimestamp = (items, field, keepLater) => items.reduce((acc, l) => {
  const v = l?.attributes?.[field];
  if (!v) return acc;
  if (!acc) return v;
  return (Date.parse(v) > Date.parse(acc)) === keepLater ? v : acc;
}, null);
const maxTimestamp = (items, field) => pickTimestamp(items, field, true);
const minTimestamp = (items, field) => pickTimestamp(items, field, false);

// A API C2S exige datas no formato strptime `%FT%TZ` = YYYY-MM-DDTHH:MM:SSZ
// (UTC, segundos inteiros, sufixo Z). Um ISO com milissegundos (.969Z) OU com
// offset (-03:00, como a própria C2S devolve nos leads) é REJEITADO com 403
// "invalid date or strptime format". Normaliza qualquer data para esse formato
// só na borda de envio (os cursores internos seguem comparáveis por Date.parse).
const toC2sDate = (x) => new Date(x).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function createC2sProvider({ supabase, apiClient, processEnv = process.env, now = Date.now, logger = noopLogger }) {
  const cfg = loadC2sEnv(processEnv);
  // ponytail: sem first_message/custom_attributes até validar com token real —
  // se first_message for FILTRO (e não include), leads sem mensagem sumiriam do
  // sync. O normalizer já cobre message via messages[]/description.
  const baseParams = { perpage: cfg.perPage };

  const normalizePage = (items, tenantId) => {
    const withId = items.filter((l) => l?.id);
    return { withId, rows: withId.map((l) => normalizeC2sLead(l, tenantId)) };
  };

  async function* backfillPages(integration, syncWindow) {
    const tenantId = integration.tenant_id;
    // DESCENDENTE (mais recente primeiro): a página 1 traz os leads de HOJE, que
    // é o que interessa ao atendimento — os históricos entram depois, ao fundo.
    // created_lt FIXO durante o ciclo (created_at é imutável → páginas estáveis);
    // a retomada busca criados ANTES do cursor (o mais antigo já visto).
    const params = { ...baseParams, sort: '-created_at', ...(syncWindow.backfillCursor && { created_lt: toC2sDate(syncWindow.backfillCursor) }) };
    for (let page = 1; ; page++) {
      const r = await apiClient.getLeads(tenantId, { ...params, page });
      // Falha de página ABORTA o ciclo (a C2S é um stream único): cursor
      // congelado onde o engine confirmou por último; próximo ciclo retoma.
      if (!r.ok) { yield { pageError: true }; return; }
      const { withId, rows } = normalizePage(r.items, tenantId);
      // Cursor = MENOR created_at da página (a fronteira já percorrida). Próximo
      // ciclo pede created_lt=cursor → continua descendo no tempo.
      const cursor = minTimestamp(withId, 'created_at');
      yield { rows, fetched: r.items.length, ...(cursor && { cursor }) };
      // Para quando a página não veio cheia (hasMore=false) — a C2S não dá
      // total_pages, então página incompleta é o único sinal de fim confiável.
      if (!r.hasMore || r.items.length === 0) return;
    }
  }

  async function* livePages(integration, syncWindow) {
    const tenantId = integration.tenant_id;
    let gte = syncWindow.updatedGte;
    let page = 1;
    for (;;) {
      const r = await apiClient.getLeads(tenantId, { ...baseParams, sort: 'updated_at', updated_gte: toC2sDate(gte), page });
      if (!r.ok) { yield { pageError: true }; return; }
      const { withId, rows } = normalizePage(r.items, tenantId);
      yield { rows, fetched: r.items.length };
      // Página incompleta (hasMore=false) = janela updated_gte esgotada. A C2S
      // não dá total_pages, então este é o sinal de fim (não page >= totalPages).
      if (!r.hasMore || r.items.length === 0) return;
      const maxUpdated = maxTimestamp(withId, 'updated_at');
      if (maxUpdated && Date.parse(maxUpdated) > Date.parse(gte)) {
        gte = maxUpdated; page = 1; // cursor real: imune a deslocamento de página
      } else {
        page++; // cluster raro de updated_at idêntico ocupando a página inteira
      }
    }
  }

  return {
    name: 'contact2sale',
    configTable: CONFIG_TABLE,

    resolveWindow(integration) {
      const startedAt = iso(now());
      // BACKFILL enquanto nenhum walk completo terminou (last_full_sync_at é
      // carimbado apenas no fim). Import histórico = automações suprimidas (D3).
      if (!integration.last_full_sync_at || !integration.last_sync_at) {
        return {
          syncMode: 'BACKFILL',
          suppressAutomations: true,
          backfillCursor: integration.backfill_cursor || null,
          startedAt,
        };
      }
      const updatedGte = iso(Date.parse(integration.last_sync_at) - cfg.overlapMin * 60 * 1000);
      return { syncMode: 'LIVE', suppressAutomations: false, updatedGte, startedAt };
    },

    fetchNormalizedPages(integration, syncWindow = {}) {
      return syncWindow.syncMode === 'LIVE'
        ? livePages(integration, syncWindow)
        : backfillPages(integration, syncWindow);
    },

    // Chamado pelo ENGINE somente quando a página foi persistida sem erro.
    async commitPage(integration, cursor) {
      const { error } = await supabase
        .from(CONFIG_TABLE).update({ backfill_cursor: cursor }).eq('tenant_id', integration.tenant_id);
      if (error) logger.warn(`[contact2sale] persistir backfill_cursor falhou: ${error.message}`);
    },

    fingerprint: c2sFingerprint,
    mergeUpdate: mergeC2sLeadUpdate,

    async buildCursorPatch({ integration, syncWindow, syncMode, stats, finishedAt }) {
      // Conservador (≠ cursor-piso do Kenlo): erro ⇒ não avança nada; a
      // releitura idempotente da janela cobre o custo no ciclo seguinte.
      if (!stats || stats.errors > 0) return {};
      const patch = { last_sync_at: syncWindow.startedAt };
      if (syncMode === 'BACKFILL') {
        patch.last_full_sync_at = finishedAt;
        patch.backfill_cursor = null; // walk completo: próximo ciclo já é LIVE
      }
      // leads_count para o card de status — só quando algo pode ter mudado
      // (a maioria dos ciclos LIVE é vazia; count seria custo por nada).
      if (stats.new > 0 || syncMode === 'BACKFILL') {
        const { count, error } = await supabase
          .from('kenlo_leads')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', integration.tenant_id)
          .eq('source_crm', 'contact2sale');
        if (!error && typeof count === 'number') patch.leads_count = count;
      }
      return patch;
    },
  };
}
