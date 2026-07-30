/**
 * Funções PURAS da integração Anthropic (sem I/O). Numerador = consumo de 7 dias
 * do cost_report (amount em centavos de USD). Denominador = weekly_limit_usd
 * configurado pelo Owner. Threshold comparado em basis points inteiros para
 * evitar comparação de float frágil.
 */

export const WEEKLY_USAGE_ALERT_THRESHOLD_BPS = 1430; // 14,30%

/** Soma results[].amount (centavos, string) de todos os buckets → USD (float). */
export function sumCostUsd(buckets) {
  let cents = 0;
  for (const b of buckets || []) {
    for (const r of b?.results || []) {
      const n = Number(r?.amount);
      if (Number.isFinite(n)) cents += n;
    }
  }
  return cents / 100;
}

/** current/limit*100 (2 casas). null se o limite não for número finito > 0. */
export function computePercentage(currentUsd, limitUsd) {
  const limit = Number(limitUsd);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.round((currentUsd / limit) * 100 * 100) / 100;
}

/** 'warning' se percentage ≥ 14,30% (via basis points inteiros), senão 'normal'. */
export function evaluateThreshold(percentage) {
  return Math.round(percentage * 100) >= WEEKLY_USAGE_ALERT_THRESHOLD_BPS ? 'warning' : 'normal';
}

/** Deriva o estado do DTO a partir da configuração e do resultado da chamada. */
export function classifyState({ hasKey, hasLimit, errorCode, percentage }) {
  if (!hasKey || !hasLimit) return 'not_configured';
  if (errorCode) return 'error';
  if (percentage == null) return 'insufficient_data';
  return evaluateThreshold(percentage);
}

/** Monta o DTO interno estável (independente do formato da Anthropic). */
export function buildUsageDto({ current, limit, percentage, state, window, fetchedAt }) {
  return {
    provider: 'anthropic',
    window,
    usage: { current, limit, percentage },
    status: state,
    fetchedAt,
  };
}
