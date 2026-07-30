// server/anthropic/config.js
/** Config estática do scheduler Anthropic. Cron default: de hora em hora. */
export function loadAnthropicEnv(processEnv = process.env) {
  return {
    cron: processEnv.ANTHROPIC_USAGE_CRON || '0 * * * *',
  };
}
