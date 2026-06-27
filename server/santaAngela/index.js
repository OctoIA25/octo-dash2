/** Ponto de entrada do módulo Santa Ângela: rotas + scheduler/runner. */
export { registerSantaAngelaRoutes } from './routes.js';
export { startSantaAngelaScheduler, makeSantaAngelaRunner } from './scheduler.js';
export { createSantaAngelaRunner } from './syncRunner.js';
