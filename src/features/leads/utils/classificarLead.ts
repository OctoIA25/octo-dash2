/**
 * Filtro do Bolsão por atuação do corretor.
 *
 * A CLASSIFICAÇÃO NÃO É MAIS DERIVADA AQUI. Ela é gravada na entrada do lead
 * pelo trigger `classificar_lead` (migration 20260815) e chega pronta em
 * `bolsao.classification`. Este arquivo só traduz atuação → classificações
 * visíveis. Se aparecer uma regra de negócio aqui de novo, ela está no lugar
 * errado — existe fonte única no banco.
 *
 * Direção fail-open preservada: `null` (lead ainda não classificado) e
 * `indefinido` aparecem para todo mundo. O pior caso desta feature é esconder
 * lead de quem deveria vê-lo.
 *
 * Ver docs/superpowers/specs/2026-08-15-classificacao-lead-badges-design.md
 */

import { ATUACAO_TIPOS, atuacoesDe, type AtuacaoTipo } from '@/types/permissions';

export type TipoLead = 'lancamento' | 'pronto' | 'locacao' | 'indefinido';

export { ATUACAO_TIPOS, atuacoesDe, type AtuacaoTipo };

/** O que cada marcação de atuação habilita o corretor a ver. */
const VISIVEL_POR_ATUACAO: Record<AtuacaoTipo, TipoLead> = {
  lancamentos: 'lancamento',
  prontos: 'pronto',
  alugados: 'locacao',
};

export interface LinhaClassificavel {
  classification?: string | null;
}

/**
 * Monta as opções de `filtrarPorAtuacao` a partir de quem está logado.
 *
 * Existe separado do componente para que a decisão "quem é filtrado" tenha
 * teste: só `role = 'corretor'` é filtrado, e só quando a atuação dele
 * restringe alguma coisa. Admin, owner e team_leader veem o Bolsão inteiro —
 * quem gerencia precisa enxergar o que está parado.
 */
export function opcoesFiltroBolsao({
  isCorretor,
  permissions,
}: {
  isCorretor: boolean;
  permissions?: Record<string, unknown> | null;
}): { ativo: boolean; atuacoes: AtuacaoTipo[] } {
  const atuacoes = atuacoesDe(permissions);
  const atendeTudo = ATUACAO_TIPOS.every((t) => atuacoes.includes(t));
  return { ativo: isCorretor && !atendeTudo, atuacoes };
}

export function filtrarPorAtuacao<T extends LinhaClassificavel>(
  linhas: ReadonlyArray<T>,
  opts: {
    /** false para admin/owner/team_leader: veem o Bolsão inteiro. */
    ativo: boolean;
    atuacoes: ReadonlyArray<AtuacaoTipo>;
  },
): T[] {
  if (!opts.ativo) return [...linhas];
  if (ATUACAO_TIPOS.every((t) => opts.atuacoes.includes(t))) return [...linhas];

  const visiveis = new Set<string>(['indefinido']);
  for (const atuacao of opts.atuacoes) visiveis.add(VISIVEL_POR_ATUACAO[atuacao]);

  return linhas.filter((linha) => {
    // Não classificado, ou valor que este build não conhece: mostra. Fail-open.
    if (!linha.classification) return true;
    if (!ATUACAO_TIPOS.some((t) => VISIVEL_POR_ATUACAO[t] === linha.classification)) return true;
    return visiveis.has(linha.classification);
  });
}
