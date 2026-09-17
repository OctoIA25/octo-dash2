/**
 * Dedup da ENTRADA de lead — mesma pessoa chegando em formatos diferentes.
 *
 * O PROBLEMA QUE ISTO RESOLVE. Cada origem grava o telefone do seu jeito
 * ("+55 19 99999-9999", "19999999999", "5519999999999", wa_id sem o 9º
 * dígito). A trava do banco (unique_phone_per_tenant) compara STRING, então o
 * mesmo número em outro formato passava direto e virava um segundo lead.
 *
 * ONDE ISTO ENTRA. Antes do INSERT, em insertOrReviveLead (o caminho comum de
 * ZAP, OLX, Imovelweb, Meta e POST /api/v1/leads): acha o lead existente pela
 * chave canônica e reaproveita a ficha em vez de criar outra.
 *
 * O QUE NÃO ESTÁ AQUI. A Lia (n8n) insere direto na tabela, sem passar pelo
 * servidor — o dedup dela depende de mudança do lado dela ou de uma trava no
 * banco, decisão que ficou para depois (ver 20260917_leads_phone_key.sql).
 */

import { chaveTelefone } from './utils/phone.js';
import { chaveEmail } from './utils/email.js';

/**
 * O bastante para decidir o reaproveitamento e montar o aviso. Inclui o estado
 * do atendimento (etapa, temperatura, corretor) porque é justamente o que a
 * entrada nova NÃO pode atropelar — ver patchDeReentrada.
 */
export const COLUNAS_LEAD_DEDUP =
  'id, name, phone, email, source, property_code, created_at, status, temperature, comments, '
  + 'assigned_agent_id, assigned_agent_name';

/**
 * Lead existente do tenant com o MESMO número, em qualquer formato.
 *
 * Telefone inválido/incompleto não tem chave e nunca busca: '+5519' é de
 * muita gente diferente e agruparia leads que não têm relação (CA-10).
 *
 * @returns {Promise<object|null>} o mais recente, ou null.
 */
export async function buscarLeadPeloTelefone(supabase, tenantId, telefone) {
  const chave = chaveTelefone(telefone);
  if (!chave || !tenantId) return null;

  const { data, error } = await supabase
    .from('leads')
    .select(COLUNAS_LEAD_DEDUP)
    .eq('tenant_id', tenantId)
    .eq('phone_key', chave)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    // A entrada do lead não pode falhar por causa da consulta de dedup: sem
    // ela o comportamento volta a ser o de antes (a constraint ainda pega o
    // formato idêntico). Loga alto porque, na prática, significa banco atrás
    // do código — a coluna phone_key da migration 20260917 não foi aplicada.
    console.error('❌ dedup por telefone falhou, seguindo sem dedup:', error.message);
    return null;
  }
  return data?.[0] ?? null;
}

/**
 * Campos que a entrada nova só PREENCHE quando faltam — nunca substitui.
 *
 * Contato (nome, e-mail, observação): o mesmo telefone chega com e-mail
 * pessoal num portal e corporativo noutro (caso real de 13/09); trocar pelo
 * mais novo perde dado bom, e a observação pode ser nota escrita pelo corretor.
 *
 * Temperatura: 'Frio' é o DEFAULT do payload do portal, não uma afirmação
 * sobre o lead — quem marcou 'Quente' foi o corretor, e o formulário repetido
 * não sabe disso.
 *
 * A ETAPA fica de fora de propósito: decisão do negócio em 17/09/2026 — quem
 * preenche o formulário de novo é oportunidade nova e VOLTA para o começo do
 * funil ('Novos Leads'), junto com o `created_at` que o revive já reescreve
 * para trazer o lead ao topo da lista.
 */
const SO_PREENCHE_SE_FALTA = ['name', 'email', 'comments', 'temperature'];

/**
 * O que a nova entrada escreve no lead que já existe.
 *
 * Regra: completa o que falta, não atropela o que já está em andamento.
 * `phone` fica de fora pelo motivo de sempre: é a identidade do lead.
 *
 * @param {object} existente lead já gravado (COLUNAS_LEAD_DEDUP)
 * @param {object} novo      payload do lead que acabou de chegar
 * @param {{forcarAtribuicao?: boolean}} [opts] `true` só na roleta forçada,
 *   onde distribuir o lead é o próprio pedido de quem chamou.
 * @returns {object} patch para o UPDATE
 */
export function patchDeReentrada(existente, novo, { forcarAtribuicao = false } = {}) {
  const { tenant_id, phone, created_at, assigned_agent_id, assigned_agent_name, is_exclusive, ...resto } = novo;

  // Ausência (null/undefined) nunca apaga o que o lead já tem; false/0/'' são
  // valor e passam. Sem isto, quem já era lead com `property_code` ('RESERVA
  // CASTANHEIRA', 'L014') e voltava por um anúncio fora do de-para perdia o
  // código — e o trigger de reclassificação, que roda neste mesmo UPDATE,
  // rebaixava a classificação para 'indefinido'.
  const patch = Object.fromEntries(Object.entries(resto).filter(([, v]) => v != null));

  for (const campo of SO_PREENCHE_SE_FALTA) {
    const jaTem = existente?.[campo] != null && existente[campo] !== '';
    if (jaTem) delete patch[campo];
  }

  // Corretor: id e nome andam JUNTOS (gravar só o nome foi o bug de 13/09, em
  // que o lead ficou visível para um corretor com o nome de outro). Lead que já
  // tem dono não muda de mãos por causa de um formulário repetido — quem
  // redistribui é a roleta/bolsão/transferência.
  if (forcarAtribuicao || !existente?.assigned_agent_id) {
    if (assigned_agent_id != null) patch.assigned_agent_id = assigned_agent_id;
    if (assigned_agent_name != null) patch.assigned_agent_name = assigned_agent_name;
  }

  // Exclusividade descreve o imóvel do interesse novo: só acompanha quando o
  // código do imóvel também entra, senão ficaria falando de outro imóvel.
  if (patch.property_code != null && is_exclusive != null) patch.is_exclusive = is_exclusive;

  return patch;
}

/**
 * Dados de contato que vieram DIFERENTES do que o lead já tinha. Não bloqueia
 * nada: vira aviso no histórico para o corretor conferir (o negócio pediu
 * "investigar antes de mesclar").
 *
 * @returns {string[]} ex.: ['email'] ou ['nome', 'email']
 */
export function divergenciasDeContato(existente, novo) {
  const divergencias = [];
  const emailNovo = chaveEmail(novo?.email);
  const emailAntigo = chaveEmail(existente?.email);
  if (emailNovo && emailAntigo && emailNovo !== emailAntigo) divergencias.push('email');

  const nomeNovo = String(novo?.name ?? '').trim().toLowerCase();
  const nomeAntigo = String(existente?.name ?? '').trim().toLowerCase();
  if (nomeNovo && nomeAntigo && nomeNovo !== nomeAntigo) divergencias.push('nome');
  return divergencias;
}

/**
 * Linha de `lead_events` que registra a nova entrada NO LEAD EXISTENTE (CA-02).
 *
 * Guarda o que veio exatamente como veio — telefone no formato da origem,
 * e-mail, código do imóvel — porque o UPDATE do lead não guarda nada disso: é
 * aqui que fica o rastro de que a pessoa voltou por outro anúncio/portal.
 *
 * A chave de idempotência usa o id da origem: reprocessar o mesmo webhook não
 * duplica o aviso.
 */
export function eventoDeReentrada({ existente, novo, divergencias = [] }) {
  const origem = novo?.source ?? null;
  const idDaOrigem = novo?.source_lead_id || `${existente?.id}:${Date.now()}`;
  return {
    event_type: 'lead.nova_entrada',
    para: origem,
    ator_tipo: 'sistema',
    idempotency_key: `nova_entrada:${idDaOrigem}`,
    metadata: Object.fromEntries(Object.entries({
      origem,
      telefone_recebido: novo?.phone ?? null,
      email_recebido: novo?.email ?? null,
      nome_recebido: novo?.name ?? null,
      property_code: novo?.property_code ?? null,
      // A mensagem da entrada nova não entra no lead quando ele já tem
      // observação (pode ser nota do corretor), então fica guardada aqui.
      mensagem: novo?.comments ? String(novo.comments).slice(0, 500) : null,
      divergencias: divergencias.length ? divergencias : null,
    }).filter(([, v]) => v != null)),
  };
}
