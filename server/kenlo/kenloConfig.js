/**
 * Configuração estática do módulo Kenlo: mapa idMediaOrigin→portal e parsing de env.
 * Sem lógica de negócio. Mapa idêntico ao do frontend (kenloLeadsService.ts) para
 * manter paridade de nomes de portal.
 */
export const PORTAL_CODE_TO_NAME = {
  8: 'Site',
  12: 'Imóvel Web',
  512: 'Chaves na Mão',
  1546: 'Cliquei Mudei',
  1834: 'Portal Kenlo',
};

export const MEDIA_ORIGINS = [8, 12, 512, 1546, 1834];

export function portalNameFor(code) {
  const n = typeof code === 'string' ? Number(code) : code;
  if (Number.isFinite(n) && PORTAL_CODE_TO_NAME[n]) return PORTAL_CODE_TO_NAME[n];
  return `Portal ${code}`;
}

const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export function loadKenloEnv(processEnv = process.env) {
  return {
    retries: num(processEnv.KENLO_HTTP_RETRIES, 3),
    backoffMs: num(processEnv.KENLO_HTTP_BACKOFF_MS, 500),
    timeoutMs: num(processEnv.KENLO_HTTP_TIMEOUT_MS, 15000),
    breakerThreshold: num(processEnv.KENLO_BREAKER_THRESHOLD, 5),
    breakerCooldownMs: num(processEnv.KENLO_BREAKER_COOLDOWN_MS, 60000),
    ratePerSec: num(processEnv.KENLO_RATE_PER_SEC, 5),
    burst: num(processEnv.KENLO_BURST, 10),
    perPage: num(processEnv.KENLO_PER_PAGE, 200),
    fullSyncTtlMs: num(processEnv.KENLO_FULL_SYNC_TTL_MS, 60 * 60 * 1000),
    liaWebhookUrl: processEnv.KENLO_LIA_WEBHOOK_URL || '',
    cron: processEnv.KENLO_SYNC_SCHEDULER_CRON || '*/3 * * * *',
  };
}
