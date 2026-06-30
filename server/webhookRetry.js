// Lógica de retry da outbox de webhooks. Pura e isolada para ser testável
// sem subir o poller inteiro (que vive em proxy-production.js e só roda em prod).

export const MAX_WEBHOOK_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 30_000;        // 30s
const BACKOFF_MAX_MS = 60 * 60 * 1000; // 1h

// attempts = nº de tentativas já realizadas (>=1 ao calcular o próximo agendamento).
export function computeNextAttempt(attempts, nowMs) {
  const delay = Math.min(2 ** attempts * BACKOFF_BASE_MS, BACKOFF_MAX_MS);
  return new Date(nowMs + delay).toISOString();
}
