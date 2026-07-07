/**
 * Provider Contact2Sale para o engine genérico de sync (server/crmSync/engine.js).
 * Encapsula SOMENTE o que é específico da C2S:
 *  - a API C2S SÓ suporta o filtro created_lt: created_gte e updated_gte são
 *    IGNORADOS pelo feed real (updated_gte ainda zera qualquer janela recente).
 *    Validado com token real contra api.contact2sale.com em 2026-07-07. Por isso
 *    TODA busca (BACKFILL e LIVE) desce por created_at DESC com created_lt;
 *  - BACKFILL resumível: walk da base inteira por created_at DESC; o cursor de
 *    retomada (backfill_cursor) é persistido pelo ENGINE via commitPage — somente
 *    após a página ser gravada sem erro (cursor nunca fica à frente dos dados);
 *  - LIVE = mini-walk do TOPO: mesmo sort=-created_at + created_lt, mas para ao
 *    cruzar o piso de criação (last_sync_at − overlap). Traz só os leads novos;
 *    releituras da fronteira morrem no upsert idempotente (ON CONFLICT);
 *  - normalização e merge origem-vence (c2sNormalizer, decisões D1/D4).
 *
 * Cursores (tenant_contact2sale_config):
 *  - last_sync_at: no LIVE, o MAIOR created_at efetivamente processado (dado, não
 *    relógio) — imune a gap de scheduler; se nada novo veio, mantém o anterior.
 *    No BACKFILL, ancora no início do walk (startedAt). Só avança em ciclo sem erro.
 *  - backfill_cursor: min(created_at) por página do BACKFILL, confirmado pelo engine.
 *  - last_full_sync_at: carimbado só quando um walk completo termina — enquanto
 *    for null, o modo é BACKFILL (com automações suprimidas via is_backfill).
 *  TODO(fase 2): gate BACKFILL→LIVE por last_full_sync_at != NULL (hoje basta
 *  last_sync_at existir, o que permite LIVE com histórico incompleto).
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

  // LIVE = mini-walk do TOPO por created_at DESC até reencontrar o cursor de
  // criação. A API C2S só suporta created_lt (created_gte/updated_gte são
  // IGNORADOS e updated_gte zera qualquer janela recente — validado contra o
  // feed real). Por isso o LIVE espelha o BACKFILL (sort=-created_at + created_lt),
  // mas com PISO: desce só até createdGteFloor (last_sync_at − overlap) e para.
  // Cursor = maior created_at processado (dado, não relógio) → imune a gap de
  // scheduler: o próximo ciclo recomeça do topo e desce até o já-visto; a
  // releitura da fronteira morre no upsert idempotente (ON CONFLICT).
  async function* livePages(integration, syncWindow) {
    const tenantId = integration.tenant_id;
    const floorMs = Date.parse(syncWindow.createdGteFloor);
    let createdLt = null; // retomada de página DENTRO do ciclo (created_lt desce)
    for (;;) {
      const params = { ...baseParams, sort: '-created_at', ...(createdLt && { created_lt: toC2sDate(createdLt) }) };
      const r = await apiClient.getLeads(tenantId, { ...params, page: 1 });
      if (!r.ok) { yield { pageError: true }; return; }
      const { withId, rows } = normalizePage(r.items, tenantId);
      // Só os leads ACIMA do piso interessam ao LIVE (o resto é histórico já visto).
      // Filtra por VALOR (não fatia por posição): robusto se a página vier fora de
      // ordem. withId[i] ↔ rows[i] alinhados (rows = withId.map), então o índice serve aos dois.
      const fresh = rows.filter((_, i) => Date.parse(withId[i].attributes?.created_at) > floorMs);
      const crossedFloor = fresh.length < withId.length; // algum lead da página ficou no/abaixo do piso
      // maxCreatedSeen no PRÓPRIO syncWindow: é o mesmo objeto que chega ao
      // buildCursorPatch (engine.runTenantCycle), então vira o novo last_sync_at
      // sem precisar alterar o engine nem o contrato de page.
      const maxCreated = maxTimestamp(withId.filter((l) => Date.parse(l.attributes?.created_at) > floorMs), 'created_at');
      if (maxCreated && (!syncWindow.maxCreatedSeen || Date.parse(maxCreated) > Date.parse(syncWindow.maxCreatedSeen))) {
        syncWindow.maxCreatedSeen = maxCreated;
      }
      yield { rows: fresh, fetched: r.items.length };
      // Para quando: a página cruzou o piso (algum lead ≤ piso), a página veio
      // incompleta (fim do stream), ou veio vazia. A C2S não dá total_pages.
      if (crossedFloor || !r.hasMore || r.items.length === 0) return;
      createdLt = minTimestamp(withId, 'created_at'); // continua descendo (created_lt re-lê a fronteira; upsert dedupa)
    }
  }

  return {
    name: 'contact2sale',
    configTable: CONFIG_TABLE,

    resolveWindow(integration) {
      const startedAt = iso(now());
      // LIVE tem PRIORIDADE assim que houve qualquer ciclo (last_sync_at existe):
      // o scheduler de 1min precisa trazer lead novo sozinho pelo topo (mini-walk
      // por created_at DESC até o piso), sem esperar o backfill histórico terminar.
      // Antes, BACKFILL ficava preso (last_full_sync_at nunca fechava numa base
      // grande) e o cursor descia no tempo, ignorando os leads de hoje.
      //
      // O import histórico profundo agora é SOB DEMANDA: o full resync (routes.js)
      // zera last_sync_at + backfill_cursor + last_full_sync_at → cai no ramo
      // BACKFILL abaixo (import silencioso por D3). Fora isso, o dia-a-dia é LIVE.
      const backfillPedido = !integration.last_sync_at;
      if (backfillPedido) {
        return {
          syncMode: 'BACKFILL',
          suppressAutomations: true,
          backfillCursor: integration.backfill_cursor || null,
          startedAt,
        };
      }
      // PISO de criação para o mini-walk LIVE: last_sync_at (= maior created_at já
      // processado) − overlap. O LIVE desce do topo e para ao cruzar este piso.
      const createdGteFloor = iso(Date.parse(integration.last_sync_at) - cfg.overlapMin * 60 * 1000);
      return { syncMode: 'LIVE', suppressAutomations: false, createdGteFloor, startedAt };
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
      // LIVE: cursor = MAIOR created_at processado (dado, não relógio) — imune a
      // gap de scheduler. Se nada novo veio, mantém o last_sync_at anterior (não
      // retrocede, não pula à frente). BACKFILL segue ancorando no início do walk
      // (startedAt): o walk cobre a base inteira, o piso não se aplica.
      const liveCursor = syncWindow.maxCreatedSeen || integration.last_sync_at;
      const patch = { last_sync_at: syncMode === 'BACKFILL' ? syncWindow.startedAt : liveCursor };
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
