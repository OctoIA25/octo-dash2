/**
 * Sync Kenlo = engine genérico de CRM (server/crmSync/engine.js) + provider
 * Kenlo (./provider.js). Este arquivo existe para manter a API pública
 * histórica (createKenloSyncService) — scheduler, runner, rotas e testes não
 * mudam. A lógica compartilhada (fingerprint gate, split insert/update, upsert
 * idempotente, sync_state, soft-delete, isolamento por tenant) vive no engine;
 * o que é do Kenlo (portais, janela por criação, merge CRM-vence) vive no
 * provider.
 *
 * `fetchImpl` permanece aceito por compatibilidade e segue INTENCIONALMENTE
 * sem uso: o disparo da Lia é via outbox (trigger DB), nunca inline no sync.
 */
import { createCrmSyncEngine } from '../crmSync/engine.js';
import { createKenloProvider } from './provider.js';

export function createKenloSyncService({
  supabase, leadService, brokerAssigner, processEnv = process.env,
  fetchImpl = fetch, logger, runId = 'kenlo', now = Date.now, // eslint-disable-line no-unused-vars
}) {
  const provider = createKenloProvider({ leadService, brokerAssigner, processEnv, now });
  return createCrmSyncEngine({ supabase, provider, logger, runId, now });
}
