/** Recorrência (front). Converte HH:MM entre local (BR UTC-3) e UTC; descreve legível. */
export interface Recurrence {
  frequency: 'daily' | 'weekly';
  day_of_week?: number; // 0=domingo..6=sábado
  time: string; // HH:MM
}

const BR_OFFSET = 3; // BR = UTC-3 (sem DST desde 2019)
const DAYS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function shiftHour(hhmm: string, deltaHours: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h + deltaHours) % 24 + 24) % 24;
  return `${String(total).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Local (BR) → UTC: soma 3h. */
export function localTimeToUtc(hhmmLocal: string): string { return shiftHour(hhmmLocal, BR_OFFSET); }
/** UTC → local (BR): subtrai 3h. */
export function utcTimeToLocal(hhmmUtc: string): string { return shiftHour(hhmmUtc, -BR_OFFSET); }

/** Converte dia+hora LOCAL (BR UTC-3) para dia+hora UTC, ajustando o dia se cruzar a meia-noite. */
export function localDayTimeToUtc(dayOfWeek: number, hhmmLocal: string): { day_of_week: number; time: string } {
  const [h, m] = hhmmLocal.split(':').map(Number);
  const totalUtc = h + BR_OFFSET; // BR_OFFSET=3
  const dayShift = Math.floor(totalUtc / 24); // 0 ou 1 (se passou de 24h, vira o dia)
  const hUtc = ((totalUtc % 24) + 24) % 24;
  const dayUtc = ((dayOfWeek + dayShift) % 7 + 7) % 7;
  return { day_of_week: dayUtc, time: `${String(hUtc).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

/** UTC → local (dia+hora), ajustando o dia se cruzar a meia-noite ao subtrair o offset. */
export function utcDayTimeToLocal(dayOfWeek: number, hhmmUtc: string): { day_of_week: number; time: string } {
  const [h, m] = hhmmUtc.split(':').map(Number);
  const totalLocal = h - BR_OFFSET;
  const dayShift = Math.floor(totalLocal / 24); // -1 se ficou negativo
  const hLocal = ((totalLocal % 24) + 24) % 24;
  const dayLocal = ((dayOfWeek + dayShift) % 7 + 7) % 7;
  return { day_of_week: dayLocal, time: `${String(hLocal).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

/** Texto legível (horário em LOCAL). */
export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return '';
  const local = utcTimeToLocal(r.time);
  if (r.frequency === 'daily') return `Diariamente às ${local}`;
  const dia = DAYS_PT[r.day_of_week ?? 0];
  return `Toda ${dia} às ${local}`;
}
