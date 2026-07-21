/**
 * Configuração estática do módulo Contact2Sale: base URL fixa da API oficial e
 * parsing de env (knobs próprios C2S_*, independentes do Kenlo).
 * Rate default conservador: ~10 req/min por tenant (limite praticado por
 * integradores reais; a C2S não documenta o oficial — ajustar com token real).
 */
const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export const C2S_MAX_PER_PAGE = 50; // limite documentado da API (perpage máx.)

export function loadC2sEnv(processEnv = process.env) {
  return {
    baseUrl: (processEnv.C2S_BASE_URL || 'https://api.contact2sale.com/integration').replace(/\/+$/, ''),
    retries: num(processEnv.C2S_HTTP_RETRIES, 3),
    backoffMs: num(processEnv.C2S_HTTP_BACKOFF_MS, 500),
    timeoutMs: num(processEnv.C2S_HTTP_TIMEOUT_MS, 15000),
    breakerThreshold: num(processEnv.C2S_BREAKER_THRESHOLD, 5),
    breakerCooldownMs: num(processEnv.C2S_BREAKER_COOLDOWN_MS, 60000),
    // Teto do respeito ao Retry-After: a C2S pede "1 minute" no 429; esperamos até
    // 65s. Cap evita um Retry-After absurdo do servidor prender o worker.
    maxRetryAfterMs: num(processEnv.C2S_MAX_RETRY_AFTER_MS, 65000),
    // Clamp ≥1: rate/burst 0 travaria o waitForToken em loop infinito.
    ratePerMin: Math.max(1, num(processEnv.C2S_RATE_PER_MIN, 10)),
    burst: Math.max(1, num(processEnv.C2S_BURST, 5)),
    perPage: Math.min(num(processEnv.C2S_PER_PAGE, C2S_MAX_PER_PAGE), C2S_MAX_PER_PAGE),
    overlapMin: num(processEnv.C2S_SYNC_OVERLAP_MIN, 5),
    // Janela de REVISITA: no LIVE, o piso de criação recua até `agora − revisitDays`
    // para re-buscar leads antigos e capturar updates de campos (ex.: prop_ref
    // preenchido depois da criação). A API C2S não filtra por data de update
    // (só created_lt), então re-varrer por created_at é a única forma. Custo baixo:
    // o fingerprint dedupa o que não mudou. Default global; a imobiliária pode
    // sobrescrever via coluna revisit_days em tenant_contact2sale_config. 0 = desliga.
    revisitDays: Math.max(0, num(processEnv.C2S_REVISIT_DAYS, 7)),
    // Cadência da REVISITA (minutos): de quanto em quanto tempo o LIVE recua
    // revisitDays para re-capturar updates tardios (ex.: prop_ref). A ROTINA
    // (todo tick de 1min) usa só o overlap — a revisita de N dias fora dessa
    // cadência estouraria o rate limit da C2S (429, incidente 2026-07-21).
    // Clamp ≥1: 0 faria toda rotina virar revisita (o problema original).
    revisitIntervalMin: Math.max(1, num(processEnv.C2S_REVISIT_INTERVAL_MIN, 60)),
    // A cada 1 min (granularidade mínima do cron): lead novo na C2S aparece no
    // CRM em ~1 min. O runner por-tenant pula quem já está em ciclo, então ticks
    // frequentes durante um backfill longo não empilham chamadas. Latência de
    // segundos só com webhook (fase F6). Override por C2S_SYNC_SCHEDULER_CRON.
    cron: processEnv.C2S_SYNC_SCHEDULER_CRON || '*/1 * * * *',
  };
}
