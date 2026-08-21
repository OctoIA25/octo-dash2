/**
 * Formatação de dinheiro do forecast.
 *
 * Centavos ficam de fora: nenhum valor aqui é preço de nota fiscal — são
 * valores de imóvel e comissão estimada, onde os centavos só roubam largura do
 * card. O cálculo em `comissao.ts` continua arredondando a centavos; isto é só
 * exibição.
 */

/** R$ 800.000 — para o corpo do card, onde cabe o número inteiro. */
export const moeda = (valor: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(valor || 0);

/**
 * R$ 2,4 mi — para o cabeçalho da coluna, que é estreito. Abaixo de 1 milhão
 * volta ao formato cheio: "R$ 800 mil" é mais difícil de ler que "R$ 800.000".
 */
export const moedaCompacta = (valor: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: (valor || 0) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: (valor || 0) >= 1_000_000 ? 2 : 0,
  }).format(valor || 0);

/** ISO → dd/mm. Data ausente vira travessão, não string vazia. */
export const dataCurta = (iso: string | null): string => {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
