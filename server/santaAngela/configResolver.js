/**
 * Resolve a configuração da Santa Ângela por tenant.
 *
 * Banco (tenant_santa_angela_config) é a ÚNICA fonte: cada tenant tem a SUA
 * base_url e a SUA api_key (cifrada AES-256-GCM, decifrada aqui — único ponto
 * que vê o segredo em claro). Sem linha no banco → retorna null → o tenant não
 * sincroniza. Não há fallback global por ENV: uma key compartilhada faria um
 * tenant bater na API com a credencial de outro (vazamento entre tenants).
 * O service NUNCA conhece ENV: depende sempre deste resolver.
 *
 * Espelha o padrão de KenloAuthService (decrypt + cache Map por tenant).
 */
import { encryptSecret, decryptSecret, hasEncryptionKey } from '../recommendations/crypto.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const TABLE = 'tenant_santa_angela_config';

export function createSantaAngelaConfigResolver({ supabase, processEnv = process.env, logger = noopLogger }) {
  const cache = new Map(); // tenantId → resolved config (apenas configs do banco)

  function decryptOrNull(encrypted) {
    if (!encrypted || !hasEncryptionKey(processEnv)) return null;
    try { return decryptSecret(encrypted, processEnv); } catch { return null; }
  }

  async function resolveConfig(tenantId) {
    if (cache.has(tenantId)) return cache.get(tenantId);

    const { data, error } = await supabase
      .from(TABLE).select('*').eq('tenant_id', tenantId).maybeSingle();
    if (error) logger.warn(`[santa-angela] erro lendo config tenant=${tenantId}: ${error.message}`);

    if (data) {
      const resolved = {
        tenantId,
        baseUrl: data.base_url,
        apiKey: decryptOrNull(data.api_key_encrypted),
        status: data.status,
        source: 'db',
      };
      cache.set(tenantId, resolved); // só configs do banco entram em cache
      return resolved;
    }
    // Sem config no banco (ou erro transitório): NÃO cacheia o negativo, para que
    // um tenant recém-cadastrado seja resolvido na próxima chamada (inclusive em
    // outra instância) e um erro de banco não prenda o tenant em "sem config".
    return null;
  }

  async function saveConfig(tenantId, { baseUrl, apiKey, status = 'active' }) {
    if (!hasEncryptionKey(processEnv)) {
      return { ok: false, error: 'EMAIL_ENCRYPTION_KEY ausente — não é seguro salvar a api_key' };
    }
    const payload = {
      tenant_id: tenantId,
      base_url: baseUrl,
      status,
      updated_at: new Date().toISOString(),
    };
    if (apiKey) payload.api_key_encrypted = encryptSecret(apiKey, processEnv);

    const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'tenant_id' });
    if (error) return { ok: false, error: error.message };
    invalidate(tenantId);
    return { ok: true };
  }

  function invalidate(tenantId) { cache.delete(tenantId); }

  return { resolveConfig, saveConfig, invalidate };
}
