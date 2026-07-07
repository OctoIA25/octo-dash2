/**
 * Resolve a configuração da Contact2Sale por tenant (espelha o resolver da
 * Santa Ângela). Banco (tenant_contact2sale_config) é a ÚNICA fonte: token por
 * tenant, apenas cifrado (AES-256-GCM), decifrado aqui — único ponto que vê o
 * segredo em claro. Sem linha → null → tenant não sincroniza. Sem fallback por
 * ENV (token compartilhado vazaria dados entre tenants).
 */
import { encryptSecret, decryptSecret, hasEncryptionKey } from '../recommendations/crypto.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const TABLE = 'tenant_contact2sale_config';

// Diferente do espelho Santa Ângela, esta config TEM escritor externo ao
// resolver: o trigger de exclusividade (20260706_provider_exclusivity) seta
// status='inactive' quando o Kenlo é ativado. Cache com TTL curto (padrão 10s
// dos workers do outbox) para o status não ficar obsoleto até um restart.
const CACHE_TTL_MS = 10_000;

export function createC2sConfigResolver({ supabase, processEnv = process.env, logger = noopLogger, now = Date.now }) {
  const cache = new Map(); // tenantId → { value, cachedAt } (somente configs do banco)

  function decryptOrNull(encrypted) {
    if (!encrypted || !hasEncryptionKey(processEnv)) return null;
    try { return decryptSecret(encrypted, processEnv); } catch { return null; }
  }

  async function resolveConfig(tenantId) {
    const hit = cache.get(tenantId);
    if (hit && now() - hit.cachedAt < CACHE_TTL_MS) return hit.value;

    const { data, error } = await supabase
      .from(TABLE).select('*').eq('tenant_id', tenantId).maybeSingle();
    if (error) logger.warn(`[contact2sale] erro lendo config tenant=${tenantId}: ${error.message}`);

    if (data) {
      const resolved = {
        tenantId,
        apiToken: decryptOrNull(data.api_token_encrypted),
        status: data.status,
        source: 'db',
      };
      cache.set(tenantId, { value: resolved, cachedAt: now() });
      return resolved;
    }
    // Sem config (ou erro transitório): NÃO cacheia o negativo — tenant recém-
    // cadastrado resolve na próxima chamada; erro de banco não prende o estado.
    return null;
  }

  async function saveConfig(tenantId, { apiToken, status } = {}) {
    if (apiToken && !hasEncryptionKey(processEnv)) {
      return { ok: false, error: 'EMAIL_ENCRYPTION_KEY ausente — não é seguro salvar o token' };
    }
    const payload = { tenant_id: tenantId, updated_at: new Date().toISOString() };
    if (status) payload.status = status;
    if (apiToken) payload.api_token_encrypted = encryptSecret(apiToken, processEnv);

    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'tenant_id' });
    if (error) return { ok: false, error: error.message };
    invalidate(tenantId);
    return { ok: true };
  }

  function invalidate(tenantId) { cache.delete(tenantId); }

  return { resolveConfig, saveConfig, invalidate };
}
