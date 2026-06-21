/**
 * Cálculo de períodos para metas/realizado de KPIs.
 *
 * Puro e sem dependências: opera sobre strings ISO 'YYYY-MM-DD' e nunca
 * cria datas a partir do "agora" (determinístico/testável). O 1º dia do
 * período é a CHAVE de identidade usada nas tabelas kpi_targets/kpi_values.
 */
export type KpiPeriodType = 'month' | 'quarter' | 'year';

/** Devolve o 1º dia (YYYY-MM-DD) do período do tipo dado que contém `isoDate`. */
export function normalizePeriodStart(isoDate: string, type: KpiPeriodType): string {
  const [y, m] = isoDate.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (type === 'year') return `${y}-01-01`;
  if (type === 'quarter') {
    const firstMonth = Math.floor((m - 1) / 3) * 3 + 1; // 1,4,7,10
    return `${y}-${pad(firstMonth)}-01`;
  }
  return `${y}-${pad(m)}-01`;
}

/** Chave estável de um período (para indexar metas/realizado em memória). */
export function periodKey(type: KpiPeriodType, periodStart: string): string {
  return `${type}:${periodStart}`;
}
