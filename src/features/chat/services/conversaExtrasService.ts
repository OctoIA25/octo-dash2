/**
 * O que a lista de conversas precisa saber além da própria conversa (P1.9).
 *
 * Quando EU li cada conversa, quais são de candidato a corretor, e quais
 * casam com a busca pelo CONTEÚDO das mensagens.
 */

import { supabase } from '@/lib/supabaseClient';
import type { ExtrasDaConversa } from '../components/ConversationList';

/** Menos que isto não usa o índice de trigrama e varreria a tabela por tecla. */
export const MINIMO_PARA_BUSCAR_CONTEUDO = 3;

export async function buscarExtrasDasConversas(
  tenantId: string
): Promise<Record<string, ExtrasDaConversa>> {
  if (!tenantId || tenantId === 'owner') return {};

  const { data, error } = await supabase.rpc('whatsapp_conversas_extras', { p_tenant_id: tenantId });
  // Sem os extras a lista continua funcionando: some o contador de não lidas
  // e a aba Recrutamento fica vazia. Nada some da tela, que é o que importa.
  if (error) return {};

  const mapa: Record<string, ExtrasDaConversa> = {};
  for (const l of (data ?? []) as Array<{
    conversation_id: string; lida_em: string | null;
    eh_recrutamento: boolean; candidato_id: string | null; candidato_nome: string | null;
  }>) {
    if (!l?.conversation_id) continue;
    mapa[l.conversation_id] = {
      lidaEm: l.lida_em,
      ehRecrutamento: l.eh_recrutamento === true,
      candidatoId: l.candidato_id,
      candidatoNome: l.candidato_nome,
    };
  }
  return mapa;
}

/**
 * Conversas cujo conteúdo casa com o termo.
 *
 * Devolve `undefined` quando o termo é curto demais para buscar — e NÃO um
 * conjunto vazio. A tela trata os dois de forma diferente: vazio esconde,
 * indefinido só não acrescenta.
 */
export async function buscarPorConteudo(
  tenantId: string,
  termo: string
): Promise<Set<string> | undefined> {
  const t = termo.trim();
  if (!tenantId || tenantId === 'owner' || t.length < MINIMO_PARA_BUSCAR_CONTEUDO) return undefined;

  const { data, error } = await supabase.rpc('whatsapp_busca_em_mensagens', {
    p_tenant_id: tenantId,
    p_termo: t,
  });
  if (error) return undefined;

  return new Set((data ?? []).map((l: { conversation_id: string }) => l.conversation_id).filter(Boolean));
}

/**
 * Marca a conversa como lida por MIM, agora.
 *
 * Nunca lança: falhar aqui significa que a conversa continua marcada como não
 * lida, o que é chato e não é perda de dado.
 */
export async function marcarComoLida(
  tenantId: string,
  conversationId: string,
  userId: string
): Promise<void> {
  if (!tenantId || tenantId === 'owner' || !conversationId || !userId) return;
  try {
    await supabase
      .from('whatsapp_conversa_leitura')
      .upsert(
        { tenant_id: tenantId, conversation_id: conversationId, user_id: userId, lida_em: new Date().toISOString() },
        { onConflict: 'conversation_id,user_id' }
      );
  } catch {
    /* acessório */
  }
}
