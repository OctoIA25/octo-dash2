/**
 * Cadência da LIA — acesso ao banco. Nenhuma regra mora aqui (ela está em
 * compute.js); este módulo só busca linhas e escreve.
 *
 * CUSTO FIXO. A leitura do card faz no máximo 6 consultas, independente de o
 * lead ter 2 ou 200 cadências: lead (1, mais 1 se for de kenlo_leads),
 * follow-ups (1), conversa (1), mensagens do lead (1), lia_lead_extra (1).
 * Nada de consulta dentro de laço.
 *
 * TETOS EXPLÍCITOS. O PostgREST corta em 1000 linhas sem avisar e sem erro —
 * contar `.length` daria 1000 como se fosse o total. Por isso os limites são
 * declarados aqui e a leitura devolve `truncated` quando bate no teto, para a
 * tela poder dizer que está mostrando um recorte.
 *
 * ISOLAMENTO. O servidor usa service_role e bypassa RLS, então TODA consulta
 * leva `.eq('tenant_id', ...)` — o tenant vem da autenticação da rota, nunca
 * do corpo da requisição.
 */

import { phoneVariants } from '../utils/phone.js';

/** Cadências por lead. 200 cobre folgado o maior histórico real (3 por ciclo). */
const LIMITE_FOLLOWUPS = 200;
/** Mensagens do lead na janela analisada — só o instante, nunca o texto. */
const LIMITE_INBOUND = 500;

/** 22P02 = uuid malformado na URL. Para quem chama isso é "não existe". */
const ehNaoEncontrado = (error) => !error || error.code === '22P02';

/**
 * Localiza o lead nas duas tabelas que o CRM usa, na mesma ordem do resto do
 * repositório (`leads` primeiro, `kenlo_leads` como espelho de portal).
 *
 * NOMES NORMALIZADOS. As duas tabelas guardam o mesmo conceito com nomes
 * diferentes; quem chama não deveria precisar saber de qual veio. O dono sai
 * em `owner_id` (em `leads` é `assigned_agent_id`, TEXT com o uuid dentro; em
 * `kenlo_leads` é `attended_by_id`, com o auth_user_id), a etapa em `etapa`
 * (status/stage) e assim por diante.
 *
 * Os campos além de id/phone/owner_id existem para o histórico do lead
 * (server/leadEvents): são a base dos eventos derivados e do eco que a rota
 * da LIA devolve. A cadência simplesmente os ignora.
 */
export async function buscarLead(supabase, tenantId, leadId) {
  const { data: lead, error } = await supabase
    .from('leads')
    .select(
      'id, name, phone, source, status, assigned_agent_id, assigned_agent_name, ' +
      'assigned_at, archived_at, archive_reason, created_at',
    )
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error && !ehNaoEncontrado(error)) throw error;
  if (lead) {
    return {
      id: lead.id,
      tabela: 'leads',
      phone: lead.phone ?? null,
      owner_id: lead.assigned_agent_id ? String(lead.assigned_agent_id) : null,
      nome: lead.name ?? null,
      origem: lead.source ?? null,
      etapa: lead.status ?? null,
      corretor_nome: lead.assigned_agent_name ?? null,
      assigned_at: lead.assigned_at ?? null,
      archived_at: lead.archived_at ?? null,
      archive_reason: lead.archive_reason ?? null,
      created_at: lead.created_at ?? null,
      // Em `leads` o created_at já é a data real do lead — não há event time
      // separado como o lead_timestamp do Kenlo.
      event_at: lead.created_at ?? null,
    };
  }

  const { data: kenlo, error: erroKenlo } = await supabase
    .from('kenlo_leads')
    .select(
      'id, client_name, client_phone, portal, stage, attended_by_id, attended_by_name, ' +
      'archived_at, archive_reason, created_at, lead_timestamp',
    )
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (erroKenlo && !ehNaoEncontrado(erroKenlo)) throw erroKenlo;
  if (!kenlo) return null;

  return {
    id: kenlo.id,
    tabela: 'kenlo_leads',
    phone: kenlo.client_phone ?? null,
    owner_id: kenlo.attended_by_id ? String(kenlo.attended_by_id) : null,
    nome: kenlo.client_name ?? null,
    origem: kenlo.portal ?? null,
    etapa: kenlo.stage ?? null,
    corretor_nome: kenlo.attended_by_name ?? null,
    // kenlo_leads não tem o par de assigned_at — a data de atribuição só
    // existe no espelho `bolsao` (data_atribuicao), lido no histórico.
    assigned_at: null,
    archived_at: kenlo.archived_at ?? null,
    archive_reason: kenlo.archive_reason ?? null,
    created_at: kenlo.created_at ?? null,
    // lead_timestamp é o instante em que o lead surgiu no portal; created_at é
    // quando o sync o trouxe. O histórico quer o primeiro.
    event_at: kenlo.lead_timestamp ?? kenlo.created_at ?? null,
  };
}

/**
 * Follow-ups do lead. Casa por `lead_id` (que é sempre um id de `public.leads`)
 * E por telefone — um lead que veio de kenlo_leads tem id que a LIA não
 * conhece, e só o telefone o alcança.
 */
async function buscarFollowups(supabase, tenantId, lead) {
  const variantes = phoneVariants(lead.phone);
  const filtros = [`lead_id.eq.${lead.id}`];
  if (variantes.length > 0) filtros.push(`lead_phone.in.(${variantes.join(',')})`);

  const { data, error } = await supabase
    .from('lia_followups')
    .select(
      'id, lead_id, lead_phone, scheduled_at, sent_at, status, tag, motivo, attempt_number, ' +
      'cancelled_at, cancelled_reason, last_lead_msg_at, channel, replied_at, outcome, ' +
      'template_name, created_at',
    )
    .eq('tenant_id', tenantId)
    .or(filtros.join(','))
    .order('created_at', { ascending: false })
    .limit(LIMITE_FOLLOWUPS);
  if (error) throw error;

  const linhas = data ?? [];
  return { followups: linhas, truncated: linhas.length >= LIMITE_FOLLOWUPS };
}

/**
 * Instantes das mensagens que o LEAD mandou, para saber se ele respondeu.
 *
 * Só horários: `body` nunca sai daqui. O conteúdo da conversa continua no
 * /chat, que tem RLS própria por corretor — a cadência é métrica.
 *
 * `wa_timestamp` é o relógio da Meta e é o que vale; quando vem nulo (inbound
 * gravado pelo app sem esse campo), cai para `created_at`.
 */
async function buscarInbound(supabase, tenantId, lead, desde) {
  const variantes = phoneVariants(lead.phone);
  if (variantes.length === 0) return [];

  const { data: conversas, error: erroConversa } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('contact_phone', variantes)
    // A conversa com histórico vence a casca vazia criada pelo trigger.
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (erroConversa) throw erroConversa;

  const conversaId = conversas?.[0]?.id;
  if (!conversaId) return [];

  let q = supabase
    .from('whatsapp_messages')
    .select('wa_timestamp, created_at')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversaId)
    .eq('direction', 'inbound');
  // Mensagem anterior ao primeiro envio não pode responder a nada.
  if (desde) q = q.gte('created_at', desde);

  const { data, error } = await q.order('created_at', { ascending: true }).limit(LIMITE_INBOUND);
  if (error) throw error;

  return (data ?? []).map((m) => m.wa_timestamp ?? m.created_at).filter(Boolean);
}

/** Contagem de interações que a LIA mantém por lead. Ausente é normal. */
async function buscarLeadExtra(supabase, tenantId, leadId) {
  const { data, error } = await supabase
    .from('lia_lead_extra')
    .select('interaction_count, first_seen, last_seen')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error && !ehNaoEncontrado(error)) throw error;
  return data ?? null;
}

/**
 * Tudo que compute.js precisa, em consultas de custo fixo.
 * Follow-ups vêm primeiro porque definem a janela das mensagens.
 */
export async function carregarCadencia(supabase, tenantId, lead) {
  const { followups, truncated } = await buscarFollowups(supabase, tenantId, lead);

  const envios = followups.map((f) => f.sent_at).filter(Boolean).sort();
  const desde = envios[0] ?? null;

  const [inboundTimes, leadExtra] = await Promise.all([
    buscarInbound(supabase, tenantId, lead, desde),
    buscarLeadExtra(supabase, tenantId, lead.id),
  ]);

  return { followups, inboundTimes, leadExtra, truncated };
}

/**
 * Grava a cadência reportada pelo app da LIA.
 *
 * Não é `upsert`: a mesma cadência chega três vezes (agendou, enviou,
 * encerrou) e cada chamada traz só o que mudou. Um upsert com a linha inteira
 * sobrescreveria com NULL o que a chamada anterior gravou. Então: procura pela
 * chave de idempotência, atualiza se achou, insere se não.
 *
 * A corrida (duas chamadas simultâneas com a mesma chave) é resolvida pelo
 * índice único: quem perde recebe 23505 e vira UPDATE.
 *
 * @returns {{id: string, created: boolean}}
 */
export async function gravarCadencia(supabase, tenantId, row) {
  const { data: existente, error: erroBusca } = await supabase
    .from('lia_followups')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', row.idempotency_key)
    .maybeSingle();
  if (erroBusca) throw erroBusca;

  if (existente) {
    const { error } = await supabase.from('lia_followups').update(row).eq('id', existente.id);
    if (error) throw error;
    return { id: existente.id, created: false };
  }

  const { data, error } = await supabase
    .from('lia_followups')
    // `status` só ganha default aqui: no UPDATE, ausente significa "não mexa".
    .insert({ tenant_id: tenantId, status: 'pending', ...row })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const { data: vencedor, error: erroRetry } = await supabase
      .from('lia_followups')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', row.idempotency_key)
      .single();
    if (erroRetry) throw erroRetry;
    const { error: erroUpdate } = await supabase
      .from('lia_followups')
      .update(row)
      .eq('id', vencedor.id);
    if (erroUpdate) throw erroUpdate;
    return { id: vencedor.id, created: false };
  }
  if (error) throw error;

  return { id: data.id, created: true };
}
