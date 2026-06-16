/**
 * Formatação de valores de meta por unidade.
 * Centralizado para que a exibição seja consistente em toda a feature.
 */

import type { GoalUnit } from './types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const countFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

export function formatGoalValue(value: number, unit: GoalUnit): string {
  const safe = Number.isFinite(value) ? value : 0;
  switch (unit) {
    case 'currency':
      return currencyFormatter.format(safe);
    case 'percent':
      return `${countFormatter.format(safe)}%`;
    case 'count':
    default:
      return countFormatter.format(safe);
  }
}

/** Percentual já clampeado para exibição (0–100), arredondado. */
export function formatPercent(percent: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return `${clamped}%`;
}

export const GOAL_UNIT_LABELS: Record<GoalUnit, string> = {
  currency: 'Moeda (R$)',
  count: 'Quantidade',
  percent: 'Percentual (%)',
};
