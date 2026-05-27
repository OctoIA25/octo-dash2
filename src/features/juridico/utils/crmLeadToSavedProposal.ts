import type { CRMLead } from '@/features/leads/services/leadsService';
import type { SavedProposal, SavedProposalStageId } from '@/features/leads/services/proposalsService';

const normalize = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const getStageFromStatus = (
  status: string | null | undefined,
  finalSaleValue?: number | null,
): SavedProposalStageId | null => {
  if ((finalSaleValue || 0) > 0) return 'proposta-assinada';

  const value = normalize(status);
  if (!value) return null;
  if (value.includes('arquivad')) return 'arquivado';
  if (value.includes('assinad') || value.includes('fechamento') || value.includes('vendid')) return 'proposta-assinada';
  if (value.includes('feitura') || value.includes('contrato')) return 'feitura-contrato';
  if (value.includes('respondid')) return 'propostas-respondidas';
  if (value === 'proposta') return 'propostas-respondidas';
  if (value.includes('enviad')) return 'proposta-enviada';
  if (value.includes('criad')) return 'proposta-criada';
  if (value.includes('negoci')) return 'negociacao';
  return null;
};

/**
 * Converte um CRMLead em uma SavedProposal stub para alimentar a Visão Geral
 * com leads que ainda não viraram propostas salvas no banco.
 * Retorna null para leads em estágios que não fazem parte do funil de negócios.
 */
export function crmLeadToSavedProposal(lead: CRMLead): SavedProposal | null {
  const stageId = getStageFromStatus(lead.status, lead.final_sale_value);
  if (!stageId) return null;

  const value = lead.final_sale_value || lead.property_value || 0;
  const updatedAt = lead.updated_at || lead.created_at;

  return {
    id: lead.id,
    tenant_id: lead.tenant_id,
    lead_id: lead.id,
    source: 'crm',
    property_origin: 'interno',
    property_reference: lead.property_code || '',
    cep: '',
    numero: '',
    logradouro: '',
    bairro: '',
    complemento: '',
    cidade: '',
    uf: '',
    agent_user_id: lead.assigned_agent_id,
    agent_name: lead.assigned_agent_name || '',
    business_type: '',
    lead_type: String(lead.lead_type ?? ''),
    origin: lead.source || '',
    temperature: lead.temperature || '',
    status: lead.status || '',
    stage_id: stageId,
    value,
    payment_method: '',
    has_financing: false,
    financing_amount: '',
    down_payment: '',
    banking_support: 'suporte',
    specific_conditions: '',
    transaction_form: null,
    external_partners: false,
    reviewed: false,
    sent_to_proponent: false,
    sent_to_owner: false,
    created_by: null,
    updated_by: null,
    created_at: lead.created_at,
    updated_at: updatedAt,
    parties: [
      {
        id: `lead-buyer-${lead.id}`,
        proposal_id: lead.id,
        party_type: 'comprador',
        full_name: lead.name || '',
        cpf: '',
        rg: '',
        phone: lead.phone || '',
        email: lead.email || '',
        is_company: false,
        signature_channel: 'whatsapp',
        signed_by: '',
        signature_status: 'pendente',
        created_at: lead.created_at,
        updated_at: updatedAt,
      },
    ],
    history: [],
  };
}
