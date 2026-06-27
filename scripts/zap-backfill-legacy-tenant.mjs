/**
 * Backfill de UM tenant legado do ZAP para tenant_zap_config, reusando o secret
 * que hoje vive no .env (ZAPIMOVEIS_*). Gera o SQL idempotente (ON CONFLICT) pronto
 * para colar no Supabase. Não escreve no banco — só imprime o SQL para você revisar.
 *
 * Por que um script e não SQL puro: o feed_secret precisa ser cifrado (AES-256-GCM)
 * e indexado por HMAC (feed_secret_lookup), ambos derivados de EMAIL_ENCRYPTION_KEY.
 * Isso só pode ser calculado com os MESMOS helpers do servidor — daí este script.
 *
 * Uso (a partir da raiz do repo, com o .env carregado no ambiente):
 *   node --env-file=.env scripts/zap-backfill-legacy-tenant.mjs
 */
import { encryptSecret, hasEncryptionKey } from '../server/recommendations/crypto.js';
import { computeSecretLookup } from '../server/zap/secretLookup.js';

const env = process.env;

const tenantId = env.ZAPIMOVEIS_TENANT_ID || env.OLX_TENANT_ID;
const secret = env.ZAPIMOVEIS_FEED_SECRET || env.ZAPIMOVEIS_WEBHOOK_SECRET || env.OLX_FEED_SECRET;

if (!hasEncryptionKey(env)) {
  console.error('ERRO: EMAIL_ENCRYPTION_KEY ausente — não dá para cifrar o secret. Aborte.');
  process.exit(1);
}
if (!tenantId || !secret) {
  console.error('ERRO: ZAPIMOVEIS_TENANT_ID e/ou ZAPIMOVEIS_FEED_SECRET/WEBHOOK_SECRET ausentes no ambiente.');
  process.exit(1);
}

const encrypted = encryptSecret(secret, env);
const lookup = computeSecretLookup(secret, env);

// Escapa apóstrofo para o literal SQL.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Campos não-secretos: só inserimos se existirem no .env; senão deixamos os DEFAULT
// da migration/merge cuidarem (provider='OctoDash', contato padrão, etc.).
const cols = ['tenant_id', 'status', 'feed_secret_encrypted', 'feed_secret_lookup'];
const vals = [q(tenantId), q('active'), q(encrypted), q(lookup)];
const optional = {
  provider: env.ZAPIMOVEIS_PROVIDER,
  contact_name: env.ZAPIMOVEIS_CONTACT_NAME,
  contact_email: env.ZAPIMOVEIS_CONTACT_EMAIL,
  contact_phone: env.ZAPIMOVEIS_CONTACT_PHONE,
  publication_type: env.ZAPIMOVEIS_PUBLICATION_TYPE,
  detail_base_url: env.ZAPIMOVEIS_DETAIL_BASE_URL || env.PUBLIC_APP_URL,
  resync_url: env.ZAPIMOVEIS_RESYNC_URL,
};
for (const [col, val] of Object.entries(optional)) {
  if (val) { cols.push(col); vals.push(q(val)); }
}

const updates = cols
  .filter((c) => c !== 'tenant_id')
  .map((c) => `${c} = EXCLUDED.${c}`)
  .join(',\n  ');

const sql = `-- Backfill ZAP do tenant legado ${tenantId} (idempotente).
-- Reusa o secret atual do .env: a ZAP NÃO precisa reconfigurar a URL/secret.
-- Após aplicar e validar o feed, o fallback .env pode ser removido com segurança.
INSERT INTO public.tenant_zap_config (${cols.join(', ')})
VALUES (${vals.join(', ')})
ON CONFLICT (tenant_id) DO UPDATE SET
  ${updates},
  updated_at = now();
`;

console.log(sql);
