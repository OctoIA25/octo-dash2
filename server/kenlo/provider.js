/**
 * Provider Kenlo para o engine genérico de sync (server/crmSync/engine.js).
 * Encapsula SOMENTE o que é específico do Kenlo: janela por data de criação
 * (a API não tem updated_gte — por isso 60 dias + reconciliação periódica),
 * paginação multi-portal, enriquecimento por lead (fetchDetails), normalização
 * e a política de merge "CRM local vence" (leadNormalizer).
 */
import { MEDIA_ORIGINS, loadKenloEnv } from './kenloConfig.js';
import { resolveStartDate } from './dateWindow.js';
import { normalizeLead, isTestLead, kenloFingerprint, mergeLeadUpdate } from './leadNormalizer.js';

const idOf = (l) => l._id || l.id;

export function createKenloProvider({ leadService, brokerAssigner, processEnv = process.env, now = Date.now }) {
  const cfg = loadKenloEnv(processEnv);

  return {
    name: 'kenlo',
    configTable: 'kenlo_integrations',

    resolveWindow(integration) {
      const lastFull = integration.last_full_sync_at ? Date.parse(integration.last_full_sync_at) : 0;
      const dueFull = !integration.last_full_sync_at || (now() - lastFull >= cfg.fullSyncTtlMs);
      // BACKFILL no 1º sync (sem cursor) OU na reconciliação periódica vencida.
      const syncMode = (!integration.last_sync_at || dueFull) ? 'BACKFILL' : 'LIVE';
      const startDate = resolveStartDate({ syncMode, lastSyncAt: integration.last_sync_at, cfg, now });
      // Import histórico silencioso (is_backfill=true → outbox não enfileira) no
      // 1º CICLO DO SERVIDOR. Detectado por last_full_sync_at (server-only): o
      // connect legado do frontend pré-semeia last_sync_at na conexão
      // (kenloLeadsService.saveKenloIntegration), então last_sync_at NÃO distingue
      // "servidor nunca rodou". A reconciliação periódica (ambos cursores presentes)
      // é operação de ROTINA: lead novo que o LIVE perdeu aciona a Lia normalmente —
      // o gate de frescor (48h) no trigger cuida dos antigos. Limitação conhecida:
      // o import histórico feito PELO BROWSER no connect legado não passa por aqui;
      // até esse fluxo migrar para o servidor, quem o contém é o gate de 48h.
      const suppressAutomations = !integration.last_sync_at || !integration.last_full_sync_at;
      return { syncMode, startDate, suppressAutomations };
    },

    async *fetchNormalizedPages(integration, window = {}) {
      const tenantId = integration.tenant_id;
      brokerAssigner.reset?.(); // cache de corretor é por tenant; limpa antes de começar
      for (const mediaOrigin of MEDIA_ORIGINS) {
        for (let page = 1; ; page++) {
          const { status, leads, isLast } = await leadService.fetchPage(integration, { mediaOrigin, page, startDate: window.startDate });
          if (status !== 200) { yield { pageError: true }; break; } // página falhou: sync incompleto deste portal
          let skippedTest = 0;
          const nonTest = leads.filter((l) => { if (isTestLead(l)) { skippedTest++; return false; } return true; });
          const withId = nonTest.filter((l) => idOf(l));
          let rows = [];
          if (withId.length) {
            // Enriquece TODOS (novos e existentes): existentes podem ter mudado corretor/
            // interesse/etapa no Kenlo, e o detalhe é a fonte desses campos.
            const detailed = await leadService.fetchDetails(integration, withId);
            rows = detailed.map((l) => normalizeLead(l, tenantId));
            rows = await brokerAssigner.assign(tenantId, rows);
          }
          yield { rows, fetched: leads.length, skippedTest };
          if (isLast) break; // última página deste portal; libera e vai ao próximo
        }
      }
    },

    fingerprint: kenloFingerprint,
    mergeUpdate: mergeLeadUpdate,

    buildCursorPatch({ syncMode, finishedAt }) {
      // Cursor é PISO: avança sempre que o ciclo rodou. Falhas transitórias de fetch
      // são cobertas pela reconciliação BACKFILL periódica + upsert idempotente — travar
      // o cursor num hiccup paralisaria o sync para sempre (era o bug do last_sync travado).
      const patch = { last_sync_at: finishedAt };
      if (syncMode === 'BACKFILL') patch.last_full_sync_at = finishedAt;
      return patch;
    },
  };
}
