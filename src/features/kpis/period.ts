/**
 * Helpers de período para a aba de KPIs.
 *
 * Toda a aba opera sobre um único `KpiPeriod` (início/fim em datas ISO
 * 'YYYY-MM-DD'). Centralizar a construção aqui evita o bug recorrente de
 * limites de mês em fuso local convertidos para UTC (ver auditoria): aqui
 * trabalhamos só com a parte de DATA, sem horário, e a conversão para os
 * limites do dia em UTC acontece num único lugar (no serviço).
 */

import type { KpiPeriod } from './types';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(year: number, monthIndex0: number, day: number): string {
  return `${year}-${pad(monthIndex0 + 1)}-${pad(day)}`;
}

/** Último dia do mês (monthIndex0 = 0..11). */
function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Período = mês de referência (padrão: mês atual). */
export function monthPeriod(reference = new Date()): KpiPeriod {
  const year = reference.getFullYear();
  const m = reference.getMonth();
  return {
    startDate: isoDate(year, m, 1),
    endDate: isoDate(year, m, lastDayOfMonth(year, m)),
    label: `${MESES[m]}/${year}`,
  };
}

/** Mês imediatamente anterior ao período informado — base de comparação. */
export function previousMonthPeriod(period: KpiPeriod): KpiPeriod {
  const [y, m] = period.startDate.split('-').map(Number);
  // m é 1..12; voltar um mês:
  const ref = new Date(y, m - 1, 1);
  ref.setMonth(ref.getMonth() - 1);
  return monthPeriod(ref);
}

/** Limite inferior do período como timestamp ISO UTC (00:00:00.000Z). */
export function dayStartUtc(isoDateStr: string): string {
  return `${isoDateStr}T00:00:00.000Z`;
}

/** Limite superior do período como timestamp ISO UTC (23:59:59.999Z). */
export function dayEndUtc(isoDateStr: string): string {
  return `${isoDateStr}T23:59:59.999Z`;
}
