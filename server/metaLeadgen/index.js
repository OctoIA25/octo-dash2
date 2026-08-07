/**
 * Ponto único de import do módulo Meta Lead Ads. Os entrypoints não devem
 * conhecer a estrutura interna da pasta.
 */
import { registerMetaConfigRoutes } from './configRoutes.js';
import { registerMetaWebhookRoutes } from './webhookRoutes.js';
import { createMetaConfigResolver } from './configResolver.js';

export { createMetaConfigResolver } from './configResolver.js';
export { createMetaLeadgenProcessor } from './processor.js';
export { startMetaLeadgenScheduler } from './scheduler.js';

export function registerMetaLeadgenRoutes(app, supabase, options = {}) {
  // Resolver compartilhado entre config e webhook: o cache por tenant só serve
  // se for o mesmo objeto nos dois lados.
  const resolver = options.resolver || createMetaConfigResolver({ supabase });
  registerMetaConfigRoutes(app, supabase, { ...options, resolver });
  registerMetaWebhookRoutes(app, supabase, { ...options, resolver });
}
