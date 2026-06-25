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
  return { app: { post: record('POST'), get: record('GET') }, routes };
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
];

describe('registerCommunicationRoutes', () => {
  it('registra os 6 endpoints sob /api/v1/communication/dispatch', () => {
    const { app, routes } = makeFakeApp();
    registerCommunicationRoutes(app, supabase, options);

    for (const exp of EXPECTED) {
      const found = routes.find((r) => r.method === exp.method && r.path === exp.path);
      expect(found, `rota ${exp.method} ${exp.path} não registrada`).toBeTruthy();
      expect(typeof found.handler).toBe('function');
    }
    // Exatamente 6 rotas (nem a mais, nem a menos).
    expect(routes).toHaveLength(6);
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
    // Alias novo:
    expect(paths).toContain('POST /api/v1/communication/dispatch/preview');
    expect(paths).toContain('POST /api/v1/communication/dispatch/confirm');
    expect(paths).toContain('GET /api/v1/communication/dispatch/runs/:id');
    expect(paths).toContain('POST /api/v1/communication/dispatch/run-queue');
    expect(paths).toContain('GET /api/v1/communication/dispatch/runs');
    expect(paths).toContain('GET /api/v1/communication/dispatch/runs/:id/progress');
    // 6 + 6, sem duplicação acidental.
    expect(routes).toHaveLength(12);
  });
});
