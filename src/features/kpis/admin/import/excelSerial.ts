/**
 * Reconhecimento de PERÍODOS em cabeçalhos de planilha (sem posições fixas).
 *
 * Datas em Excel costumam vir como "serial" (dias desde 1899-12-30). Cabeçalhos
 * de meta variam muito ("Jan/2026", "01/2026", "Q1 2026", "2026"). Estas funções
 * traduzem essas formas para { type, periodStart } — a base do mapeamento por
 * cabeçalho exigido pelo wizard. Puras e determinísticas.
 */
import type { KpiPeriodType } from '@/features/kpis/domain/periods';

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Serial Excel → 'YYYY-MM-DD'. Faixa plausível: ~1990 a ~2100.
 *
 * 25569 = nº de dias de 1899-12-30 (epoch do Excel, que já embute o bug do ano
 * 1900) até 1970-01-01 (epoch Unix). É a constante CANÔNICA — não alterar para
 * "encaixar" um valor de teste; isso deslocaria TODAS as datas.
 */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 32874 || serial > 73415) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Reconhece um cabeçalho de período; null se não parecer período.
 *
 * `defaultYear` (opcional): ano a usar quando o cabeçalho traz só o MÊS, sem ano
 * (ex.: "Janeiro", "Jan") — muito comum em planilhas onde o ano fica no título.
 * Sem `defaultYear`, meses sem ano continuam devolvendo null (comportamento puro
 * e determinístico preservado). O ano nunca é lido de `Date` aqui — é injetado.
 */
export function parsePeriodHeader(
  header: string,
  defaultYear?: number,
): { type: KpiPeriodType; periodStart: string } | null {
  const raw = String(header ?? '').trim().toLowerCase();
  if (!raw) return null;

  // Serial numérico isolado (ex.: "45978" como cabeçalho de coluna de mês).
  if (/^\d{5}$/.test(raw)) {
    const iso = excelSerialToDate(Number(raw));
    if (iso) return { type: 'month', periodStart: `${iso.slice(0, 7)}-01` };
  }

  // Trimestre: exige marcador EXPLÍCITO 'q' (prefixo) ou 't' (sufixo) —
  // "Q1 2026", "q1/2026", "1T2026". Sem o marcador, um dígito solto + ano
  // ("3 2026") NÃO é trimestre (evita falso-positivo em cabeçalhos numéricos).
  const q = raw.match(/^q\s*([1-4])\s*[/ -]?\s*(\d{4})$|^([1-4])\s*t\s*(\d{4})$/);
  if (q) {
    const quarter = Number(q[1] ?? q[3]);
    const year = Number(q[2] ?? q[4]);
    return { type: 'quarter', periodStart: `${year}-${pad((quarter - 1) * 3 + 1)}-01` };
  }

  // Mês por nome: "jan 2026", "Janeiro/2026".
  const named = raw.match(/^([a-zç]+)[\s/._-]+(\d{4})$/);
  if (named && MONTHS[named[1]]) {
    return { type: 'month', periodStart: `${named[2]}-${pad(MONTHS[named[1]])}-01` };
  }

  // Mês numérico: "03/2026" | "2026-03" | "2026/03".
  const mmYyyy = raw.match(/^(\d{1,2})[\s/._-](\d{4})$/);
  if (mmYyyy && Number(mmYyyy[1]) >= 1 && Number(mmYyyy[1]) <= 12) {
    return { type: 'month', periodStart: `${mmYyyy[2]}-${pad(Number(mmYyyy[1]))}-01` };
  }
  const yyyyMm = raw.match(/^(\d{4})[\s/._-](\d{1,2})$/);
  if (yyyyMm && Number(yyyyMm[2]) >= 1 && Number(yyyyMm[2]) <= 12) {
    return { type: 'month', periodStart: `${yyyyMm[1]}-${pad(Number(yyyyMm[2]))}-01` };
  }

  // Ano isolado.
  if (/^\d{4}$/.test(raw)) return { type: 'year', periodStart: `${raw}-01-01` };

  // Mês SEM ano ("Janeiro", "jan", "março") — comum quando o ano vive no título.
  // Só resolve se `defaultYear` foi informado (senão mantém null, determinístico).
  if (defaultYear !== undefined && /^[a-zç]+$/.test(raw) && MONTHS[raw]) {
    return { type: 'month', periodStart: `${defaultYear}-${pad(MONTHS[raw])}-01` };
  }

  return null;
}
