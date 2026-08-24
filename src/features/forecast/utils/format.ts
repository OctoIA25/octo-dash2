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

/** ISO → dd/mm/aaaa. Data ausente vira travessão, não string vazia. */
export const dataBR = (iso: string | null): string => {
  if (!iso) return '—';

  // 'YYYY-MM-DD' seria lido como meia-noite UTC e voltaria um dia em BRT.
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;

  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR');
};
