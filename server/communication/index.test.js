import { describe, it, expect } from 'vitest';
import { registerCommunicationRoutes } from './index.js';
import { registerAgentActionRoutes } from '../agent-actions/routes.js';

/**
 * Fake Express app que apenas registra as rotas (método + caminho + handler).
 * Não executa nada — só queremos verificar QUE rotas foram montadas.
 */
function makeFakeApp() {
  const routes = [];
  const record = (method) => (path, ...handlers) => {
    routes.push({ method, path, handler: handlers[handlers.length - 1] });
  };
  return { app: { post: record('POST'), get: record('GET'), put: record('PUT'), delete: record('DELETE') }, routes };
}

// supabase/options não são exercitados aqui (não chamamos os handlers); makeDispatchDeps
// só precisa não quebrar ao montar. Passamos um schedulerDeps fake p/ evitar I/O.
const supabase = {};
const options = { schedulerDeps: { deliver: () => {}, getEnvironment: () => ({}) } };

const EXPECTED = [
  { method: 'POST', path: '/api/v1/communication/dispatch/preview' },
  { method: 'POST', path: '/api/v1/communication/dispatch/confirm' },
  { method: 'GET', path: '/api/v1/communication/dispatch/runs/:id' },
  { method: 'POST', path: '/api/v1/communication/dispatch/run-queue' },
  { method: 'GET', path: '/api/v1/communication/dispatch/runs' },
  { method: 'GET', path: '/api/v1/communication/dispatch/runs/:id/progress' },
  { method: 'GET', path: '/api/v1/communication/dispatch/audiences' },
  { method: 'POST', path: '/api/v1/communication/dispatch/audiences' },
  { method: 'PUT', path: '/api/v1/communication/dispatch/audiences/:id' },
  { method: 'DELETE', path: '/api/v1/communication/dispatch/audiences/:id' },
  { method: 'GET', path: '/api/v1/communication/dispatch/audiences/:id/count' },
  { method: 'GET', path: '/api/v1/communication/dispatch/templates' },
  { method: 'POST', path: '/api/v1/communication/dispatch/templates' },
  { method: 'PUT', path: '/api/v1/communication/dispatch/templates/:id' },
  { method: 'DELETE', path: '/api/v1/communication/dispatch/templates/:id' },
  { method: 'POST', path: '/api/v1/communication/dispatch/templates/:id/submit' },
  { method: 'POST', path: '/api/v1/communication/dispatch/templates/:id/refresh-status' },
  { method: 'GET', path: '/api/v1/communication/dispatch/campaigns' },
  { method: 'POST', path: '/api/v1/communication/dispatch/campaigns' },
  { method: 'PUT', path: '/api/v1/communication/dispatch/campaigns/:id' },
  { method: 'DELETE', path: '/api/v1/communication/dispatch/campaigns/:id' },
];

describe('registerCommunicationRoutes', () => {
  it('registra os 21 endpoints sob /api/v1/communication/dispatch', () => {
    const { app, routes } = makeFakeApp();
    registerCommunicationRoutes(app, supabase, options);

    for (const exp of EXPECTED) {
      const found = routes.find((r) => r.method === exp.method && r.path === exp.path);
      expect(found, `rota ${exp.method} ${exp.path} não registrada`).toBeTruthy();
      expect(typeof found.handler).toBe('function');
    }
    // Exatamente 21 rotas (nem a mais, nem a menos).
    expect(routes).toHaveLength(21);
  });

  it('alias e caminho legado coexistem com os MESMOS sufixos de rota', () => {
    const { app, routes } = makeFakeApp();
    registerAgentActionRoutes(app, supabase, options);
    registerCommunicationRoutes(app, supabase, options);

    const paths = routes.map((r) => `${r.method} ${r.path}`);
    // Caminho legado intacto:
    expect(paths).toContain('POST /api/v1/agent-actions/preview');
    expect(paths).toContain('POST /api/v1/agent-actions/confirm');
    expect(paths).toContain('GET /api/v1/agent-actions/runs/:id');
    expect(paths).toContain('POST /api/v1/agent-actions/run-queue');
    expect(paths).toContain('GET /api/v1/agent-actions/runs');
    expect(paths).toContain('GET /api/v1/agent-actions/runs/:id/progress');
    expect(paths).toContain('GET /api/v1/agent-actions/audiences');
    expect(paths).toContain('POST /api/v1/agent-actions/audiences');
    expect(paths).toContain('PUT /api/v1/agent-actions/audiences/:id');
    expect(paths).toContain('DELETE /api/v1/agent-actions/audiences/:id');
    expect(paths).toContain('GET /api/v1/agent-actions/audiences/:id/count');
    expect(paths).toContain('GET /api/v1/agent-actions/templates');
    expect(paths).toContain('POST /api/v1/agent-actions/templates');
    expect(paths).toContain('PUT /api/v1/agent-actions/templates/:id');
    expect(paths).toContain('DELETE /api/v1/agent-actions/templates/:id');
    expect(paths).toContain('POST /api/v1/agent-actions/templates/:id/submit');
    expect(paths).toContain('POST /api/v1/agent-actions/templates/:id/refresh-status');
    expect(paths).toContain('GET /api/v1/agent-actions/campaigns');
    expect(paths).toContain('POST /api/v1/agent-actions/campaigns');
    expect(paths).toContain('PUT /api/v1/agent-actions/campaigns/:id');
    expect(paths).toContain('DELETE /api/v1/agent-actions/campaigns/:id');
    // Alias novo:
    expect(paths).toContain('POST /api/v1/communication/dispatch/preview');
    expect(paths).toContain('POST /api/v1/communication/dispatch/confirm');
    expect(paths).toContain('GET /api/v1/communication/dispatch/runs/:id');
    expect(paths).toContain('POST /api/v1/communication/dispatch/run-queue');
    expect(paths).toContain('GET /api/v1/communication/dispatch/runs');
    expect(paths).toContain('GET /api/v1/communication/dispatch/runs/:id/progress');
    expect(paths).toContain('GET /api/v1/communication/dispatch/audiences');
    expect(paths).toContain('POST /api/v1/communication/dispatch/audiences');
    expect(paths).toContain('PUT /api/v1/communication/dispatch/audiences/:id');
    expect(paths).toContain('DELETE /api/v1/communication/dispatch/audiences/:id');
    expect(paths).toContain('GET /api/v1/communication/dispatch/audiences/:id/count');
    expect(paths).toContain('GET /api/v1/communication/dispatch/templates');
    expect(paths).toContain('POST /api/v1/communication/dispatch/templates');
    expect(paths).toContain('PUT /api/v1/communication/dispatch/templates/:id');
    expect(paths).toContain('DELETE /api/v1/communication/dispatch/templates/:id');
    expect(paths).toContain('POST /api/v1/communication/dispatch/templates/:id/submit');
    expect(paths).toContain('POST /api/v1/communication/dispatch/templates/:id/refresh-status');
    expect(paths).toContain('GET /api/v1/communication/dispatch/campaigns');
    expect(paths).toContain('POST /api/v1/communication/dispatch/campaigns');
    expect(paths).toContain('PUT /api/v1/communication/dispatch/campaigns/:id');
    expect(paths).toContain('DELETE /api/v1/communication/dispatch/campaigns/:id');
    // 21 + 21, sem duplicação acidental.
    expect(routes).toHaveLength(42);
  });
});
