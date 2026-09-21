/**
 * Gasto de anúncios da Meta (P3.5).
 *
 *   POST /api/v1/meta/insights/sincronizar — busca na Meta e grava o período
 *
 * Quem busca é o servidor da Dash, e não o n8n — decidido com o chefe em
 * 21/09. Mas o resultado é GUARDADO: buscar ao vivo a cada abertura de tela
 * faria a tela ficar lenta sempre e sumir toda vez que a Meta oscilasse.
 *
 * Auth igual à de formRoutes.js: owner da plataforma OU admin/team_leader do
 * próprio tenant, com `tenantId` lido SÓ do corpo. Não trocar para GET com
 * query — foi exatamente essa segunda fonte que causou um IDOR neste módulo.
 */

import { createMetaGraphClient } from '../metaLeadgen/graphClient.js';
import { CAMPOS_INSIGHTS, caminhoDeInsights, janelaDeSincronizacao, linhasDeInsights } from './insights.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const TENANT_MANAGER_ROLES = new Set(['admin', 'team_leader']);

/** Teto de dias por chamada. Sincronizar um ano inteiro é caso de carga, não de tela. */
const MAX_DIAS = 92;

async function authenticate(supabase, req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'missing_authorization' });
    return null;
  }
  const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !data?.user) {
    res.status(401).json({ ok: false, error: 'invalid_token' });
    return null;
  }
  return data.user;
}

function makeRequireManager(supabase) {
  return async function requireManager(req, res, next) {
    try {
      const user = await authenticate(supabase, req, res);
      if (!user) return;
      req.userEmail = user.email;
      if (isPlatformOwner(user.email)) return next();

      const tenantId = req.body?.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

      const { data: membership, error } = await supabase
        .from('tenant_memberships').select('role')
        .eq('tenant_id', tenantId).eq('user_id', user.id).maybeSingle();
      if (error) {
        console.error('[meta-insights] membership lookup falhou:', error.message);
        return res.status(500).json({ ok: false, error: 'auth_internal_error' });
      }
      if (!membership || !TENANT_MANAGER_ROLES.has(membership.role)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      return next();
    } catch (e) {
      console.error('[meta-insights] auth falhou:', e?.message || e);
      return res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerMetaInsightsRoutes(app, supabase, options = {}) {
  const requireManager = makeRequireManager(supabase);
  const graph = options.graphClient || createMetaGraphClient({ logger: console });
  const resolver = options.configResolver;
  const hoje = options.hoje || (() => new Date().toISOString().slice(0, 10));

  app.post('/api/v1/meta/insights/sincronizar', requireManager, async (req, res) => {
    const tenantId = req.body?.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

    try {
      const cfg = await resolver.resolveByTenant(tenantId);
      if (!cfg) return res.status(404).json({ ok: false, error: 'integração da Meta não configurada' });
      if (!cfg.adAccountId) {
        // Erro específico de propósito: "não configurado" mandaria o gestor
        // procurar a integração inteira, quando falta um campo só.
        return res.status(400).json({
          ok: false,
          error: 'conta_de_anuncios_ausente',
          detalhe: 'Cadastre a conta de anúncios (ad_account_id) na integração da Meta.',
        });
      }
      if (!cfg.accessToken) {
        return res.status(400).json({ ok: false, error: 'token_ausente' });
      }

      const { de, ate } = req.body?.de && req.body?.ate
        ? { de: req.body.de, ate: req.body.ate }
        : janelaDeSincronizacao(hoje(), Number(req.body?.dias) || 7);

      const dias = Math.round((new Date(`${ate}T12:00:00Z`) - new Date(`${de}T12:00:00Z`)) / 86400000) + 1;
      if (!Number.isFinite(dias) || dias < 1) {
        return res.status(400).json({ ok: false, error: 'periodo_invalido' });
      }
      if (dias > MAX_DIAS) {
        return res.status(400).json({ ok: false, error: 'periodo_longo_demais', maximo_dias: MAX_DIAS });
      }

      const caminho = caminhoDeInsights(cfg.adAccountId, de, ate);
      const resposta = await graph.fetchInsights(caminho, cfg.accessToken, CAMPOS_INSIGHTS);

      if (!resposta?.ok) {
        // A falha da Meta NÃO apaga o que já está guardado: a tela continua
        // mostrando o último número bom e diz de quando ele é.
        console.warn('[meta-insights] Graph recusou:', resposta?.error || 'sem detalhe');
        return res.status(502).json({
          ok: false,
          error: 'meta_indisponivel',
          detalhe: resposta?.error || 'sem detalhe',
          retriable: !!resposta?.retriable,
        });
      }

      const { linhas, descartadas } = linhasDeInsights(resposta.corpo, tenantId);
      if (linhas.length === 0) {
        return res.json({ ok: true, de, ate, gravadas: 0, descartadas: descartadas.length });
      }

      // Upsert pela chave única: a Meta REGRAVA números dos últimos dias, e a
      // sincronização repete esses dias de propósito. Sem o upsert, cada
      // rodada somaria o mês de novo.
      const { error } = await supabase
        .from('meta_insights_diarios')
        .upsert(
          linhas.map((l) => ({ ...l, sincronizado_em: new Date().toISOString() })),
          { onConflict: 'tenant_id,data,ad_id' }
        );
      if (error) {
        console.error('[meta-insights] gravação falhou:', error.message);
        return res.status(500).json({ ok: false, error: 'gravacao_falhou', detalhe: error.message });
      }

      return res.json({
        ok: true,
        de,
        ate,
        gravadas: linhas.length,
        descartadas: descartadas.length,
        campanhas: [...new Set(linhas.map((l) => l.campaign_id))].length,
        gasto: Math.round(linhas.reduce((s, l) => s + (l.gasto || 0), 0) * 100) / 100,
      });
    } catch (e) {
      console.error('[meta-insights] sincronizar falhou:', e?.message || e);
      return res.status(500).json({ ok: false, error: 'sincronizacao_falhou', detalhe: e?.message });
    }
  });
}
