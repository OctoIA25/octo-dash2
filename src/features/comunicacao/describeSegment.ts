/** Tipos de segmento suportados (espelha SEGMENT_TYPES do backend). */
export type SegmentDsl =
  | { type: 'archived' }
  | { type: 'archived_period'; days: number }
  | { type: 'no_contact'; days: number }
  | { type: 'by_broker'; broker: string }
  | { type: 'interest'; interest: string }
  | { type: 'explicit_list'; names: string[] };

/** Tradução legível (pt-BR) de um segmento, para a lista de Públicos. */
export function describeSegment(segment: SegmentDsl): string {
  switch (segment.type) {
    case 'archived': return 'Clientes arquivados';
    case 'archived_period': return `Arquivados há mais de ${segment.days} dias`;
    case 'no_contact': return `Sem contato há ${segment.days} dias`;
    case 'by_broker': return `Do corretor ${segment.broker}`;
    case 'interest': return `Interessados em ${segment.interest}`;
    case 'explicit_list': return `Lista de ${segment.names.length} cliente(s): ${segment.names.slice(0, 3).join(', ')}${segment.names.length > 3 ? '…' : ''}`;
    default: return 'Segmento';
  }
}
