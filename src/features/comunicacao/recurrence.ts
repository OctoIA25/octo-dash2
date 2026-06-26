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

/** Texto legível (horário em LOCAL). */
export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return '';
  const local = utcTimeToLocal(r.time);
  if (r.frequency === 'daily') return `Diariamente às ${local}`;
  const dia = DAYS_PT[r.day_of_week ?? 0];
  return `Toda ${dia} às ${local}`;
}
