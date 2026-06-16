/**
 * Contrato de entrada da feature de recomendações, normalizado a partir de
 * qualquer fonte de lead (bolsão, central Kenlo, CRM). Desacopla a UI/feature
 * dos múltiplos formatos de lead existentes no sistema.
 */

import type { LeadInterestSignals } from './engine/preferences';

export interface RecommendationLeadInput {
  id: string | number | null;
  source: 'bolsao' | 'kenlo' | 'crm' | 'manual';
  name: string;
  email: string | null;
  phone?: string | null;
  /** Última interação (ISO string), exibida no modal. */
  lastInteraction?: string | null;
  /** Códigos de imóveis com os quais o lead demonstrou interesse (sementes). */
  seedReferencias: string[];
  /** Sinais estruturados soltos do lead (fallback quando não há sementes). */
  signals?: LeadInterestSignals;
}
