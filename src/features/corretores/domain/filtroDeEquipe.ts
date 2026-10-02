/**
 * O filtro "Equipe" de Gestão de Equipe.
 *
 * Pedido de 02/10: sai "Locação" (não casava com ninguém — a equipe do card só
 * vale "Gestão" para admin e "Vendas" para o resto), entram "Lançamentos" e
 * "Prontos". Esses dois leem a Atuação da pessoa (`permissions.atuacao`), a
 * mesma que decide quais leads ela vê no Bolsão. Quem não tem atuação marcada
 * atende tudo (`atuacoesDe` é fail-open) e aparece nos dois.
 */
import type { AtuacaoTipo } from '@/types/permissions';

export function estaNaEquipe(
  membro: { equipe: string; atuacoes: readonly AtuacaoTipo[] },
  filtro: string,
): boolean {
  if (filtro === 'todas') return true;
  if (filtro === 'lancamentos' || filtro === 'prontos') return membro.atuacoes.includes(filtro);
  return membro.equipe === filtro;
}
