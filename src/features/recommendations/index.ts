/** Feature de recomendação e envio de imóveis para leads. */

// Motor (puro)
export { recommendImoveis, hasUsablePreferences } from './engine/recommendationEngine';
export { buildLeadPreferences } from './engine/preferences';
export { DEFAULT_CRITERIA } from './engine/criteria';
export type {
  LeadPreferences,
  RecommendationCriterion,
  ScoredImovel,
  RecommendationOptions,
} from './engine/types';

// E-mail (puro)
export { renderRecommendationEmail } from './email/recommendationEmailTemplate';
export { composeRecommendationEmail } from './email/composeEmail';

// WhatsApp (puro)
export { renderRecommendationWhatsapp } from './whatsapp/recommendationWhatsappMessage';
export { composeRecommendationWhatsapp } from './whatsapp/composeWhatsapp';

// Contrato + adaptadores
export type { RecommendationLeadInput } from './types';
export {
  bolsaoLeadToRecommendationInput,
  genericLeadToRecommendationInput,
} from './adapters';

// UI
export { EnviarRecomendacoesModal } from './components/EnviarRecomendacoesModal';

// Settings
export { RecommendationEmailSettingsCard } from './components/RecommendationEmailSettingsCard';
