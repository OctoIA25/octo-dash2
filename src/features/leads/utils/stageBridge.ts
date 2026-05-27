import type { SavedProposalStageId } from '@/features/leads/services/proposalsService';

/**
 * Ponte de etapas entre os kanbans `/propostas` e o kanban de leads.
 *
 * Os dois kanbans têm conjuntos de etapas diferentes:
 *
 * - **Propostas** (7 stages): negociacao · proposta-criada · proposta-enviada ·
 *   propostas-respondidas · feitura-contrato · proposta-assinada · arquivado
 *
 * - **Leads Interessado** (8 colunas): novos-leads · interacao · visita-agendada ·
 *   visita-realizada · negociacao · proposta-criada · proposta-enviada · proposta-assinada
 *
 * - **Leads Proprietário** (11 colunas): novos-proprietarios · em-atendimento ·
 *   primeira-visita · criacao-estudo-mercado · apresentacao-estudo-mercado ·
 *   nao-exclusivo · exclusivo · cadastro · plano-marketing · propostas-respondidas ·
 *   feitura-contrato
 *
 * Quando um stage de propostas não existe no funil do lead (e.g. mover Interessado
 * para "Propostas Respondidas", que só existe no funil Proprietário), mapeamos para
 * a etapa conceitualmente mais próxima no funil do lead — caso contrário o lead
 * fica órfão sem coluna correspondente.
 */

export const LEAD_TYPE_INTERESSADO = 1;
export const LEAD_TYPE_PROPRIETARIO = 2;

/**
 * Converte um stage de proposta para o `leads.status` apropriado, considerando
 * o tipo do lead. Quando o stage não existe no funil daquele tipo, usa a etapa
 * mais próxima conceitualmente.
 */
export function propostaStageToLeadStatus(
  stageId: SavedProposalStageId | string,
  leadType: number | null | undefined,
): string {
  if (leadType === LEAD_TYPE_PROPRIETARIO) {
    switch (stageId) {
      case 'negociacao':
      case 'proposta-criada':
      case 'proposta-enviada':
        return 'Propostas Respondidas';
      case 'propostas-respondidas':
        return 'Propostas Respondidas';
      case 'feitura-contrato':
        return 'Feitura de Contrato';
      case 'proposta-assinada':
        return 'Feitura de Contrato';
      case 'arquivado':
        return 'Arquivado';
      default:
        return 'Propostas Respondidas';
    }
  }

  // Interessado (lead_type=1 ou null/undefined)
  switch (stageId) {
    case 'negociacao': return 'Negociação';
    case 'proposta-criada': return 'Proposta Criada';
    case 'proposta-enviada': return 'Proposta Enviada';
    case 'propostas-respondidas': return 'Proposta Enviada';
    case 'feitura-contrato': return 'Proposta Assinada';
    case 'proposta-assinada': return 'Proposta Assinada';
    case 'arquivado': return 'Arquivado';
    default: return 'Proposta Criada';
  }
}

/**
 * Converte um status de lead (string em pt-BR salva em `leads.status`) para
 * o stage de proposta equivalente. Retorna `null` quando o status do lead
 * está antes do funil de propostas começar (e.g. "Novos Leads", "Interação")
 * — nesse caso, não faz sentido refletir em `proposals.stage_id`.
 */
export function leadStatusToPropostaStage(
  status: string | null | undefined,
): SavedProposalStageId | null {
  if (!status) return null;
  const normalized = String(status)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

  if (normalized.includes('arquivad')) return 'arquivado';
  if (normalized.includes('assinad') || normalized.includes('fechament') || normalized.includes('vendid')) return 'proposta-assinada';
  if (normalized.includes('feitura') || normalized.includes('contrato')) return 'feitura-contrato';
  if (normalized.includes('respondid')) return 'propostas-respondidas';
  if (normalized.includes('enviad')) return 'proposta-enviada';
  if (normalized.includes('proposta') && normalized.includes('criad')) return 'proposta-criada';
  if (normalized.includes('negoci')) return 'negociacao';
  return null;
}
