/**
 * Config do Meta Lead Ads por tenant. Banco é a ÚNICA fonte (sem fallback por
 * ENV — app secret compartilhado deixaria um tenant assinar webhook de outro).
 * Este é o único ponto que vê os segredos em claro.
 *
 * resolveByWebhookToken NÃO é cacheado de propósito: é o caminho quente do
 * webhook e um cache desatualizado manteria de pé uma integração já desativada.
 * O volume é de leads, não de requisições — a consulta extra não pesa.
 */
import { encryptSecret, decryptSecret, hasEncryptionKey } from '../recommendations/crypto.js';

const noopLogger = { info() {}, warn() {}, error() {} };
export const CONFIG_TABLE = 'tenant_meta_leadgen_config';
const TABLE = CONFIG_TABLE;
const CACHE_TTL_MS = 10_000;

export function createMetaConfigResolver({ supabase, processEnv = process.env, logger = noopLogger, now = Date.now }) {
  const cache = new Map(); // tenantId → { value, cachedAt }

  // `campo`/`tenantId` só para o log: sem eles o operador vê `appSecret: null` e
  // uma falha de assinatura lá na frente, sem nada ligando as duas coisas.
  // NUNCA loga o valor (cifrado ou em claro).
  function decryptOrNull(encrypted, campo, tenantId) {
    if (!encrypted) return null;
    if (!hasEncryptionKey(processEnv)) {
      logger.warn(`[meta-leadgen] EMAIL_ENCRYPTION_KEY ausente — ${campo} do tenant ${tenantId} indisponível`);
      return null;
    }
    try {
      return decryptSecret(encrypted, processEnv);
    } catch (e) {
      logger.warn(`[meta-leadgen] decifragem de ${campo} falhou para o tenant ${tenantId}: ${e?.message || 'erro'}`);
      return null;
    }
  }

  function shape(data) {
    return {
      tenantId: data.tenant_id,
      pageId: data.page_id,
      appSecret: decryptOrNull(data.app_secret_encrypted, 'app_secret', data.tenant_id),
      accessToken: decryptOrNull(data.system_user_token_encrypted, 'system_user_token', data.tenant_id),
      webhookToken: data.webhook_token,
      verifyToken: data.verify_token,
      status: data.status,
    };
  }

  async function fetchBy(column, value) {
    const { data, error } = await supabase.from(TABLE).select('*').eq(column, value).maybeSingle();
    if (error) { logger.warn(`[meta-leadgen] erro lendo config ${column}: ${error.message}`); return null; }
    return data ? shape(data) : null;
  }

  async function resolveByWebhookToken(webhookToken) {
    if (!webhookToken) return null;
    return fetchBy('webhook_token', webhookToken);
  }

  async function resolveByTenant(tenantId) {
    const hit = cache.get(tenantId);
    if (hit && now() - hit.cachedAt < CACHE_TTL_MS) return hit.value;
    const value = await fetchBy('tenant_id', tenantId);
    // Não cacheia o negativo: tenant recém-cadastrado resolve na próxima chamada.
    if (value) cache.set(tenantId, { value, cachedAt: now() });
    return value;
  }

  async function saveConfig(tenantId, { pageId, appSecret, accessToken, status } = {}) {
    if ((appSecret || accessToken) && !hasEncryptionKey(processEnv)) {
      return { ok: false, error: 'EMAIL_ENCRYPTION_KEY ausente — não é seguro salvar os segredos' };
    }
    const payload = { tenant_id: tenantId, updated_at: new Date(now()).toISOString() };
    if (pageId) payload.page_id = pageId;
    if (status) payload.status = status;
    if (appSecret) payload.app_secret_encrypted = encryptSecret(appSecret, processEnv);
    if (accessToken) payload.system_user_token_encrypted = encryptSecret(accessToken, processEnv);

    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'tenant_id' });
    if (error) return { ok: false, error: error.message };
    invalidate(tenantId);
    return { ok: true };
  }

  function invalidate(tenantId) { cache.delete(tenantId); }

  return { resolveByWebhookToken, resolveByTenant, saveConfig, invalidate };
}
