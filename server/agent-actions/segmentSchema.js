/**
 * Schema/validação compartilhada de SEGMENTO do Disparador.
 *
 * Fonte única da allow-list de tipos e da normalização por tipo — usada tanto
 * pelo interpreter (valida o que vem do n8n) quanto pelo CRUD de Públicos
 * (valida o que o usuário salva). Puro/testável.
 */

export const SEGMENT_TYPES = [
  'explicit_list',   // nomes específicos
  'archived',        // todos os arquivados
  'archived_period', // arquivados há mais de N dias
  'by_broker',       // de um corretor específico
  'no_contact',      // sem atendimento há N dias
  'interest',        // interessados em um tipo de imóvel
];

/**
 * Valida e normaliza um segmento, mantendo só os campos relevantes ao tipo.
 * Segmentos com params ausentes ou inválidos (days NaN/negativo, broker/interest
 * vazios, lista de nomes vazia) são rejeitados com error: 'invalid_segment'.
 * @returns {{ ok: true, segment } | { ok: false, error: 'invalid_segment' }}
 */
export function validateSegment(segment) {
  if (!segment || typeof segment !== 'object' || !segment.type || !SEGMENT_TYPES.includes(segment.type)) {
    return { ok: false, error: 'invalid_segment' };
  }
  const clean = { type: segment.type };
  if (segment.type === 'explicit_list') {
    clean.names = Array.isArray(segment.names)
      ? segment.names.filter((n) => n != null && n !== '').map(String)
      : [];
    if (clean.names.length === 0) return { ok: false, error: 'invalid_segment' };
  } else if (segment.type === 'archived_period' || segment.type === 'no_contact') {
    clean.days = Number(segment.days);
    if (!Number.isFinite(clean.days) || clean.days < 0) return { ok: false, error: 'invalid_segment' };
  } else if (segment.type === 'by_broker') {
    clean.broker = String(segment.broker || '').trim();
    if (!clean.broker) return { ok: false, error: 'invalid_segment' };
  } else if (segment.type === 'interest') {
    clean.interest = String(segment.interest || '').trim();
    if (!clean.interest) return { ok: false, error: 'invalid_segment' };
  }
  return { ok: true, segment: clean };
}
