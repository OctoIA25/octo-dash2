/**
 * 🌐 Rotas Express do pipeline de marca d'água — montadas em /api/v1/watermark.
 *
 *   POST /photos                    upload do master → enfileira (responde na hora)
 *   GET  /photos/:id                status + URLs (CDN) dos derivados
 *   GET  /photos/:id/:size          geração LAZY on-the-fly + redirect p/ CDN
 *   PUT  /tenants/:tenantId/logo    troca de logo → máscara + bump + re-watermark
 *   POST /tenants/:tenantId/reprocess  re-enfileira o tenant (manutenção)
 *   POST /worker/tick               drena a fila manualmente (ambientes sem worker)
 *
 * O upload usa multer (memória) — não passa pelo express.json, então não infla
 * o body parser e aceita binário direto (melhor que base64 para fotos grandes).
 */
import express from 'express';
import multer from 'multer';
import { createWatermarkService } from './service.js';
import { createWorker } from './worker.js';
import { SIZES } from './config.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB por foto
});

// Owner da plataforma (acesso a todos os tenants). Mantém alinhado ao CLAUDE.md.
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'octo.inteligenciaimobiliaria@gmail.com').toLowerCase();
const ADMIN_ROLES = ['admin', 'owner', 'gestao'];

// Validações de entrada (defesa contra path traversal / poluição cross-tenant).
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const cleanPropertyId = (v) => {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : undefined; // undefined = inválido
};

export function createWatermarkRouter(supabase) {
  const router = express.Router();
  const service = createWatermarkService(supabase);
  const worker = createWorker(supabase, 'http-tick');

  /** Valida o JWT do Supabase e devolve o user (ou responde 401 e devolve null). */
  async function verifyUser(req, res) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) { res.status(401).json({ error: 'não autenticado' }); return null; }
    const { data: { user } = {}, error } = await supabase.auth.getUser(token);
    if (error || !user) { res.status(401).json({ error: 'sessão inválida' }); return null; }
    return user;
  }

  /**
   * Middleware factory: exige que o requisitante pertença ao tenant.
   *   admin=true  → só admin/owner/gestao (alterações de marca).
   *   from='body' → lê o tenantId do corpo (POST /photos, multipart).
   */
  function requireTenant({ admin = false, from = 'params' } = {}) {
    return async (req, res, next) => {
      try {
        const user = await verifyUser(req, res);
        if (!user) return;
        const tenantId = from === 'body' ? req.body?.tenantId : req.params.tenantId;
        if (!isUuid(tenantId)) return res.status(400).json({ error: 'tenantId inválido' });
        if ((user.email || '').toLowerCase() === OWNER_EMAIL) return next();
        const { data: m } = await supabase
          .from('tenant_memberships').select('role')
          .eq('user_id', user.id).eq('tenant_id', tenantId).maybeSingle();
        if (!m) return res.status(403).json({ error: 'sem acesso a esta imobiliária' });
        if (admin && !ADMIN_ROLES.includes(m.role)) return res.status(403).json({ error: 'requer admin da imobiliária' });
        return next();
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    };
  }
  const requireTenantAdmin = requireTenant({ admin: true });

  // POST /photos — multipart `photo` + body { tenantId, propertyId?, ... }.
  // requireTenant roda DEPOIS do multer (que popula req.body) e valida membership.
  router.post('/photos', upload.single('photo'), requireTenant({ from: 'body' }), async (req, res) => {
    try {
      const { tenantId, propertyId, position, caption } = req.body;
      if (!req.file) return res.status(400).json({ error: 'arquivo `photo` obrigatório' });
      if (!/^image\//.test(req.file.mimetype || '')) return res.status(400).json({ error: 'arquivo deve ser imagem' });
      const cleanProp = cleanPropertyId(propertyId);
      if (cleanProp === undefined) return res.status(400).json({ error: 'propertyId inválido' });

      const photo = await service.ingestMaster({
        tenantId,
        propertyId: cleanProp,
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        position: Number(position) || 0,
        caption: String(caption || '').slice(0, 500),
      });

      // 202: aceito. UX: cliente mostra o preview local enquanto gera o derivado.
      res.status(202).json({ id: photo.id, status: photo.status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /photos/:id — status + URLs públicas (CDN)
  router.get('/photos/:id', async (req, res) => {
    try {
      res.json(await service.getPhotoStatus(req.params.id));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  // GET /photos/:id/:size — geração LAZY: cobre a janela do batch e tamanhos raros.
  // Se o derivado da versão atual não existe, gera na hora, salva e redireciona
  // para a CDN — que serve todos os acessos seguintes (compute pago uma vez).
  router.get('/photos/:id/:size', async (req, res) => {
    try {
      if (!SIZES[req.params.size]) return res.status(400).json({ error: `tamanho inválido: ${req.params.size}` });

      // ?redirect=0 (ou ?format=json) → devolve { url } em vez de redirecionar.
      // Usado no save do imóvel para capturar a URL absoluta da CDN sem baixar bytes.
      const wantsJson = req.query.redirect === '0' || req.query.format === 'json';

      // Gera (ou reaproveita) o derivado da versão atual — implementação única.
      const { url } = await service.ensureDerivative(req.params.id, req.params.size);

      if (wantsJson) return res.json({ url });
      // Redirect curto-cacheável: o alvo (CDN) é imutável, mas o derivado servido
      // muda ao trocar o logo OU ligar/desligar a marca. 60s deixa o toggle do
      // admin surtir efeito rápido sem onerar demais o servidor.
      res.set('Cache-Control', 'public, max-age=60');
      return res.redirect(302, url);
    } catch (e) {
      const code = /não encontrada|not found|PGRST116/.test(e.message) ? 404 : 500;
      res.status(code).json({ error: e.message });
    }
  });

  // Dispara o reapontamento em background. O progresso é DURÁVEL (tabela
  // watermark_reprocess), então sobrevive a restart e é visível em qualquer aba/
  // instância. Guarda contra concorrência: não reinicia se já há um rodando e
  // "vivo" (heartbeat recente); se travou (sem update há >2min), permite retomar.
  const STALE_MS = 2 * 60 * 1000;
  async function startRepoint(tenantId) {
    const cur = await service.getReprocessProgress(tenantId);
    const fresh = cur.updated_at && Date.now() - new Date(cur.updated_at).getTime() < STALE_MS;
    if (cur.status === 'running' && fresh) return cur; // já em andamento
    // Fire-and-forget: o request retorna na hora; o trabalho pesado roda em background.
    service.repointTenantPhotos(tenantId).catch((e) => console.error('[watermark] repoint:', e.message));
    return { status: 'running', done: 0, total: cur.total || 0 };
  }

  // PUT /tenants/:tenantId/logo — troca de logo. Campo file `logo`. (admin only)
  router.put('/tenants/:tenantId/logo', requireTenantAdmin, upload.single('logo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'arquivo `logo` obrigatório' });
      const result = await service.setTenantLogo({
        tenantId: req.params.tenantId,
        logoBuffer: req.file.buffer,
        contentType: req.file.mimetype,
      });
      await startRepoint(req.params.tenantId); // regenera + reaponta as fotos em background
      res.json({ ok: true, reprocessing: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /tenants/:tenantId/watermark-settings — config atual (membro do tenant).
  router.get('/tenants/:tenantId/watermark-settings', requireTenant(), async (req, res) => {
    try {
      res.json(await service.getWatermarkSettings(req.params.tenantId));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /tenants/:tenantId/watermark-settings — opacidade/escala/on-off. (admin only)
  router.patch('/tenants/:tenantId/watermark-settings', requireTenantAdmin, async (req, res) => {
    try {
      const { enabled, opacity, scale } = req.body || {};
      const settings = await service.updateWatermarkSettings(req.params.tenantId, { enabled, opacity, scale });
      // Mudar opacidade/escala/toggle muda a chave do derivado → regenera + reaponta.
      await startRepoint(req.params.tenantId);
      res.json({ ...settings, reprocessing: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /tenants/:tenantId/reprocess — regenera + reaponta as fotos em background. (admin only)
  router.post('/tenants/:tenantId/reprocess', requireTenantAdmin, async (req, res) => {
    try {
      const state = await startRepoint(req.params.tenantId);
      res.json({ ok: true, reprocessing: true, ...state });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /tenants/:tenantId/reprocess-status — progresso DURÁVEL do reprocessamento. (membro)
  router.get('/tenants/:tenantId/reprocess-status', requireTenant(), async (req, res) => {
    try {
      const p = await service.getReprocessProgress(req.params.tenantId);
      const fresh = p.updated_at && Date.now() - new Date(p.updated_at).getTime() < STALE_MS;
      // Se 'running' mas sem heartbeat há >2min, reporta como travado (stalled).
      res.json({ ...p, running: p.status === 'running' && fresh, stalled: p.status === 'running' && !fresh });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /worker/tick — drena a fila manualmente. Operação interna: exige token
  // secreto (WATERMARK_WORKER_TOKEN) para não virar vetor de DoS de CPU.
  router.post('/worker/tick', async (req, res) => {
    try {
      const secret = process.env.WATERMARK_WORKER_TOKEN;
      const sent = req.headers['x-worker-token'];
      if (!secret || sent !== secret) return res.status(403).json({ error: 'proibido' });
      const processed = await worker.tick();
      res.json({ processed });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
