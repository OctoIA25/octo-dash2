/**
 * 🤖 Cadência da LIA — rotas.
 *
 *   GET  /api/v1/leads/:leadId/cadencia   — o que o card do lead mostra (JWT)
 *   POST /api/v1/lia/cadencias            — o app da LIA reporta (service token)
 *
 * POR QUE A LEITURA PASSA PELO SERVIDOR
 * `lia_followups` está com RLS ligada e sem policy: pelo PostgREST ela devolve
 * lista vazia para qualquer chave que não seja a service_role. É de propósito —
 * `motivo` e `message_sent` carregam texto de conversa com o cliente. Então o
 * recorte de quem pode ver é feito aqui, em código, e não por RLS.
 *
 * SEGURANÇA: service_role bypassa RLS. O tenant SEMPRE sai da autenticação
 * (JWT via resolveTenant, ou o tenant_id do corpo quando quem chama é o
 * serviço), nunca de parâmetro de usuário, e toda consulta leva
 * `.eq('tenant_id', ...)`.
 *
 * Registrar nos DOIS entrypoints (api-server.js e proxy-production.js) antes
 * do catch-all 404, senão funciona em dev e dá 404 em produção.
 */

import { makeRequireSupabaseAuth, resolveTenant } from '../kpis/index.js';
import { isPlatformOwner } from '../utils/ownerAuth.js';
import { buscarLead, carregarCadencia, gravarCadencia } from './query.js';
import { resumirCadencia } from './compute.js';
import { normalizarCadencia } from './normalize.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quem enxerga a cadência de um lead além de quem atende esse lead. */
const PAPEIS_DE_GESTAO = new Set(['admin', 'owner', 'team_leader']);

/**
 * Regra de visibilidade — pura, para ser testável sem banco.
 *
 * Espelha o que o corretor já vê no Kanban: gestão vê o tenant inteiro,
 * corretor vê o que está atribuído a ele. Lead sem dono é caso de bolsão e só
 * gestão enxerga, igual à RLS das conversas de WhatsApp (20260816).
 */
export function podeVerCadencia({ ehOwnerDaPlataforma, role, userId, lead }) {
  if (ehOwnerDaPlataforma) return true;
  if (PAPEIS_DE_GESTAO.has(role)) return true;
  return Boolean(lead?.owner_id && userId && lead.owner_id === userId);
}

/** Papel do usuário no tenant; null quando não é membro. */
export async function papelNoTenant(supabase, userId, tenantId) {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

/**
 * Autentica serviço (x-service-token) OU usuário (JWT), como em
 * agent-telemetry/routes.js. Fail-closed: sem a env, o caminho de serviço não
 * existe — não há token vazio que valha.
 *
 * ponytail: comparação simples de string, igual aos outros três módulos que
 * usam service token. Trocar por timingSafeEqual em todos de uma vez, não só
 * aqui, para não virar um padrão divergente.
 *
 * Exportada porque server/leadEvents usa o MESMO contrato de credencial: para
 * quem integra, cadência e histórico são o mesmo app da LIA com um token só.
 * Duplicar a função criaria duas regras de auth que divergem no primeiro fix.
 */
export async function autenticar(req, supabase) {
  const enviado = req.headers['x-service-token'];
  if (enviado != null) {
    const esperado = process.env.LIA_SERVICE_TOKEN || process.env.DISPARADOR_SERVICE_TOKEN;
    if (!esperado || enviado !== esperado) {
      return { ok: false, status: 401, error: 'invalid_service_token' };
    }
    return { ok: true, isService: true };
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return { ok: false, status: 401, error: 'missing_authorization' };
  const { data, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !data?.user) return { ok: false, status: 401, error: 'invalid_token' };
  return { ok: true, isService: false, userId: data.user.id, userEmail: data.user.email };
}

export function registerLiaCadenciaRoutes(app, supabase, options = {}) {
  const requireAuth = makeRequireSupabaseAuth(supabase);

  // ---------------------------------------------------------------- leitura
  app.get('/api/v1/leads/:leadId/cadencia', requireAuth, async (req, res) => {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
      const { tenantId } = resolved;

      const { leadId } = req.params;
      if (!UUID_RE.test(leadId)) return res.status(400).json({ ok: false, error: 'invalid_lead_id' });

      const lead = await buscarLead(supabase, tenantId, leadId);
      if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });

      const ehOwnerDaPlataforma = isPlatformOwner(req.userEmail);
      const role = ehOwnerDaPlataforma ? null : await papelNoTenant(supabase, req.userId, tenantId);
      if (!podeVerCadencia({ ehOwnerDaPlataforma, role, userId: req.userId, lead })) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }

      const dados = await carregarCadencia(supabase, tenantId, lead);
      const { resumo, timeline } = resumirCadencia(dados);
      return res.json({ ok: true, resumo, timeline });
    } catch (err) {
      console.error('[lia-cadencia] erro lendo cadência:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  // ----------------------------------------------------------------- escrita
  app.post('/api/v1/lia/cadencias', async (req, res) => {
    try {
      const auth = await autenticar(req, supabase);
      if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

      // Serviço age em qualquer tenant (o token representa o app da LIA, não
      // uma imobiliária), então o tenant vem do corpo e é validado. Usuário
      // comum nunca dita tenant: ele sai do JWT.
      let tenantId;
      if (auth.isService) {
        tenantId = String(req.body?.tenant_id ?? '').trim();
        if (!UUID_RE.test(tenantId)) return res.status(400).json({ ok: false, error: 'invalid_tenant_id' });
      } else {
        req.userId = auth.userId;
        req.userEmail = auth.userEmail;
        const resolved = await resolveTenant(supabase, req);
        if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
        tenantId = resolved.tenantId;
        const role = isPlatformOwner(auth.userEmail)
          ? 'owner'
          : await papelNoTenant(supabase, auth.userId, tenantId);
        if (role !== 'admin' && role !== 'owner') {
          return res.status(403).json({ ok: false, error: 'forbidden' });
        }
      }

      const validado = normalizarCadencia(req.body);
      if (!validado.ok) {
        return res.status(422).json({ ok: false, error: 'invalid_fields', details: validado.details });
      }

      // Cadência de lead que não é deste tenant seria linha órfã na tela.
      if (validado.row.lead_id) {
        const lead = await buscarLead(supabase, tenantId, validado.row.lead_id);
        if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });
      }

      const { id, created } = await gravarCadencia(supabase, tenantId, validado.row);
      return res.status(created ? 201 : 200).json({ ok: true, id, created });
    } catch (err) {
      console.error('[lia-cadencia] erro gravando cadência:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  if (options.verbose !== false) {
    console.log('   ├─ 🤖 GET  /api/v1/leads/:leadId/cadencia                 → Cadência da LIA no card do lead');
    console.log('   └─ 🤖 POST /api/v1/lia/cadencias                          → App da LIA reporta a cadência');
  }
}
