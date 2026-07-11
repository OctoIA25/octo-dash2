/**
 * P1 — Observabilidade dos jobs. Helper ÚNICO de heartbeat.
 * Spec: docs/superpowers/specs/2026-07-11-observabilidade-jobs-design.md
 *
 * Registra, ao FIM de um ciclo real de trabalho (não no disparo do scheduler),
 * o estado atual do job: UPSERT em job_heartbeats + ping opcional no
 * Healthchecks.io. Os dois destinos são independentes.
 *
 * REGRA DE OURO: telemetria jamais derruba produção. Este módulo NUNCA lança —
 * qualquer erro (banco, rede, Healthchecks, timeout) é absorvido e vira só um
 * console.warn. O job que o chama continua exatamente como antes.
 *
 * O heartbeat é PASSIVO: não altera fluxo, periodicidade nem decisões do job.
 */

// Jobs cujo heartbeat é AMOSTRADO (throttle). Só o outbox roda a cada ~5s
// (~17k/dia); registrar todo tick poluiria a tabela/Healthchecks e um grace
// curto daria falso-positivo. Os demais (cron 1min/3min/1h) não entram aqui.
const THROTTLE_MS = { outbox_worker: 60_000 };

// Estado em memória (por processo). ponytail: o scheduler é flag-gated p/ UM
// processo, então um Map em memória basta — sem timer, sem lib. Se virar
// multi-instância, cada processo amostra o seu (aceitável p/ detecção de silêncio).
const lastBeatAt = new Map();     // job_name -> epoch ms do último heartbeat GRAVADO
const failureCount = new Map();   // job_name -> consecutive_failures corrente

/**
 * @param {object} supabase  client service_role
 * @param {string} jobName   'c2s_sync' | 'kenlo_sync' | 'outbox_worker' | 'recommendation_scheduler'
 * @param {object} [opts]
 * @param {*}       [opts.result]      summary real do ciclo (gravado em last_result)
 * @param {number}  [opts.durationMs]  duração do ciclo
 * @param {boolean} [opts.ok=true]     false = ciclo falhou (incrementa consecutive_failures, NÃO pinga)
 * @param {number}  [opts.now]         injeção de relógio p/ teste (default Date.now())
 * @param {function}[opts.fetchImpl]   injeção de fetch p/ teste (default global fetch)
 */
export async function recordHeartbeat(supabase, jobName, opts = {}) {
  try {
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    const ok = opts.ok !== false;

    // Throttle (só jobs listados): se o último heartbeat gravado foi há menos que
    // a janela, ignora silenciosamente. Falha (ok=false) sempre passa — degradação
    // não pode ser suprimida pela amostragem.
    const throttleMs = THROTTLE_MS[jobName];
    if (ok && throttleMs) {
      const last = lastBeatAt.get(jobName);
      if (last != null && now - last < throttleMs) return;
    }

    const consecutiveFailures = ok ? 0 : (failureCount.get(jobName) || 0) + 1;
    failureCount.set(jobName, consecutiveFailures);

    const lastResult = {
      ...(opts.result != null ? { summary: opts.result } : {}),
      ...(typeof opts.durationMs === 'number' ? { duration_ms: opts.durationMs } : {}),
      ok,
      consecutive_failures: consecutiveFailures,
    };

    const { error } = await supabase.from('job_heartbeats').upsert(
      { job_name: jobName, last_run_at: new Date(now).toISOString(), last_result: lastResult },
      { onConflict: 'job_name' },
    );
    if (error) {
      console.warn(`[heartbeat] ${jobName} upsert falhou: ${error.message}`);
    } else {
      lastBeatAt.set(jobName, now); // só marca throttle quando a gravação deu certo
    }

    // Ping do Healthchecks: só em sucesso (o silêncio é o sinal de falha) e só se
    // a URL existir. Best-effort — nunca espera nem propaga.
    if (ok) {
      const url = process.env[`HC_${jobName.toUpperCase()}_URL`];
      if (url) {
        const fetchImpl = opts.fetchImpl || fetch;
        Promise.resolve()
          .then(() => fetchImpl(url))
          .catch(() => {}); // ponytail: ping de telemetria nunca derruba o job
      }
    }
  } catch (e) {
    // Blindagem final: nada aqui pode escapar para o job chamador.
    console.warn(`[heartbeat] ${jobName} falhou: ${e?.message}`);
  }
}

// Exposto só para testes limparem o estado em memória entre casos.
export function __resetHeartbeatState() {
  lastBeatAt.clear();
  failureCount.clear();
}
