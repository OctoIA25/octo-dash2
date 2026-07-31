/**
 * Resolve a config da Anthropic por tenant (molde do resolver da C2S). Banco
 * (tenant_anthropic_config) é a ÚNICA fonte: admin API key cifrada (AES-256-GCM),
 * decifrada aqui — único ponto que vê o segredo em claro. Sem fallback por ENV.
 */
import { encryptSecret, decryptSecret, hasEncryptionKey } from '../recommendations/crypto.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const TABLE = 'tenant_anthropic_config';
const CACHE_TTL_MS = 10_000;

export function createAnthropicConfigResolver({ supabase, processEnv = process.env, logger = noopLogger, now = Date.now }) {
  const cache = new Map(); // tenantId → { value, cachedAt }

  function decryptOrNull(encrypted) {
    if (!encrypted || !hasEncryptionKey(processEnv)) return null;
    try { return decryptSecret(encrypted, processEnv); } catch { return null; }
  }

  async function resolveConfig(tenantId) {
    const hit = cache.get(tenantId);
    if (hit && now() - hit.cachedAt < CACHE_TTL_MS) return hit.value;

    const { data, error } = await supabase
      .from(TABLE).select('*').eq('tenant_id', tenantId).maybeSingle();
    if (error) logger.warn(`[anthropic] erro lendo config tenant=${tenantId}: ${error.message}`);
    if (!data) return null;

    const resolved = {
      tenantId,
      apiKey: decryptOrNull(data.admin_api_key_encrypted),
      weeklyLimitUsd: data.weekly_limit_usd == null ? null : Number(data.weekly_limit_usd),
      status: data.status,
      lastSyncedAt: data.last_synced_at ?? null,
      alertThresholdBps: data.alert_threshold_bps == null ? 1430 : Number(data.alert_threshold_bps),
      lastAlertedAt: data.last_alerted_at ?? null,
      mode: data.mode || 'api',
    };
    cache.set(tenantId, { value: resolved, cachedAt: now() });
    return resolved;
  }

  async function saveConfig(tenantId, { apiKey, weeklyLimitUsd, status, alertThresholdBps, mode } = {}) {
    if (apiKey && !hasEncryptionKey(processEnv)) {
      return { ok: false, error: 'EMAIL_ENCRYPTION_KEY ausente — não é seguro salvar a API key' };
    }
    const payload = { tenant_id: tenantId, updated_at: new Date().toISOString() };
    if (status) payload.status = status;
    if (weeklyLimitUsd !== undefined) payload.weekly_limit_usd = weeklyLimitUsd;
    if (alertThresholdBps !== undefined) payload.alert_threshold_bps = alertThresholdBps;
    if (apiKey) payload.admin_api_key_encrypted = encryptSecret(apiKey, processEnv);

    if (mode !== undefined) {
      payload.mode = mode;
      // Troca de modo invalida o snapshot do modo anterior (o card não pode
      // exibir % de USD do modo API como se fosse % da assinatura, e vice-versa).
      const { data: cur } = await supabase.from(TABLE).select('mode').eq('tenant_id', tenantId).maybeSingle();
      if ((cur?.mode || 'api') !== mode) {
        Object.assign(payload, {
          status: 'not_configured', last_state: null, last_percentage: null,
          last_usage_usd: null, weekly_limit_usd: null, last_window_start: null,
          last_window_end: null, last_error: null, last_synced_at: null,
        });
      }
    }

    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'tenant_id' });
    if (error) return { ok: false, error: error.message };
    invalidate(tenantId);
    return { ok: true };
  }

  function invalidate(tenantId) { cache.delete(tenantId); }

  return { resolveConfig, saveConfig, invalidate };
}
