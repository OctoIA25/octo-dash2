/**
 * Ponto único de import do módulo Meta Lead Ads. Os entrypoints não devem
 * conhecer a estrutura interna da pasta.
 */
import { registerMetaConfigRoutes } from './configRoutes.js';
import { registerMetaWebhookRoutes } from './webhookRoutes.js';
import { registerMetaFormRoutes } from './formRoutes.js';
import { registerMetaInsightsRoutes } from '../metaInsights/routes.js';
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
  // P2.7 — entra aqui, e não nos entrypoints: eles já registram este módulo
  // nos dois lugares, e mexer neles de novo é uma chance a mais de a rota
  // existir em dev e dar 404 em produção.
  registerMetaFormRoutes(app, supabase, { ...options, configResolver: resolver });
  // P3.5 — entra aqui pelo mesmo motivo do P2.7: os entrypoints já chamam esta
  // função nos dois lugares, e mexer neles de novo é uma chance a mais de a
  // rota existir em dev e dar 404 em produção.
  registerMetaInsightsRoutes(app, supabase, { ...options, configResolver: resolver });
}
