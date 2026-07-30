// server/anthropic/config.js
/**
 * Config estática do módulo Anthropic. Cron default: de hora em hora.
 * budgetUsd: teto semanal GLOBAL em USD (denominador do %) — a API da Anthropic
 * não expõe limite p/ conta não-Enterprise; 0/ausente = sem teto → insufficient_data.
 * alertEmail: destino do aviso do Owner (mesmo literal duplicado nos módulos
 * legados — ownerAuth.js não exporta a constante).
 */
const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export function loadAnthropicEnv(processEnv = process.env) {
  return {
    cron: processEnv.ANTHROPIC_USAGE_CRON || '0 * * * *',
    budgetUsd: num(processEnv.ANTHROPIC_WEEKLY_BUDGET_USD, 0),
    alertEmail: processEnv.ANTHROPIC_ALERT_EMAIL || 'octo.inteligenciaimobiliaria@gmail.com',
  };
}
