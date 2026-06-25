/**
 * 📊 Rotas de KPIs do dashboard.
 *
 *   GET /api/v1/kpis  — pacote completo de indicadores do tenant no período.
 *
 * Responsabilidade do servidor (fina de propósito):
 *   1. Autenticar (JWT Supabase) e RESOLVER o tenant do usuário.
 *   2. Ler os dados (kpisData) — escopados por tenant, sem arquivados.
 *   3. Calcular os KPIs (kpisCompute — puro, fonte única das regras).
 *
 * SEGURANÇA: o servidor usa service_role (bypassa RLS), então o isolamento por
 * tenant é responsabilidade DESTE código. O cliente NÃO escolhe o tenant: ele é
 * derivado do JWT via tenant_memberships. O owner da plataforma pode inspecionar
 * outro tenant passando ?tenantId=, sempre validado contra a existência do tenant.
 */

import { buildOverview } from './kpisCompute.js';
import {
  monthPeriod,
  monthPeriodFromIso,
  previousMonthPeriod,
} from './kpisPeriod.js';
import {
  countCaptacao,
  countCorretoresAtivos,
  countImoveisAtivos,
  fetchCommercialTotals,
  fetchGoals,
  fetchLeads,
} from './kpisData.js';
import { fetchDashboardKpis, fetchKpiTargets, fetchKpiValues } from './kpisConfig.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;

/** Middleware: valida JWT Supabase e injeta req.userId/req.userEmail. */
export function makeRequireSupabaseAuth(supabase) {
  return async function requireSupabaseAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: 'missing_authorization' });
      }
      const token = authHeader.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ ok: false, error: 'invalid_token' });
      }
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[kpis] erro validando token:', err);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

/**
 * Resolve o tenant a usar para a consulta:
 *  - Owner da plataforma pode informar ?tenantId= (impersonation); validamos
 *    que o tenant existe.
 *  - Demais usuários: o tenant vem da PRIMEIRA membership do usuário; um
 *    ?tenantId= só é aceito se o usuário tiver membership nele.
 *
 * Retorna { tenantId } em sucesso ou { error, status } para o handler responder.
 */
export async function resolveTenant(supabase, req) {
  const requested = typeof req.query?.tenantId === 'string' ? req.query.tenantId.trim() : '';

  if (isPlatformOwner(req.userEmail)) {
    if (!requested) {
      return { error: 'tenant_required_for_owner', status: 400 };
    }
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', requested)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: 'tenant_not_found', status: 404 };
    return { tenantId: requested };
  }

  // Usuário comum: tenant derivado das memberships.
  const { data: memberships, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', req.userId);
  if (error) throw error;

  const tenantIds = (memberships || []).map((m) => m.tenant_id);
  if (tenantIds.length === 0) {
    return { error: 'no_tenant_access', status: 403 };
  }

  if (requested) {
    if (!tenantIds.includes(requested)) {
      return { error: 'tenant_forbidden', status: 403 };
    }
    return { tenantId: requested };
  }

  return { tenantId: tenantIds[0] };
}

/**
 * Resolve o período a partir de ?month=YYYY-MM-DD (usa o mês da data) ou,
 * na ausência, o mês atual. Sempre retorna um período válido.
 */
function resolvePeriod(req) {
  const month = typeof req.query?.month === 'string' ? req.query.month : '';
  return monthPeriodFromIso(month) || monthPeriod();
}

/** Handler de GET /api/v1/kpis. */
export function makeKpisHandler(supabase) {
  return async function kpisHandler(req, res) {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) {
        return res.status(resolved.status).json({ ok: false, error: resolved.error });
      }
      const { tenantId } = resolved;
      const period = resolvePeriod(req);
      const prevPeriod = previousMonthPeriod(period);
      const periodScope = { tenantId, periodType: 'month', periodStart: period.startDate };

      const [
        currentLeads,
        previousLeads,
        imoveisAtivos,
        captacao,
        tamanhoEquipe,
        goals,
        commercialCurrent,
        commercialPrevious,
        kpis,
        targets,
        values,
      ] = await Promise.all([
        fetchLeads(supabase, { tenantId, period }),
        fetchLeads(supabase, { tenantId, period: prevPeriod }),
        countImoveisAtivos(supabase, { tenantId }),
        countCaptacao(supabase, { tenantId, period }),
        countCorretoresAtivos(supabase, { tenantId }),
        fetchGoals(supabase, { tenantId }),
        fetchCommercialTotals(supabase, { tenantId, period }),
        fetchCommercialTotals(supabase, { tenantId, period: prevPeriod }),
        fetchDashboardKpis(supabase, { tenantId }),
        fetchKpiTargets(supabase, periodScope),
        fetchKpiValues(supabase, periodScope),
      ]);

      const counts = {
        imoveisAtivos,
        captacaoExclusiva: captacao.exclusiva,
        captacaoSemExclusividade: captacao.semExclusividade,
        tamanhoEquipe,
        vgv: commercialCurrent.vgv,
        vgc: commercialCurrent.vgc,
        vgvPrev: commercialPrevious.vgv,
        vgcPrev: commercialPrevious.vgc,
      };

      const overview = buildOverview({
        period,
        currentLeads,
        previousLeads,
        counts,
        goals,
        commercialCurrent,
        commercialPrevious,
        previousLabel: prevPeriod.label,
        config: { kpis, targets, values },
      });

      return res.json({ ok: true, overview });
    } catch (err) {
      console.error('[kpis] erro ao montar overview:', err);
      return res.status(500).json({ ok: false, error: 'kpis_internal_error' });
    }
  };
}

/** Registra as rotas de KPIs no app Express. */
export function registerKpisRoutes(app, supabase) {
  const requireSupabaseAuth = makeRequireSupabaseAuth(supabase);
  app.get('/api/v1/kpis', requireSupabaseAuth, makeKpisHandler(supabase));
}
