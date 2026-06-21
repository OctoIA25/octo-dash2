/**
 * Helpers de período do endpoint de KPIs (lado servidor).
 *
 * Trabalha só com a parte de DATA (YYYY-MM-DD). A conversão para limites do dia
 * em UTC fica num único lugar (dayStartUtc/dayEndUtc), evitando o bug recorrente
 * de bordas de mês em fuso local convertidas para UTC.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const lastDay = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Valida 'YYYY-MM-DD'. Retorna null se inválida. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { year: y, month1: mo, day: d };
}

/** Período = mês de referência (Date ou {year, month0}). Padrão: mês atual UTC. */
export function monthPeriod(ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  return {
    startDate: isoDate(y, m, 1),
    endDate: isoDate(y, m, lastDay(y, m)),
    label: `${MESES[m]}/${y}`,
  };
}

/** Constrói um período de mês a partir de uma data ISO 'YYYY-MM-DD' (usa o mês dela). */
export function monthPeriodFromIso(isoStr) {
  const parsed = parseIsoDate(isoStr);
  if (!parsed) return null;
  return monthPeriod(new Date(Date.UTC(parsed.year, parsed.month1 - 1, 1)));
}

/** Mês imediatamente anterior ao período informado. */
export function previousMonthPeriod(period) {
  const [y, m] = period.startDate.split('-').map(Number);
  return monthPeriod(new Date(Date.UTC(y, m - 2, 1))); // m é 1..12; m-2 = mês anterior em base 0
}

export const dayStartUtc = (isoStr) => `${isoStr}T00:00:00.000Z`;
export const dayEndUtc = (isoStr) => `${isoStr}T23:59:59.999Z`;
