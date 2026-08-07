/**
 * Configuração estática do módulo Meta Lead Ads. Só parsing de env — sem I/O,
 * para ser importável de qualquer lugar sem efeito colateral.
 *
 * META_GRAPH_VERSION é COMPARTILHADO com o WhatsApp (server/whatsapp/index.js):
 * é o mesmo Graph API, e versões divergentes entre módulos do mesmo app é
 * exatamente o tipo de descompasso que ninguém percebe até quebrar.
 */
const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export function loadMetaEnv(processEnv = process.env) {
  return {
    graphVersion: processEnv.META_GRAPH_VERSION || 'v21.0',
    timeoutMs: num(processEnv.META_HTTP_TIMEOUT_MS, 15000),
    // Clamp em 1: com retries=0 o laço de fetchLead não roda nenhuma vez e
    // devolveria `null` no lugar de um resultado — o chamador estoura.
    retries: Math.max(1, num(processEnv.META_HTTP_RETRIES, 3)),
    backoffMs: num(processEnv.META_HTTP_BACKOFF_MS, 500),
    // Teto de tentativas por evento: sem ele, um erro permanente que escapou da
    // classificação vira retry eterno ocupando a fila.
    maxAttempts: Math.max(1, num(processEnv.META_EVENT_MAX_ATTEMPTS, 8)),
    // Self-call em loopback: mesmo processo, sem sair para a rede, sem TLS.
    selfBaseUrl: processEnv.META_SELF_BASE_URL || `http://127.0.0.1:${num(processEnv.PORT, 8080)}`,
    batchSize: Math.max(1, num(processEnv.META_PROCESSOR_BATCH, 25)),
    cron: processEnv.META_PROCESSOR_CRON || '*/1 * * * *',
  };
}
