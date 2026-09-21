/**
 * Formulários da Meta, um a um (P2.7).
 *
 *   POST /api/v1/meta/formularios/sincronizar — traz a lista da Meta (só nomes)
 *   POST /api/v1/meta/formularios/baixar      — traz o histórico de um formulário
 *
 * Auth igual à de configRoutes.js: owner da plataforma OU admin/team_leader do
 * próprio tenant, com `tenantId` lido SÓ do corpo. Não trocar para GET com
 * query: foi exatamente essa segunda fonte que causou um IDOR neste módulo.
 *
 * Registrar nos DOIS entrypoints antes do catch-all 404.
 */

import { createMetaConfigResolver } from './configResolver.js';
import { createMetaGraphClient } from './graphClient.js';
import { normalizeLeadgen } from './normalizer.js';
import { enriquecerComCodigoLancamento } from '../lancamentoAnuncios.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const TENANT_MANAGER_ROLES = new Set(['admin', 'team_leader']);

/** Teto por chamada. A Meta guarda 90 dias; trazer tudo de uma vez é o normal. */
const LIMITE_LEADS = 200;

/**
 * O que fazer com um lead que veio da Meta — função pura.
 *
 * Três destinos, e o do meio é o que o chefe pediu em 21/09: dos 125 leads em
 * produção, 56 entraram ANTES de 12/09, quando campanha e conjunto passaram a
 * ser pedidos à Meta. Todos estão dentro da janela de 90 dias, então o mesmo
 * "Baixar leads" que traz o histórico também COMPLETA o que falta nos que já
 * existem. Sem isso, o relatório de ROI do P3 nasce com 45% de buraco.
 */
export function decidirImportacao(leadDaMeta, existente) {
  if (!existente) return { acao: 'criar' };

  const faltando = {};
  if (!existente.meta_campaign_id && leadDaMeta?.campaign_id) faltando.meta_campaign_id = leadDaMeta.campaign_id;
  if (!existente.meta_adset_id && leadDaMeta?.adset_id) faltando.meta_adset_id = leadDaMeta.adset_id;
  if (!existente.meta_ad_id && leadDaMeta?.ad_id) faltando.meta_ad_id = leadDaMeta.ad_id;

  if (Object.keys(faltando).length === 0) return { acao: 'nada' };
  return { acao: 'completar', campos: faltando };
}

async function authenticate(supabase, req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) { res.status(401).json({ ok: false, error: 'missing_authorization' }); return null; }
  const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !data?.user) { res.status(401).json({ ok: false, error: 'invalid_token' }); return null; }
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
      if (error) { console.error('[meta-formularios] membership lookup falhou:', error.message); return res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
      if (!membership || !TENANT_MANAGER_ROLES.has(membership.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[meta-formularios] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerMetaFormRoutes(app, supabase, options = {}) {
  const requireManager = makeRequireManager(supabase);
  const resolver = options.configResolver ?? createMetaConfigResolver({ supabase });
  const graph = options.graphClient ?? createMetaGraphClient();
  const fetchImpl = options.fetchImpl ?? fetch;
  const selfBaseUrl = options.selfBaseUrl ?? process.env.SELF_BASE_URL ?? 'http://localhost:3001';

  /**
   * A lista de formulários da página. SÓ nomes — não baixa lead nenhum.
   *
   * Decidido pelo chefe em 21/09: lista TODOS os formulários da Meta, inclusive
   * os que nunca receberam lead. É o que permite desligar a captação de um
   * formulário ANTES do primeiro lead entrar.
   */
  app.post('/api/v1/meta/formularios/sincronizar', requireManager, async (req, res) => {
    try {
      const tenantId = req.body?.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

      const config = await resolver.resolve(tenantId);
      if (!config?.accessToken || !config?.pageId) {
        return res.status(409).json({ ok: false, error: 'integracao_nao_configurada' });
      }

      const r = await graph.fetchForms(config.pageId, config.accessToken);
      if (!r.ok) return res.status(502).json({ ok: false, error: `Graph API: ${r.error}` });

      const agora = new Date().toISOString();
      const linhas = r.forms
        .filter((f) => f?.id)
        .map((f) => ({
          tenant_id: tenantId,
          form_id: String(f.id),
          page_id: config.pageId,
          nome: f.name ?? null,
          sincronizado_em: agora,
          updated_at: agora,
        }));

      if (linhas.length > 0) {
        // `captacao_ativa` e `lia_atende` ficam FORA do upsert de propósito: a
        // sincronização traz o que a Meta sabe (nome), não o que o gestor
        // decidiu aqui. Incluí-las devolveria todo formulário ao padrão
        // "ligado" a cada sincronização, desfazendo o desligamento em silêncio.
        const { error } = await supabase
          .from('meta_formularios')
          .upsert(linhas, { onConflict: 'tenant_id,form_id' });
        if (error) throw error;
      }

      return res.json({ ok: true, formularios: linhas.length });
    } catch (err) {
      console.error('[meta-formularios] erro sincronizando:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  /**
   * O histórico de um formulário (a Meta guarda 90 dias).
   *
   * Importa com `lia_atende: false` e sem distribuição: lead antigo não pode
   * receber mensagem da LIA como se tivesse acabado de chegar. Alguém que
   * preencheu o formulário há dois meses receber "oi, vi que você se
   * interessou" hoje é o tipo de coisa que queima a imobiliária.
   */
  app.post('/api/v1/meta/formularios/baixar', requireManager, async (req, res) => {
    try {
      const tenantId = req.body?.tenantId;
      const formId = String(req.body?.formId ?? '').trim();
      if (!tenantId || !formId) return res.status(400).json({ ok: false, error: 'tenantId e formId obrigatórios' });

      const config = await resolver.resolve(tenantId);
      if (!config?.accessToken) return res.status(409).json({ ok: false, error: 'integracao_nao_configurada' });

      const { data: form } = await supabase
        .from('meta_formularios')
        .select('baixado_ate, page_id')
        .eq('tenant_id', tenantId).eq('form_id', formId).maybeSingle();

      const r = await graph.fetchFormLeads(formId, config.accessToken, {
        depois: req.body?.tudo ? null : form?.baixado_ate ?? null,
        limite: LIMITE_LEADS,
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: `Graph API: ${r.error}` });

      const relatorio = { encontrados: r.leads.length, criados: 0, completados: 0, ja_tinham: 0, falhas: [] };

      for (const bruto of r.leads) {
        const leadgenId = String(bruto?.id ?? '');
        if (!leadgenId) continue;

        const { data: existente } = await supabase
          .from('leads')
          .select('id, meta_campaign_id, meta_adset_id, meta_ad_id')
          .eq('tenant_id', tenantId)
          .eq('custom_fields->raw_data->meta->>leadgen_id', leadgenId)
          .maybeSingle();

        const decisao = decidirImportacao(bruto, existente);

        if (decisao.acao === 'nada') { relatorio.ja_tinham += 1; continue; }

        if (decisao.acao === 'completar') {
          const { error } = await supabase.from('leads').update(decisao.campos).eq('id', existente.id);
          if (error) relatorio.falhas.push({ leadgen_id: leadgenId, erro: error.message });
          else relatorio.completados += 1;
          continue;
        }

        const payload = await enriquecerComCodigoLancamento(
          supabase, tenantId, { originListingId: formId },
          normalizeLeadgen(bruto, {
            leadgenId, pageId: form?.page_id ?? config.pageId, formId, adId: bruto?.ad_id ?? null,
          }),
        );
        // Histórico entra SEM a LIA e sem distribuição: é o que o plano pede,
        // e é o que evita a mensagem fora de hora.
        payload.raw_data.meta.lia_atende = false;
        payload.raw_data.meta.importado_em = new Date().toISOString();

        try {
          const resp = await fetchImpl(`${selfBaseUrl}/api/v1/leads`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: req.headers.authorization },
            body: JSON.stringify(payload),
          });
          if (resp.ok) relatorio.criados += 1;
          else relatorio.falhas.push({ leadgen_id: leadgenId, erro: `POST /leads ${resp.status}` });
        } catch (e) {
          relatorio.falhas.push({ leadgen_id: leadgenId, erro: e?.message ?? 'erro de rede' });
        }
      }

      // `baixado_ate` só avança quando NADA falhou: avançar com falha pularia
      // para sempre o lead que não entrou, e ninguém saberia qual foi.
      if (relatorio.falhas.length === 0) {
        await supabase
          .from('meta_formularios')
          .update({ baixado_ate: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId).eq('form_id', formId);
      }

      return res.json({ ok: true, ...relatorio });
    } catch (err) {
      console.error('[meta-formularios] erro baixando leads:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  if (options.verbose !== false) {
    console.log('   ├─ 📣 POST /api/v1/meta/formularios/sincronizar           → Lista os formulários da Meta');
    console.log('   └─ 📣 POST /api/v1/meta/formularios/baixar                → Baixa o histórico de um formulário');
  }
}
