/**
 * Rotas owner-only da integração Santa Ângela: config (salvar/testar),
 * disparo de sync e status. Owner-guard espelha server/kenlo/routes.js.
 */
import { createSantaAngelaConfigResolver } from './configResolver.js';
import { createSantaAngelaApiClient } from './santaAngelaApiClient.js';
import { createSantaAngelaSyncService } from './santaAngelaSyncService.js';
import { createSantaAngelaRunner } from './syncRunner.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const CONFIG_TABLE = 'tenant_santa_angela_config';

function makeRequireOwner(supabase) {
  return async function requireOwner(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_authorization' });
      const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (error || !data?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
      if (!isPlatformOwner(data.user.email)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[santa-angela] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerSantaAngelaRoutes(app, supabase, options = {}) {
  const requireOwner = makeRequireOwner(supabase);
  const resolver = options.resolver || createSantaAngelaConfigResolver({ supabase });
  const apiClient = options.apiClient || createSantaAngelaApiClient({ resolver });
  const syncService = options.syncService || createSantaAngelaSyncService({ supabase, apiClient });
  // Runner compartilhado com o scheduler (mesma guarda de reentrância): o sync é
  // automático via cron; esta rota é disparo operacional/on-demand de um ciclo
  // COMPLETO (todos os tenants active), não um botão por-tenant na UI.
  const runner = options.runner || createSantaAngelaRunner(syncService);

  app.post('/api/v1/santa-angela/config', requireOwner, async (req, res) => {
    const { tenantId, baseUrl, apiKey, status } = req.body || {};
    if (!tenantId || !baseUrl) return res.status(400).json({ ok: false, error: 'tenantId e baseUrl são obrigatórios' });
    const r = await resolver.saveConfig(tenantId, { baseUrl, apiKey, status });
    if (!r.ok) return res.status(400).json(r);
    res.status(200).json({ ok: true });
  });

  app.post('/api/v1/santa-angela/config/test', requireOwner, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const r = await apiClient.fetchLeads(tenantId);
    res.status(200).json({ ok: r.ok, status: r.status, error: r.error });
  });

  // Dispara um ciclo completo em background e responde na hora (202). O resultado
  // vai para os logs / tenant_santa_angela_config; a guarda de reentrância evita
  // sobrepor um ciclo do cron. Sem tenantId: o ciclo cobre todos os active.
  app.post('/api/v1/santa-angela/sync/run', requireOwner, (req, res) => {
    const { started, alreadyRunning } = runner.trigger();
    res.status(202).json({ ok: true, started, message: started
      ? 'sync iniciado — acompanhe em GET /api/v1/santa-angela/sync/status'
      : (alreadyRunning ? 'sync já em andamento' : 'sync não iniciado') });
  });

  app.get('/api/v1/santa-angela/sync/status', requireOwner, async (req, res) => {
    const { data, error } = await supabase
      .from(CONFIG_TABLE).select('tenant_id,status,last_sync_at,leads_count')
      .order('last_sync_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.status(200).json({ ok: true, integrations: data || [] });
  });
}
