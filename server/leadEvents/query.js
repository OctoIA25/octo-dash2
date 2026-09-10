/**
 * Histórico do lead — acesso ao banco. Nenhuma regra mora aqui (ela está em
 * compute.js); este módulo só busca linhas e escreve.
 *
 * ISOLAMENTO. O servidor usa service_role e bypassa RLS, então TODA consulta
 * leva `.eq('tenant_id', ...)` — o tenant vem da autenticação da rota, nunca
 * do corpo da requisição. É o que impede a LIA de um tenant escrever no
 * histórico de outro.
 *
 * TETO EXPLÍCITO. O PostgREST corta em 1000 linhas sem avisar e sem erro;
 * contar `.length` daria 1000 como se fosse o total. O limite é declarado
 * aqui e a leitura devolve `truncated` para a tela poder dizer que está
 * mostrando um recorte.
 */

import { phoneVariants } from '../utils/phone.js';
import { buscarLead } from '../liaCadencia/query.js';

/** Eventos por lead. 300 cobre folgado o lead mais movimentado. */
const LIMITE_EVENTOS = 300;

/** 22P02 = uuid malformado na consulta. Para quem chama isso é "não existe". */
const ehNaoEncontrado = (error) => !error || error.code === '22P02';

const COLUNAS_EVENTO =
  'id, lead_id, lead_source, event_type, descricao, de, para, ' +
  'ator_tipo, ator_user_id, ator_nome, metadata, created_at';

/**
 * Resolve o lead a partir do telefone, nas duas tabelas.
 *
 * POR QUE ISTO EXISTE. Lead de origem Kenlo/C2S tem id que a LIA não conhece —
 * ela só tem o telefone de quem está atendendo. Sem esta âncora, metade dos
 * leads ficaria fora do histórico.
 *
 * MAIS RECENTE VENCE. Um mesmo telefone vira várias linhas de lead (cada
 * anúncio pelo qual a pessoa entrou em contato é um lead novo — ver
 * fetchImoveisDeInteresse no front). Não há como saber por telefone qual deles
 * a LIA tem em mãos, então vale o mais recente, que é o atendimento em curso.
 * A rota devolve o lead resolvido no corpo da resposta justamente para que
 * quem integra confira se é o mesmo que ela achava.
 */
export async function buscarLeadPorTelefone(supabase, tenantId, telefone) {
  const variantes = phoneVariants(telefone);
  if (variantes.length === 0) return null;

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('phone', variantes)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error && !ehNaoEncontrado(error)) throw error;
  if (lead?.[0]?.id) return buscarLead(supabase, tenantId, lead[0].id);

  const { data: kenlo, error: erroKenlo } = await supabase
    .from('kenlo_leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('client_phone', variantes)
    .order('created_at', { ascending: false })
    .limit(1);
  if (erroKenlo && !ehNaoEncontrado(erroKenlo)) throw erroKenlo;
  if (!kenlo?.[0]?.id) return null;

  return buscarLead(supabase, tenantId, kenlo[0].id);
}

/**
 * Eventos gravados do lead, mais antigo primeiro (a tela lê de cima para
 * baixo, como uma história).
 */
export async function carregarEventos(supabase, tenantId, lead) {
  const { data, error } = await supabase
    .from('lead_events')
    .select(COLUNAS_EVENTO)
    .eq('tenant_id', tenantId)
    .eq('lead_id', String(lead.id))
    .eq('lead_source', lead.tabela)
    .order('created_at', { ascending: true })
    .limit(LIMITE_EVENTOS);
  if (error) throw error;

  const linhas = data ?? [];
  return { eventos: linhas, truncated: linhas.length >= LIMITE_EVENTOS };
}

/**
 * Datas do espelho do bolsão. É a única fonte de "quando o corretor confirmou
 * o atendimento" e, para lead de kenlo_leads, também a única de "quando foi
 * atribuído" (essa tabela não tem o par de assigned_at).
 *
 * Ausente é normal: nem todo lead passa pelo bolsão.
 */
export async function buscarBolsao(supabase, tenantId, lead) {
  const coluna = lead.tabela === 'leads' ? 'source_lead_id' : 'source_kenlo_id';

  const { data, error } = await supabase
    .from('bolsao')
    .select('data_atribuicao, data_atendimento, corretor_responsavel')
    .eq('tenant_id', tenantId)
    .eq(coluna, String(lead.id))
    .maybeSingle();
  if (error && !ehNaoEncontrado(error)) throw error;
  return data ?? null;
}

/**
 * Grava o evento reportado por quem integra de fora.
 *
 * Não é `upsert`: o mesmo evento pode chegar duas vezes com a mesma chave (a
 * LIA anuncia o que vai fazer e depois confirma) e cada chamada traz só o que
 * mudou. Um upsert com a linha inteira sobrescreveria com NULL o que a chamada
 * anterior gravou. Então: procura pela chave, atualiza se achou, insere se não.
 *
 * A corrida (duas chamadas simultâneas com a mesma chave) é resolvida pelo
 * índice único ux_lead_events_idem: quem perde recebe 23505 e vira UPDATE.
 *
 * @returns {{id: string, created: boolean}}
 */
export async function gravarEvento(supabase, tenantId, lead, row) {
  const { data: existente, error: erroBusca } = await supabase
    .from('lead_events')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', row.idempotency_key)
    .maybeSingle();
  if (erroBusca) throw erroBusca;

  if (existente) {
    const { error } = await supabase.from('lead_events').update(row).eq('id', existente.id);
    if (error) throw error;
    return { id: existente.id, created: false };
  }

  // lead_id/lead_source só no INSERT: no UPDATE eles já estão certos e
  // reescrevê-los permitiria mover um evento de lead com um retry.
  const { data, error } = await supabase
    .from('lead_events')
    .insert({ tenant_id: tenantId, lead_id: String(lead.id), lead_source: lead.tabela, ...row })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const { data: vencedor, error: erroRetry } = await supabase
      .from('lead_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', row.idempotency_key)
      .single();
    if (erroRetry) throw erroRetry;
    const { error: erroUpdate } = await supabase
      .from('lead_events')
      .update(row)
      .eq('id', vencedor.id);
    if (erroUpdate) throw erroUpdate;
    return { id: vencedor.id, created: false };
  }
  if (error) throw error;

  return { id: data.id, created: true };
}
