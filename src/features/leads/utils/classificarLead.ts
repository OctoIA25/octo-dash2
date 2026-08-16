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

/**
 * Seções do Bolsão, na ordem de exibição. São as mesmas quatro classificações —
 * o Bolsão não tem vocabulário próprio, só rótulos comerciais.
 * `indefinido` por último: é a sobra (inclui `classification = null`).
 */
export const SECOES_BOLSAO: ReadonlyArray<{ tipo: TipoLead; titulo: string }> = [
  { tipo: 'lancamento', titulo: 'Venda de Lançamentos' },
  { tipo: 'pronto', titulo: 'Venda de Prontos' },
  { tipo: 'locacao', titulo: 'Locação' },
  { tipo: 'indefinido', titulo: 'Sem classificação' },
];

/**
 * Agrupa as linhas nas seções acima. Quem já passou por `filtrarPorAtuacao` só
 * tem grupo cheio no que a atuação dele permite ver — a UI renderiza apenas os
 * grupos não vazios, então o corretor de prontos nunca vê a seção de lançamentos.
 * Classificação nula ou desconhecida cai em `indefinido` (mesma direção fail-open).
 */
export function agruparPorSecao<T extends LinhaClassificavel>(
  linhas: ReadonlyArray<T>,
): Record<TipoLead, T[]> {
  const grupos: Record<TipoLead, T[]> = { lancamento: [], pronto: [], locacao: [], indefinido: [] };
  for (const linha of linhas) {
    const tipo = linha.classification as TipoLead;
    (grupos[tipo] ?? grupos.indefinido).push(linha);
  }
  return grupos;
}

export interface LinhaComImovel {
  /** Referência do imóvel — na prática, o nome do condomínio em vários portais. */
  codigo?: string | null;
}

/**
 * Quem enxerga qual imóvel o lead procurou. Com o condomínio à mostra, o Bolsão
 * vira garimpo (corretor só pega lead de empreendimento de luxo) em vez de fila
 * por ordem de chegada. Owner, admin e team_leader continuam vendo — são eles
 * que precisam auditar o que está parado.
 */
export const podeVerImovelBolsao = (
  { isAdmin, systemRole }: { isAdmin: boolean; systemRole?: string | null },
): boolean => isAdmin || systemRole === 'team_leader';

/**
 * Apaga a referência do imóvel das linhas quando o usuário não pode vê-la.
 * Feito na LISTA, não em cada componente: card, modal de detalhes e formulário
 * de atividade leem todos o mesmo `codigo`, então esconder na origem cobre os
 * três de uma vez — e qualquer tela nova que apareça depois.
 */
export function ocultarImovelDoBolsao<T extends LinhaComImovel>(
  linhas: ReadonlyArray<T>,
  podeVer: boolean,
): T[] {
  return podeVer ? [...linhas] : linhas.map((linha) => ({ ...linha, codigo: null }));
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
