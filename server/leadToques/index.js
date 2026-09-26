/**
 * Toques do corretor — os quadrados de cadência do modal do lead.
 *
 *   GET    /api/v1/leads/:leadId/toques           — toques registrados (JWT)
 *   POST   /api/v1/leads/:leadId/toques           — registra um toque (JWT)
 *   DELETE /api/v1/leads/:leadId/toques/:toqueId  — desfaz o último (JWT)
 *
 * Os toques da LIA NÃO passam por aqui: o modal já carrega a cadência dela
 * (GET /leads/:id/cadencia) e junta as duas listas na tela. Buscá-la de novo
 * aqui dobraria as consultas a cada abertura do card.
 *
 * QUEM PODE: a mesma regra da cadência da LIA (podeVerCadencia) — dono do lead
 * ou gestão. Reaproveitada, não copiada, para as duas seções do mesmo card
 * nunca discordarem sobre quem enxerga o lead.
 *
 * SEGURANÇA: service_role bypassa RLS. Tenant sai da autenticação, lead da
 * URL, quem executou do JWT; toda consulta leva `.eq('tenant_id', ...)`.
 *
 * Registrar nos DOIS entrypoints (api-server.js e proxy-production.js) antes
 * do catch-all 404.
 */

import { makeRequireSupabaseAuth, resolveTenant } from '../kpis/index.js';
import { isPlatformOwner } from '../utils/ownerAuth.js';
import { podeVerCadencia, papelNoTenant } from '../liaCadencia/index.js';
import { buscarLead } from '../liaCadencia/query.js';
import { normalizarToque } from './normalize.js';
import { sincronizarAgendaDoToque } from './agenda.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS =
  'id, canal, resultado, observacao, proximo_toque_em, executado_em, executado_por, executado_por_nome';

/** Muito acima dos 10 quadrados; só barra lead com histórico absurdo. */
const LIMITE_TOQUES = 200;

/**
 * Autoriza o acesso ao lead da URL. Devolve `{tenantId, lead}` ou já respondeu
 * o erro e devolve null.
 */
async function acessarLead(supabase, req, res) {
  const resolved = await resolveTenant(supabase, req);
  if (resolved.error) {
    res.status(resolved.status).json({ ok: false, error: resolved.error });
    return null;
  }
  const { tenantId } = resolved;

  const { leadId } = req.params;
  if (!UUID_RE.test(leadId)) {
    res.status(400).json({ ok: false, error: 'invalid_lead_id' });
    return null;
  }

  const lead = await buscarLead(supabase, tenantId, leadId);
  if (!lead) {
    res.status(404).json({ ok: false, error: 'lead_not_found' });
    return null;
  }

  const ehOwnerDaPlataforma = isPlatformOwner(req.userEmail);
  const role = ehOwnerDaPlataforma ? null : await papelNoTenant(supabase, req.userId, tenantId);
  if (!podeVerCadencia({ ehOwnerDaPlataforma, role, userId: req.userId, lead })) {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return null;
  }
  return { tenantId, lead };
}

/** Nome para o quadrado: o do perfil, senão o e-mail. Nunca o uuid. */
async function nomeDoUsuario(supabase, userId, email) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.full_name?.trim() || email || null;
}

export function registerLeadToquesRoutes(app, supabase) {
  const requireAuth = makeRequireSupabaseAuth(supabase);

  app.get('/api/v1/leads/:leadId/toques', requireAuth, async (req, res) => {
    try {
      const acesso = await acessarLead(supabase, req, res);
      if (!acesso) return undefined;

      const { data, error } = await supabase
        .from('lead_toques')
        .select(COLUNAS)
        .eq('tenant_id', acesso.tenantId)
        .eq('lead_id', acesso.lead.id)
        .order('executado_em', { ascending: true })
        .limit(LIMITE_TOQUES);
      if (error) throw error;

      return res.json({ ok: true, toques: data ?? [] });
    } catch (err) {
      console.error('[lead-toques] erro lendo toques:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/v1/leads/:leadId/toques', requireAuth, async (req, res) => {
    try {
      const validado = normalizarToque(req.body);
      if (!validado.ok) {
        return res.status(400).json({ ok: false, error: 'invalid_body', details: validado.details });
      }

      const acesso = await acessarLead(supabase, req, res);
      if (!acesso) return undefined;

      const { data, error } = await supabase
        .from('lead_toques')
        .insert({
          ...validado.row,
          tenant_id: acesso.tenantId,
          lead_id: acesso.lead.id,
          lead_source: acesso.lead.tabela,
          executado_por: req.userId,
          executado_por_nome: await nomeDoUsuario(supabase, req.userId, req.userEmail),
        })
        .select(COLUNAS)
        .single();
      if (error) throw error;

      // O próximo toque vira compromisso na agenda (e prazo da regra das 24h).
      // A função engole a própria falha e loga: o toque já está gravado e não
      // pode ser desfeito por um erro da agenda.
      await sincronizarAgendaDoToque({
        supabase,
        toque: data,
        tenantId: acesso.tenantId,
        corretorEmail: req.userEmail,
        lead: acesso.lead,
      });

      return res.status(201).json({ ok: true, toque: data });
    } catch (err) {
      console.error('[lead-toques] erro registrando toque:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  /**
   * Desfazer existe para corrigir clique errado, não para reescrever história:
   * só o ÚLTIMO toque do lead, e só por quem o registrou. Apagar um toque do
   * meio renumeraria todos os seguintes na métrica.
   */
  app.delete('/api/v1/leads/:leadId/toques/:toqueId', requireAuth, async (req, res) => {
    try {
      const acesso = await acessarLead(supabase, req, res);
      if (!acesso) return undefined;

      const { data: ultimos, error: erroBusca } = await supabase
        .from('lead_toques')
        .select('id, executado_por')
        .eq('tenant_id', acesso.tenantId)
        .eq('lead_id', acesso.lead.id)
        .order('executado_em', { ascending: false })
        .limit(1);
      if (erroBusca) throw erroBusca;

      const ultimo = ultimos?.[0];
      if (!ultimo) return res.status(404).json({ ok: false, error: 'toque_not_found' });
      if (ultimo.id !== req.params.toqueId) return res.status(409).json({ ok: false, error: 'not_latest' });
      if (ultimo.executado_por !== req.userId) return res.status(403).json({ ok: false, error: 'not_own' });

      const { error } = await supabase
        .from('lead_toques')
        .delete()
        .eq('id', ultimo.id)
        .eq('tenant_id', acesso.tenantId);
      if (error) throw error;

      return res.json({ ok: true });
    } catch (err) {
      console.error('[lead-toques] erro desfazendo toque:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}
