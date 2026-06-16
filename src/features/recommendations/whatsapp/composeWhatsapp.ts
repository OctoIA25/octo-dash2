/**
 * 🧩 Composição da recomendação por WhatsApp a partir do domínio.
 * Espelha composeRecommendationEmail, reusando o snapshot compartilhado.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { Finalidade } from '../engine/types';
import type { SendRecommendationProperty } from '../services/recommendationsApi';
import { buildPropertiesSnapshot } from '../propertiesSnapshot';
import { renderRecommendationWhatsapp } from './recommendationWhatsappMessage';

export interface ComposeWhatsappParams {
  leadNome: string;
  mensagem: string;
  imoveis: Imovel[];
  finalidade?: Finalidade;
  empresaNome?: string;
}

export interface ComposedWhatsapp {
  body: string;
  propertiesSnapshot: SendRecommendationProperty[];
}

export const composeRecommendationWhatsapp = (
  params: ComposeWhatsappParams,
): ComposedWhatsapp => ({
  body: renderRecommendationWhatsapp({
    leadNome: params.leadNome,
    mensagem: params.mensagem,
    imoveis: params.imoveis,
    finalidade: params.finalidade,
    empresaNome: params.empresaNome,
  }),
  propertiesSnapshot: buildPropertiesSnapshot(params.imoveis, params.finalidade),
});
