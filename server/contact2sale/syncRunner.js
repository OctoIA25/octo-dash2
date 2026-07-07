/**
 * Runner do sync C2S com guarda de reentrância POR TENANT (≠ Kenlo, que usa
 * guarda global por ciclo): um backfill de horas de um tenant grande não pode
 * adiar o LIVE dos demais. Cada tick do cron dispara ciclos independentes;
 * tenant ainda em voo é pulado (o próximo tick o reavalia).
 *
 * Fila FIFO com teto GLOBAL de concorrência (default 5, como Santa Ângela):
 * limita ciclos simultâneos NO PROCESSO, independentemente de quantos triggers
 * cron/manuais chegarem. Dentro de cada ciclo o rate limit HTTP por tenant
 * continua valendo.
 *
 * ponytail: guarda por-processo (deploy é instância única, scheduler flag-gated
 * p/ UM processo). Multi-instância exigiria advisory lock por tenant no Postgres.
 */
export function createC2sSyncRunner(engine, { logger = console, maxConcurrentTenants = 5 } = {}) {
  const inFlight = new Set(); // tenantIds enfileirados ou em execução
  const queue = [];
  const configuredMax = Number(maxConcurrentTenants);
  const maxWorkers = Number.isFinite(configuredMax) ? Math.max(1, configuredMax) : 5;
  let activeCount = 0;

  function logError(message) {
    try { logger.error(message); } catch { /* logger best-effort */ }
  }

  function drainQueue() {
    while (activeCount < maxWorkers && queue.length > 0) {
      const integ = queue.shift();
      activeCount++;
      Promise.resolve(engine.runTenantCycle(integ))
        .catch((e) => {
          // runTenantCycle já gravou sync_state 'error'; aqui é só telemetria.
          logError(`[contact2sale] ciclo tenant=${integ.tenant_id} falhou: ${e?.message}`);
        })
        .finally(() => {
          activeCount--;
          inFlight.delete(integ.tenant_id);
          drainQueue();
        })
        .catch((e) => {
          // Defesa explícita contra futuras alterações no bloco finally/drainQueue.
          logError(`[contact2sale] finalização do ciclo falhou: ${e?.message}`);
        });
    }
  }

  /**
   * Não-bloqueante: enfileira os ciclos e responde na hora quantos começaram
   * e quantos foram pulados por já estarem em voo. tenantId restringe o alvo.
   */
  async function trigger({ tenantId = null } = {}) {
    let all;
    try {
      all = await engine.listActiveIntegrations();
    } catch (e) {
      logError(`[contact2sale] listar integrações falhou: ${e?.message}`);
      return { started: 0, skipped: 0, error: 'falha ao listar integrações ativas' };
    }
    if (!all) return { started: 0, skipped: 0, error: 'falha ao listar integrações ativas' };

    const targets = tenantId ? all.filter((i) => i.tenant_id === tenantId) : all;
    let skipped = 0;
    let started = 0;
    for (const integ of targets) {
      if (inFlight.has(integ.tenant_id)) { skipped++; continue; }
      inFlight.add(integ.tenant_id);
      queue.push(integ);
      started++;
    }
    if (started) drainQueue();
    return { started, skipped };
  }

  return {
    trigger,
    isRunning: (tenantId) => (tenantId ? inFlight.has(tenantId) : inFlight.size > 0),
  };
}
