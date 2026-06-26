/**
 * Obtém e renova o token JWT do painel de leads do Kenlo, por tenant.
 *
 * O login real é multi-etapa e baseado em browser (ver puppeteerLoginDriver e o
 * spike no spec): por isso o `loginDriver` é injetável — testes usam um fake.
 * Credenciais e token vivem cifrados (AES-256-GCM) em kenlo_integrations; este é
 * o ÚNICO componente que vê segredo em claro.
 */
import { encryptSecret, decryptSecret, hasEncryptionKey } from '../recommendations/crypto.js';
import { tokenFingerprint } from './leadNormalizer.js';

const noopLogger = { info() {}, warn() {}, error() {} };

export function createKenloAuthService({ supabase, loginDriver, processEnv = process.env, logger = noopLogger }) {
  const cache = new Map(); // tenantId → token

  function decryptOrPlain(encrypted, plain) {
    if (encrypted && hasEncryptionKey(processEnv)) {
      try { return decryptSecret(encrypted, processEnv); } catch { /* cai p/ plano */ }
    }
    return plain || null;
  }

  function getCredentials(integration) {
    const email = integration.kenlo_email || null;
    const password = decryptOrPlain(integration.kenlo_password_encrypted, integration.kenlo_password);
    return { email, password };
  }

  async function persist(tenantId, payload) {
    const { error } = await supabase
      .from('kenlo_integrations')
      .update(payload)
      .eq('tenant_id', tenantId);
    if (error) logger.warn(`[kenlo] persist falhou tenant=${tenantId}: ${error.message}`);
  }

  async function refresh(integration) {
    const tenantId = integration.tenant_id;
    const { email, password } = getCredentials(integration);
    if (!email || !password) throw new Error('credenciais Kenlo ausentes');

    const token = await loginDriver.login(email, password);
    if (!token || typeof token !== 'string') throw new Error('login Kenlo não retornou token');

    cache.set(tenantId, token);

    const payload = {};
    if (hasEncryptionKey(processEnv)) {
      payload.auth_token_encrypted = encryptSecret(token, processEnv);
      // migração preguiçosa: se a senha veio plana, regrava cifrada
      if (!integration.kenlo_password_encrypted && integration.kenlo_password) {
        payload.kenlo_password_encrypted = encryptSecret(integration.kenlo_password, processEnv);
      }
    }
    if (Object.keys(payload).length) await persist(tenantId, payload);

    logger.info(`[kenlo] {"event":"kenlo.auth.refresh","tenantId":"${tenantId}","token":"${tokenFingerprint(token)}"}`);
    return token;
  }

  async function getToken(integration) {
    const tenantId = integration.tenant_id;
    if (cache.has(tenantId)) return cache.get(tenantId);
    const persisted = decryptOrPlain(integration.auth_token_encrypted, integration.auth_token);
    if (persisted) { cache.set(tenantId, persisted); return persisted; }
    return refresh(integration);
  }

  return { getToken, refresh, getCredentials };
}
