/**
 * Agrupa os cards de KPI por categoria, preservando a ordem (displayOrder)
 * dentro de cada grupo. Categoria ausente cai em 'geral'.
 *
 * `knownCategories` (opcional): conjunto das categorias que a página sabe
 * renderizar. Se informado, qualquer categoria FORA dele também cai em 'geral'
 * — garante que um card com categoria customizada (a tela "Gerenciar KPIs"
 * aceita texto livre no campo categoria) nunca suma silenciosamente da Home.
 *
 * Puro — fácil de testar e reutilizar.
 */
import type { KpiSummaryCard } from './types';

export function groupCardsByCategory(
  cards: KpiSummaryCard[],
  knownCategories?: Iterable<string>,
): Record<string, KpiSummaryCard[]> {
  const known = knownCategories ? new Set(knownCategories) : null;
  const grouped: Record<string, KpiSummaryCard[]> = {};
  for (const card of cards) {
    const raw = card.category?.trim();
    const key = raw && (!known || known.has(raw)) ? raw : 'geral';
    (grouped[key] ??= []).push(card);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => a.displayOrder - b.displayOrder);
  }
  return grouped;
}
