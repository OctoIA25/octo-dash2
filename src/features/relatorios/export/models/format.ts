/** Formatadores compartilhados pelos builders de modelo de relatório. */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(Number(value) || 0);
}

export function formatNumber(value: number | null | undefined): string {
  return numberFormatter.format(Number(value) || 0);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatRoi(roi: number | null | undefined): string {
  if (roi === null || roi === undefined || Number.isNaN(roi)) return '—';
  return `${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(0)}%`;
}
