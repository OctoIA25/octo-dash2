/**
 * Rótulos de período para as mensagens do wizard de importação.
 *
 * Pequenas funções PURAS de formatação (mês/intervalo) — vivem fora do componente
 * para não quebrar o Fast Refresh (o arquivo do componente só exporta o componente)
 * e para serem testáveis isoladamente.
 */
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-01-01" → "jan/2026" (só para o rótulo da mensagem; sem new Date). */
export function monthLabel(periodStart: string): string {
  const [y, m] = periodStart.split('-');
  return `${MONTH_ABBR[Number(m) - 1] ?? m}/${y}`;
}

/**
 * Resume os meses cobertos por um plano (ex.: "jan/2026 a mar/2026" ou "jan/2026").
 * Evita o susto de "tudo 0" no dashboard: o gestor sabe em QUE mês olhar, já que o
 * dashboard abre no mês atual e os valores podem ser de meses passados.
 */
export function periodRangeLabel(periodStarts: string[]): string {
  const uniq = Array.from(new Set(periodStarts)).sort();
  if (uniq.length === 0) return '';
  if (uniq.length === 1) return monthLabel(uniq[0]);
  return `${monthLabel(uniq[0])} a ${monthLabel(uniq[uniq.length - 1])}`;
}
