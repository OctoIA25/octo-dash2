/**
 * Recorrência de campanha (C4a). Puro/testável; opera em UTC. O fuso do gestor
 * é convertido no front antes de enviar o `time` (HH:MM já em UTC).
 */

const FREQUENCIES = new Set(['daily', 'weekly']);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM 00-23:00-59

/** Valida a estrutura da recorrência. */
export function validateRecurrence(recurrence) {
  if (!recurrence || typeof recurrence !== 'object') return { ok: false, error: 'invalid_recurrence' };
  if (!FREQUENCIES.has(recurrence.frequency)) return { ok: false, error: 'invalid_recurrence' };
  if (!TIME_RE.test(String(recurrence.time || ''))) return { ok: false, error: 'invalid_recurrence' };
  if (recurrence.frequency === 'weekly') {
    const d = recurrence.day_of_week;
    if (!Number.isInteger(d) || d < 0 || d > 6) return { ok: false, error: 'invalid_recurrence' };
  }
  return { ok: true };
}

/** Próxima ocorrência ESTRITAMENTE futura a partir de fromMs (ISO UTC). */
export function computeNextOccurrence(recurrence, fromMs) {
  const [hh, mm] = String(recurrence.time).split(':').map(Number);
  const from = new Date(fromMs);
  // Candidato: hoje no horário (UTC).
  const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hh, mm, 0, 0));

  if (recurrence.frequency === 'daily') {
    if (candidate.getTime() <= fromMs) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate.toISOString();
  }
  // weekly: ajusta para o day_of_week alvo.
  const target = recurrence.day_of_week;
  let delta = (target - candidate.getUTCDay() + 7) % 7; // dias até o alvo (0 = hoje)
  if (delta === 0 && candidate.getTime() <= fromMs) delta = 7; // hoje mas horário já passou → +7
  candidate.setUTCDate(candidate.getUTCDate() + delta);
  return candidate.toISOString();
}
