/**
 * 🔌 Adaptadores: normalizam os diferentes formatos de lead do sistema para o
 * contrato único {@link RecommendationLeadInput}. Adicionar suporte a uma nova
 * fonte de lead = adicionar um adaptador aqui, sem tocar na UI/feature.
 */

import type { BolsaoLead } from '@/features/leads/services/bolsaoService';
import type { RecommendationLeadInput } from './types';

/** Adapta um lead do Bolsão. O Bolsão não carrega e-mail, então fica nulo. */
export const bolsaoLeadToRecommendationInput = (
  lead: BolsaoLead,
): RecommendationLeadInput => ({
  id: lead.id,
  source: 'bolsao',
  name: lead.nomedolead || 'Lead',
  email: null, // bolsão não tem e-mail — o usuário informa no modal
  phone: lead.lead,
  lastInteraction: lead.data_atendimento || lead.data_atribuicao || lead.created_at || null,
  seedReferencias: lead.codigo ? [lead.codigo] : [],
});

/** Formato genérico (Central de Leads / CRM) com campos de interesse já presentes. */
export interface GenericLeadLike {
  id: string | number | null;
  nome?: string | null;
  name?: string | null;
  email?: string | null;
  telefone?: string | null;
  phone?: string | null;
  ultimaInteracao?: string | null;
  codigoImovel?: string | null;
  property_code?: string | null;
  property_value?: number | null;
  property_type?: string | null;
}

export const genericLeadToRecommendationInput = (
  lead: GenericLeadLike,
  source: RecommendationLeadInput['source'] = 'crm',
): RecommendationLeadInput => {
  const seed = lead.codigoImovel || lead.property_code || null;
  return {
    id: lead.id,
    source,
    name: lead.nome || lead.name || 'Lead',
    email: lead.email ?? null,
    phone: lead.telefone || lead.phone || null,
    lastInteraction: lead.ultimaInteracao ?? null,
    seedReferencias: seed ? [seed] : [],
    signals: {
      precoReferencia: lead.property_value ?? null,
    },
  };
};
