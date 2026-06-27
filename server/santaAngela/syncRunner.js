/**
 * Guarda de reentrância compartilhada entre o scheduler (cron) e o disparo
 * manual (POST /sync/run). Garante que NUNCA haja dois ciclos de sync em
 * paralelo — um run manual e um tick do cron competiriam pelo mesmo upsert.
 *
 * `trigger()` é não-bloqueante: dispara em background e devolve na hora se o
 * run começou (`started`) ou foi ignorado por já haver um em andamento
 * (`alreadyRunning`). O resultado do sync vai para os logs; o estado
 * observável fica em tenant_santa_angela_config (last_sync_at/leads_count).
 *
 * ponytail: guarda por-processo (closure em memória). Protege contra ticks do
 * cron e POSTs concorrentes (POST /sync/run) no MESMO processo — o deploy é
 * instância única (scheduler já é flag-gated p/ um processo). Se virar
 * multi-instância, subir a guarda p/ um lock distribuído (advisory lock no
 * Postgres por tenant).
 */
export function createSantaAngelaRunner(syncService, { logger = console } = {}) {
  let running = false;

  function trigger() {
    if (running) return { started: false, alreadyRunning: true };
    running = true;
    // .then(invoke) — não invoca fora do Promise: assim um throw síncrono de
    // syncAllTenants ainda cai no .catch e o .finally sempre libera a guarda.
    Promise.resolve()
      .then(() => syncService.syncAllTenants())
      .catch((e) => logger.error(`[santa-angela] erro no ciclo: ${e?.message}`))
      .finally(() => { running = false; });
    return { started: true, alreadyRunning: false };
  }

  return { trigger, isRunning: () => running };
}
