/**
 * 🌐 Rotas do módulo Comunicação.
 *
 * Expõe o Disparador sob o prefixo do módulo (/api/v1/communication/dispatch/*),
 * REUSANDO os mesmos handlers do Agente Disparador (server/agent-actions/routes.js).
 * Não há duplicação de lógica: `registerDispatchRoutes` registra os 4 endpoints
 * sob o prefixo informado; aqui só passamos o prefixo do módulo Comunicação.
 *
 * O caminho legado /api/v1/agent-actions/* segue registrado por
 * registerAgentActionRoutes (compatibilidade) — os dois prefixos compartilham
 * exatamente os mesmos handlers.
 */

import { registerDispatchRoutes, makeDispatchDeps } from '../agent-actions/routes.js';

/**
 * Monta as rotas-alias de comunicação:
 *   POST /api/v1/communication/dispatch/preview
 *   POST /api/v1/communication/dispatch/confirm
 *   GET  /api/v1/communication/dispatch/runs/:id
 *   POST /api/v1/communication/dispatch/run-queue
 *
 * @param app      instância Express
 * @param supabase client (service_role)
 * @param options  { disparadorWebhookUrl?, schedulerDeps?, ... } (mesmo de agent-actions)
 */
export function registerCommunicationRoutes(app, supabase, options = {}) {
  registerDispatchRoutes(
    app,
    '/api/v1/communication/dispatch',
    supabase,
    options,
    makeDispatchDeps(supabase, options),
  );
}
