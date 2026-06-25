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
 * @returns {{ ok: true, segment } | { ok: false, error: 'invalid_segment' }}
 */
export function validateSegment(segment) {
  if (!segment || typeof segment !== 'object' || !segment.type || !SEGMENT_TYPES.includes(segment.type)) {
    return { ok: false, error: 'invalid_segment' };
  }
  const clean = { type: segment.type };
  if (segment.type === 'explicit_list') {
    clean.names = Array.isArray(segment.names) ? segment.names.map(String).filter(Boolean) : [];
  } else if (segment.type === 'archived_period' || segment.type === 'no_contact') {
    clean.days = Number(segment.days);
  } else if (segment.type === 'by_broker') {
    clean.broker = String(segment.broker || '');
  } else if (segment.type === 'interest') {
    clean.interest = String(segment.interest || '');
  }
  return { ok: true, segment: clean };
}
