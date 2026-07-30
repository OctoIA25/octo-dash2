/**
 * Funções PURAS da integração Anthropic (sem I/O). Numerador = consumo de 7 dias
 * do cost_report (amount em centavos de USD). Denominador = ANTHROPIC_WEEKLY_BUDGET_USD
 * (env). Threshold comparado em basis points inteiros para evitar comparação de
 * float frágil.
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

/** 'warning' se percentage ≥ limiar (bps inteiros; default 14,30%), senão 'normal'. */
export function evaluateThreshold(percentage, thresholdBps = WEEKLY_USAGE_ALERT_THRESHOLD_BPS) {
  return Math.round(percentage * 100) >= thresholdBps ? 'warning' : 'normal';
}

/**
 * Deriva o estado do DTO. Fase 2: o denominador é o budget global de env
 * (hasBudget); sem key → not_configured; com key mas sem budget →
 * insufficient_data (a integração está configurada, falta o teto no env).
 */
export function classifyState({ hasKey, hasBudget, errorCode, percentage, thresholdBps }) {
  if (!hasKey) return 'not_configured';
  if (errorCode) return 'error';
  if (!hasBudget || percentage == null) return 'insufficient_data';
  return evaluateThreshold(percentage, thresholdBps);
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
