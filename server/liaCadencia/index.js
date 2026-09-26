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
import { buscarLead, carregarCadencia, carregarConfigAgenda, gravarCadencia } from './query.js';
// Mora em leadEvents porque nasceu lá; é a MESMA âncora por telefone que a LIA
// usa nas duas rotas. Duplicar daria duas regras de resolução divergentes.
import { buscarLeadPorTelefone } from '../leadEvents/query.js';
import { resumirCadencia } from './compute.js';
import { normalizarCadencia } from './normalize.js';
import { primeiroHorarioPermitido } from './agenda.js';
import { createHash } from 'node:crypto';

/** Impressão digital de um segredo, para log. Nunca o segredo em si. */
const digital = (v) => (v ? createHash('sha256').update(String(v).trim()).digest('hex').slice(0, 8) : '-');

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
/**
 * O segredo de serviço da LIA, em um lugar só.
 *
 * `AGENT_TELEMETRY_SERVICE_TOKEN` entra na cadeia porque a telemetria tinha a
 * sua própria: quem integra manda o MESMO header para /lia/* e para
 * /agent-telemetry/*, e em 26/09 levou 401 num e 200 no outro. Ou as duas
 * rotas resolvem o segredo do mesmo jeito, ou a promessa de "um token só" é
 * falsa — e foi o que eu afirmei a eles por escrito, sem conferir.
 */
export function segredoDeServico() {
  return (
    process.env.LIA_SERVICE_TOKEN ||
    process.env.AGENT_TELEMETRY_SERVICE_TOKEN ||
    process.env.DISPARADOR_SERVICE_TOKEN ||
    null
  );
}

/** Qual env respondeu, para o log dizer o que está configurado. */
export function nomeDoSegredo() {
  if (process.env.LIA_SERVICE_TOKEN) return 'LIA_SERVICE_TOKEN';
  if (process.env.AGENT_TELEMETRY_SERVICE_TOKEN) return 'AGENT_TELEMETRY_SERVICE_TOKEN';
  if (process.env.DISPARADOR_SERVICE_TOKEN) return 'DISPARADOR_SERVICE_TOKEN (fallback)';
  return 'NENHUMA CONFIGURADA';
}

/**
 * O token bate? `trim()` dos DOIS lados de propósito: colar o valor no painel
 * do EasyPanel deixa \n no fim, e sem isto a mesma credencial passa numa rota
 * e é recusada na outra.
 */
export function tokenConfere(enviado) {
  const esperado = segredoDeServico();
  return Boolean(esperado) && String(enviado).trim() === String(esperado).trim();
}

export async function autenticar(req, supabase) {
  const enviado = req.headers['x-service-token'];
  if (enviado != null) {
    const esperado = segredoDeServico();
    if (!tokenConfere(enviado)) {
      // 401 sozinho não distingue "env com outro nome/ausente" de "valor
      // diferente" — foi o que travou a integração da LIA em 10/set/2026.
      // Impressão digital, nunca o segredo.
      console.warn('[lia-auth] x-service-token recusado', {
        env: nomeDoSegredo(),
        esperado: digital(esperado),
        recebido: digital(enviado),
      });
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

  // ------------------------------------------------- retorno agendado (P2.5)
  /**
   * O corretor marca, remarca ou cancela o retorno de um lead pelo card.
   *
   * MESMO PORTÃO DA LEITURA: quem pode ver a cadência do lead pode mexer no
   * retorno dele. Uma segunda regra aqui divergiria da primeira no dia em que
   * uma das duas mudasse.
   *
   * Respeita o horário de não incomodar como o pedido da LIA respeita — o
   * corretor também não deve marcar mensagem para as 3h da manhã — e devolve a
   * hora final para a tela mostrar o que foi realmente gravado.
   */
  app.post('/api/v1/leads/:leadId/retorno', requireAuth, async (req, res) => {
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

      const cancelarId = String(req.body?.cancelar ?? '').trim();
      if (cancelarId) {
        const { error } = await supabase
          .from('lia_followups')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_reason: 'cancelado_na_dash',
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('lead_id', leadId)
          .eq('id', cancelarId);
        if (error) throw error;
        return res.json({ ok: true, cancelado: cancelarId });
      }

      const quando = Date.parse(req.body?.quando ?? '');
      if (Number.isNaN(quando)) return res.status(422).json({ ok: false, error: 'invalid_quando' });
      // Retorno no passado não é agendamento: é uma linha que já nasce atrasada.
      if (quando < Date.now() - 60_000) return res.status(422).json({ ok: false, error: 'quando_no_passado' });

      const cfg = await carregarConfigAgenda(supabase, tenantId);
      const permitido = primeiroHorarioPermitido(new Date(quando), cfg);
      if (!permitido) return res.status(422).json({ ok: false, error: 'sem_horario_permitido' });

      const motivo = String(req.body?.motivo ?? '').trim().slice(0, 4000) || 'retorno marcado pelo corretor';
      const idAnterior = String(req.body?.substituir ?? '').trim();

      // Remarcar é cancelar o anterior e criar o novo: deixar os dois pendentes
      // mandaria duas mensagens ao cliente.
      if (idAnterior) {
        const { error } = await supabase
          .from('lia_followups')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_reason: 'rescheduled',
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('lead_id', leadId)
          .eq('id', idAnterior);
        if (error) throw error;
      }

      const { id, created } = await gravarCadencia(supabase, tenantId, {
        lead_id: leadId,
        // A chave de idempotência inclui o instante, então dois cliques rápidos
        // no mesmo horário não viram duas linhas.
        idempotency_key: `dash:retorno:${leadId}:${permitido.quando.toISOString()}`,
        status: 'pending',
        scheduled_at: permitido.quando.toISOString(),
        motivo,
        pedido_por: 'corretor',
        tag: 'retorno_manual',
        channel: 'whatsapp',
        updated_at: new Date().toISOString(),
      });

      return res.status(created ? 201 : 200).json({
        ok: true,
        id,
        created,
        agendado_para: permitido.quando.toISOString(),
        ajustado: permitido.ajustado,
      });
    } catch (err) {
      console.error('[lia-cadencia] erro no retorno agendado:', err?.message);
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
      // Pelo telefone vale o mesmo: era o único caminho que gravava sem
      // conferir nada, e telefone desconhecido virava linha solta em vez de 404.
      if (validado.row.lead_id) {
        const lead = await buscarLead(supabase, tenantId, validado.row.lead_id);
        if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });
      } else if (validado.row.lead_phone) {
        const lead = await buscarLeadPorTelefone(supabase, tenantId, validado.row.lead_phone);
        if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });
      }

      // AGENDA DA LIA (P2.5): o retorno que o LEAD pediu respeita o horário de
      // não incomodar. Pedido para as 3h da manhã não é recusado — é empurrado
      // para o primeiro horário permitido, e a resposta diz qual é, para a LIA
      // combinar isso com o cliente ("consigo te chamar às 9h, pode ser?").
      // Recusar perderia o pedido; mandar às 3h queimaria a imobiliária.
      let ajustado = false;
      if (validado.row.pedido_por === 'lead' && validado.row.scheduled_at) {
        const cfg = await carregarConfigAgenda(supabase, tenantId);
        const permitido = primeiroHorarioPermitido(new Date(validado.row.scheduled_at), cfg);
        if (permitido) {
          ajustado = permitido.ajustado;
          validado.row.scheduled_at = permitido.quando.toISOString();
        }
      }

      const { id, created } = await gravarCadencia(supabase, tenantId, validado.row);
      return res.status(created ? 201 : 200).json({
        ok: true,
        id,
        created,
        // Só aparece quando há agendamento — o eco é o que a LIA usa para
        // confirmar a hora ao cliente.
        ...(validado.row.scheduled_at
          ? { agendado_para: validado.row.scheduled_at, ajustado }
          : {}),
      });
    } catch (err) {
      console.error('[lia-cadencia] erro gravando cadência:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  if (options.verbose !== false) {
    console.log('   ├─ 🤖 GET  /api/v1/leads/:leadId/cadencia                 → Cadência da LIA no card do lead');
    console.log('   ├─ 🤖 POST /api/v1/leads/:leadId/retorno                  → Retorno agendado pelo corretor');
    console.log('   └─ 🤖 POST /api/v1/lia/cadencias                          → App da LIA reporta a cadência');
  }
}
