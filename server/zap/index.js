/**
 * Ponto de entrada do módulo ZAP Imóveis multi-tenant.
 * Re-exporta o resolver, as rotas owner e os helpers de secret.
 */
export { createZapConfigResolver } from './zapConfigResolver.js';
export { registerZapRoutes } from './routes.js';
export { computeSecretLookup, generateFeedSecret } from './secretLookup.js';
export { extractZapPhotoUrls } from './feedPhotos.js';
