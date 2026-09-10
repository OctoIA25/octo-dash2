/**
 * 🕘 Histórico do lead — rotas.
 *
 *   GET  /api/v1/leads/:leadId/eventos  — linha do tempo no card do lead (JWT)
 *   POST /api/v1/lia/lead-events        — a LIA reporta o que fez (service token)
 *
 * POR QUE A LEITURA PASSA PELO SERVIDOR
 * `lead_events` está com RLS ligada e sem policy: pelo PostgREST devolve lista
 * vazia para qualquer chave que não seja a service_role. É de propósito — a
 * RLS de `leads` neste banco é frouxa demais (as linhas são legíveis sem JWT)
 * para confiar numa policy nova. Quem recorta quem pode ver é este arquivo,
 * com a MESMA regra da cadência: gestão vê o tenant, corretor vê o que é dele.
 *
 * O QUE PROTEGE CONTRA "A LIA GRAVOU NO LEAD ERRADO"
 * Quem integra nunca declara em que lead está escrevendo. Manda uma âncora
 * (lead_id ou lead_phone) e o SERVIDOR resolve dentro do tenant; lead que não
 * existe é 404, nunca criação implícita. A resposta devolve o lead e o
 * corretor COMO A DASH OS ENXERGA, para quem chamou comparar na hora com o que
 * achava — a divergência aparece na resposta, não semanas depois no card.
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
import { autenticar, papelNoTenant, podeVerCadencia } from '../liaCadencia/index.js';
import { buscarLead } from '../liaCadencia/query.js';
import { buscarLeadPorTelefone, carregarEventos, buscarBolsao, gravarEvento } from './query.js';
import { montarHistorico } from './compute.js';
import { normalizarEvento } from './normalize.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O eco que vai na resposta da escrita. É a razão de ser do contrato: quem
 * integra confere se o lead/corretor que a dash resolveu é o mesmo que ele
 * tinha em mãos.
 */
const ecoDoLead = (lead) => ({
  id: lead.id,
  source: lead.tabela,
  nome: lead.nome ?? null,
  etapa: lead.etapa ?? null,
  corretor: { nome: lead.corretor_nome ?? null, user_id: lead.owner_id ?? null },
});

export function registerLeadEventsRoutes(app, supabase, options = {}) {
  const requireAuth = makeRequireSupabaseAuth(supabase);

  // ---------------------------------------------------------------- leitura
  app.get('/api/v1/leads/:leadId/eventos', requireAuth, async (req, res) => {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
      const { tenantId } = resolved;

      const { leadId } = req.params;
      if (!UUID_RE.test(leadId)) return res.status(400).json({ ok: false, error: 'invalid_lead_id' });

      const lead = await buscarLead(supabase, tenantId, leadId);
      if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });

      // Mesma regra da cadência de propósito: são duas seções do MESMO card, e
      // um corretor que vê uma e não a outra é bug de tela, não segurança.
      const ehOwnerDaPlataforma = isPlatformOwner(req.userEmail);
      const role = ehOwnerDaPlataforma ? null : await papelNoTenant(supabase, req.userId, tenantId);
      if (!podeVerCadencia({ ehOwnerDaPlataforma, role, userId: req.userId, lead })) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }

      const [{ eventos, truncated }, bolsao] = await Promise.all([
        carregarEventos(supabase, tenantId, lead),
        buscarBolsao(supabase, tenantId, lead),
      ]);

      const historico = montarHistorico({ lead, eventos, bolsao, truncated });
      return res.json({ ok: true, ...historico });
    } catch (err) {
      console.error('[lead-events] erro lendo histórico:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  // ----------------------------------------------------------------- escrita
  app.post('/api/v1/lia/lead-events', async (req, res) => {
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

      const validado = normalizarEvento(req.body);
      if (!validado.ok) {
        return res.status(422).json({ ok: false, error: 'invalid_fields', details: validado.details });
      }

      // O id vence o telefone: é a âncora exata. O telefone é o fallback para
      // lead de origem Kenlo/C2S, cujo uuid quem integra não conhece.
      const lead = validado.leadId
        ? await buscarLead(supabase, tenantId, validado.leadId)
        : await buscarLeadPorTelefone(supabase, tenantId, validado.leadPhone);
      // Evento de lead que não é deste tenant seria linha órfã que nenhuma tela
      // mostra. Melhor recusar e deixar quem integra saber.
      if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });

      const { id, created } = await gravarEvento(supabase, tenantId, lead, validado.row);
      return res.status(created ? 201 : 200).json({ ok: true, id, created, lead: ecoDoLead(lead) });
    } catch (err) {
      console.error('[lead-events] erro gravando evento:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  if (options.verbose !== false) {
    console.log('   ├─ 🕘 GET  /api/v1/leads/:leadId/eventos                   → Histórico do lead no card');
    console.log('   └─ 🕘 POST /api/v1/lia/lead-events                         → App da LIA reporta evento do lead');
  }
}
