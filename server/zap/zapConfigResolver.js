/**
 * Resolve a configuração da ZAP Imóveis por tenant.
 *
 * Banco (tenant_zap_config) é a ÚNICA fonte: cada tenant tem o SEU feed_secret e
 * o SEU contato/resync. O secret vive cifrado (AES-256-GCM); este é o único ponto
 * que o vê em claro. Há DOIS modos de resolução:
 *   - resolveByTenant(id): usado por rotas internas que já sabem o tenant.
 *   - resolveBySecret(secret): usado pelo feed/webhook, que chegam só com o secret.
 *     O lookup é por HMAC determinístico (secretLookup.js), O(1) via índice.
 *
 * Cache: Map por processo, positivo, sem TTL — espelha o configResolver.js da SA.
 * Mudança via saveConfig/rotateSecret invalida explicitamente. Sem cache negativo:
 * tenant recém-cadastrado (ou erro transitório) é re-resolvido na próxima chamada.
 *
 * ponytail: cache Map por processo sem TTL; se multi-instância + rotação frequente
 * virar problema, evoluir p/ TTL curto ou Postgres LISTEN/NOTIFY. Hoje desnecessário.
 */
import { encryptSecret, decryptSecret, hasEncryptionKey } from '../recommendations/crypto.js';
import { computeSecretLookup, generateFeedSecret } from './secretLookup.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const TABLE = 'tenant_zap_config';

export function createZapConfigResolver({ supabase, processEnv = process.env, logger = noopLogger }) {
  const byTenant = new Map();       // tenantId → resolved config
  const bySecretLookup = new Map(); // feed_secret_lookup → tenantId

  function decryptOrNull(encrypted) {
    if (!encrypted || !hasEncryptionKey(processEnv)) return null;
    try { return decryptSecret(encrypted, processEnv); } catch { return null; }
  }

  // Mapeia a linha do banco → config de domínio (segredos já descifrados).
  function toConfig(data) {
    return {
      tenantId: data.tenant_id,
      status: data.status,
      feedSecret: decryptOrNull(data.feed_secret_encrypted),
      resyncToken: decryptOrNull(data.resync_token_encrypted),
      provider: data.provider || 'OctoDash',
      contactName: data.contact_name || null,
      contactEmail: data.contact_email || null,
      contactPhone: data.contact_phone || null,
      publicationType: data.publication_type || 'STANDARD',
      detailBaseUrl: data.detail_base_url || null,
      resyncUrl: data.resync_url || null,
      hideComplement: data.hide_complement === true,
      secretLookup: data.feed_secret_lookup || null,
      source: 'db',
    };
  }

  function cache(config) {
    byTenant.set(config.tenantId, config);
    if (config.secretLookup) bySecretLookup.set(config.secretLookup, config.tenantId);
  }

  async function fetchRow(column, value) {
    const { data, error } = await supabase
      .from(TABLE).select('*').eq(column, value).maybeSingle();
    if (error) logger.warn(`[zap] erro lendo config ${column}=${value}: ${error.message}`);
    return data || null;
  }

  async function resolveByTenant(tenantId) {
    if (byTenant.has(tenantId)) return byTenant.get(tenantId);
    const data = await fetchRow('tenant_id', tenantId);
    if (!data) return null; // sem cache negativo
    const config = toConfig(data);
    cache(config);
    return config;
  }

  async function resolveBySecret(secret) {
    if (!secret || !hasEncryptionKey(processEnv)) return null;
    let lookup;
    try { lookup = computeSecretLookup(secret, processEnv); } catch { return null; }

    if (bySecretLookup.has(lookup)) {
      return byTenant.get(bySecretLookup.get(lookup)) || null;
    }
    const data = await fetchRow('feed_secret_lookup', lookup);
    if (!data) return null; // secret desconhecido/forjado → não resolve ninguém
    const config = toConfig(data);
    cache(config);
    return config;
  }

  async function saveConfig(tenantId, fields = {}) {
    if (!hasEncryptionKey(processEnv)) {
      return { ok: false, error: 'EMAIL_ENCRYPTION_KEY ausente — não é seguro salvar o secret' };
    }
    const payload = { tenant_id: tenantId, updated_at: new Date().toISOString() };

    // Metadados não-secretos: só grava o que foi enviado (edição parcial).
    const map = {
      status: 'status', provider: 'provider', contactName: 'contact_name',
      contactEmail: 'contact_email', contactPhone: 'contact_phone',
      publicationType: 'publication_type', detailBaseUrl: 'detail_base_url',
      resyncUrl: 'resync_url', hideComplement: 'hide_complement',
    };
    for (const [k, col] of Object.entries(map)) {
      if (fields[k] !== undefined) payload[col] = fields[k];
    }

    // Segredos: só tocados quando explicitamente enviados.
    if (fields.feedSecret) {
      payload.feed_secret_encrypted = encryptSecret(fields.feedSecret, processEnv);
      payload.feed_secret_lookup = computeSecretLookup(fields.feedSecret, processEnv);
    }
    if (fields.resyncToken !== undefined) {
      payload.resync_token_encrypted = fields.resyncToken
        ? encryptSecret(fields.resyncToken, processEnv) : null;
    }

    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'tenant_id' });
    if (error) return { ok: false, error: error.message };
    invalidate(tenantId);
    return { ok: true };
  }

  // Gera novo secret, cifra+lookup, invalida cache; o antigo deixa de resolver.
  async function rotateSecret(tenantId) {
    const secret = generateFeedSecret();
    const res = await saveConfig(tenantId, { feedSecret: secret });
    if (!res.ok) return res;
    return { ok: true, secret };
  }

  function invalidate(tenantId) {
    const cached = byTenant.get(tenantId);
    if (cached?.secretLookup) bySecretLookup.delete(cached.secretLookup);
    byTenant.delete(tenantId);
  }

  // Observabilidade best-effort: marca last_feed_at/last_lead_at. Não invalida o
  // cache (timestamps não afetam a config resolvida) e nunca derruba o request.
  async function touch(tenantId, column) {
    if (column !== 'last_feed_at' && column !== 'last_lead_at') return;
    try {
      await supabase.from(TABLE)
        .update({ [column]: new Date().toISOString() })
        .eq('tenant_id', tenantId);
    } catch (e) { logger.warn(`[zap] touch ${column} falhou tenant=${tenantId}: ${e.message}`); }
  }

  return { resolveByTenant, resolveBySecret, saveConfig, rotateSecret, invalidate, touch };
}
