/**
 * P1 — Observabilidade dos jobs: endpoint de leitura.
 * Spec: docs/superpowers/specs/2026-07-11-observabilidade-jobs-design.md
 *
 * GET /api/v1/health/jobs — lê job_heartbeats, compara a idade de cada heartbeat
 * com o limite esperado e devolve o estado (ok | degraded) por job. Só leitura;
 * não altera nada. Registrado nos DOIS entrypoints (api-server + proxy-production)
 * via registerHealthRoutes(app, supabase) — já houve 404 em prod por esquecer um.
 *
 * Protegido por token simples (X-Health-Token == HEALTH_API_TOKEN). Sem JWT.
 */

// Limite de idade (ms) por job antes de virar 'degraded'. Fonte ÚNICA — não
// espalhar. Grace tolerante (~3-4x o ciclo) p/ não gritar por um tick perdido:
//   c2s_sync   cron 1min  -> 10min      kenlo_sync cron 3min -> 15min
//   outbox     ~1/min     -> 5min       recommendation_scheduler cron 1h -> 2h
const JOB_LIMITS = {
  c2s_sync: 10 * 60 * 1000,
  kenlo_sync: 15 * 60 * 1000,
  outbox_worker: 5 * 60 * 1000,
  recommendation_scheduler: 2 * 60 * 60 * 1000,
};

export function registerHealthRoutes(app, supabase) {
  app.get('/api/v1/health/jobs', async (req, res) => {
    // Token simples. Se HEALTH_API_TOKEN não estiver configurado, o endpoint fica
    // fechado (401) — fail-closed: dado operacional não vaza por config faltando.
    const expected = process.env.HEALTH_API_TOKEN;
    if (!expected || req.get('X-Health-Token') !== expected) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    let rows;
    try {
      const { data, error } = await supabase
        .from('job_heartbeats')
        .select('job_name, last_run_at, last_result');
      if (error) throw new Error(error.message);
      rows = data || [];
    } catch (e) {
      return res.status(503).json({ status: 'error', error: e?.message });
    }

    const byName = new Map(rows.map((r) => [r.job_name, r]));
    const now = Date.now();
    const jobs = {};
    let anyDegraded = false;

    for (const [jobName, limitMs] of Object.entries(JOB_LIMITS)) {
      const row = byName.get(jobName);
      if (!row) {
        // Nunca reportou heartbeat: trata como degraded (job pode nunca ter subido).
        jobs[jobName] = { ok: false, status: 'degraded', reason: 'no_heartbeat', limit_s: Math.round(limitMs / 1000) };
        anyDegraded = true;
        continue;
      }
      const lastRunMs = new Date(row.last_run_at).getTime();
      const ageMs = now - lastRunMs;
      const result = row.last_result || {};
      // degraded se o heartbeat envelheceu OU o último ciclo reportou falha.
      const ok = ageMs <= limitMs && result.ok !== false;
      if (!ok) anyDegraded = true;
      jobs[jobName] = {
        ok,
        status: ok ? 'ok' : 'degraded',
        last_run_at: row.last_run_at,
        age_s: Math.round(ageMs / 1000),
        limit_s: Math.round(limitMs / 1000),
        duration_ms: result.duration_ms,
        consecutive_failures: result.consecutive_failures,
        last_result: result.summary,
      };
    }

    res.json({ status: anyDegraded ? 'degraded' : 'ok', jobs });
  });
}

// Exportado p/ os testes cobrirem os limites sem depender do processo HTTP.
export { JOB_LIMITS };
