/**
 * Dicas de melhoria do cadastro — derivadas do completômetro, não de regras
 * próprias. A entrada é o `PropertyCompletenessResult` já calculado, então não
 * existe segunda fonte de verdade nem segundo cálculo (nem request).
 *
 * Regra de seleção: **uma dica por categoria** — o próximo passo dela. As 4
 * faixas de fotos, por exemplo, são o mesmo problema e viram uma única dica,
 * com os pontos de toda a categoria em jogo.
 */

import type {
  CompletenessPriority,
  CompletenessSection,
  PropertyCompletenessResult,
} from './propertyCompleteness';

/** Quantas dicas mostrar antes do "ver todas". */
export const TIPS_VISIVEIS = 3;

export interface PropertyTip {
  /** Id do critério do completômetro que originou a dica. */
  id: string;
  categoryKey: string;
  categoryLabel: string;
  /** O que fazer. */
  title: string;
  /** Por que isso importa. */
  description: string;
  priority: CompletenessPriority;
  /** Seção do formulário aberta pelo "Adicionar agora". */
  section: CompletenessSection;
  /** Pontos de completude ainda disponíveis nesta categoria. */
  points: number;
}

const ORDEM: Record<CompletenessPriority, number> = { alta: 0, media: 1, baixa: 2 };

const tipDaCategoria = (
  categoria: PropertyCompletenessResult['categories'][number],
): PropertyTip | null => {
  const proximoPasso = categoria.missing[0];
  if (!proximoPasso) return null;

  return {
    id: proximoPasso.id,
    categoryKey: categoria.key,
    categoryLabel: categoria.label,
    title: proximoPasso.label,
    description: proximoPasso.why,
    priority: proximoPasso.priority,
    section: proximoPasso.section,
    points: categoria.missing.reduce((soma, item) => soma + item.points, 0),
  };
};

/**
 * Empate de pontos: somar frações de peso deixa resíduo de ponto flutuante
 * (15 vira 14,999…). Abaixo desta diferença as dicas são equivalentes e o
 * `sort` estável mantém a ordem de declaração das categorias.
 */
const compararPontos = (a: PropertyTip, b: PropertyTip): number => {
  const diferenca = b.points - a.points;
  return Math.abs(diferenca) < 0.01 ? 0 : diferenca;
};

/**
 * Dicas ordenadas por prioridade e, dentro dela, pelo que mais soma na
 * completude. Sem limite aqui — quem apresenta decide quantas mostrar.
 */
export const buildPropertyTips = (result: PropertyCompletenessResult): PropertyTip[] =>
  result.categories
    .map(tipDaCategoria)
    .filter((tip): tip is PropertyTip => tip !== null)
    .sort((a, b) => ORDEM[a.priority] - ORDEM[b.priority] || compararPontos(a, b));
