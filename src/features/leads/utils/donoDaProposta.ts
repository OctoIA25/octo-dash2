/**
 * De quem é a proposta (`proposals.agent_user_id`) — e, por ela, a venda no
 * ranking, no Relatório Individual e na comissão.
 *
 * O dono é o corretor: o do lead, ou o que já está gravado. NUNCA quem está
 * salvando. Até 01/10 cada salvamento passava a proposta para quem clicou —
 * a Yasmin (admin) ficou dona de 64 propostas da Lotus, 4 delas assinadas, e
 * o ranking contava as vendas do André, da Gabriele e da Mariana para ela.
 *
 * Proposta manual com nome digitado e sem lead fica sem dono (null): quem lê
 * casa pelo nome (`buscarRankingCorretoresComercial`). Só sem nome nenhum o
 * dono é quem criou — não há outro candidato.
 */
export function donoDaProposta(
  donoAtual: string | null | undefined,
  nomeDoCorretor: string | null | undefined,
  quemSalva: string | null | undefined,
): string | null {
  if (donoAtual) return donoAtual;
  return nomeDoCorretor?.trim() ? null : quemSalva || null;
}
