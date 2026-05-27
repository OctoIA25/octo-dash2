import { supabase } from '@/lib/supabaseClient';

export type SavedProposalStageId =
  | 'negociacao'
  | 'proposta-criada'
  | 'proposta-enviada'
  | 'propostas-respondidas'
  | 'feitura-contrato'
  | 'proposta-assinada'
  | 'arquivado';

export type SavedPropertyOrigin = 'interno' | 'externo';
export type SavedSignatureChannel = 'whatsapp' | 'email';
export type SavedSignatureStatus = 'pendente' | 'enviado' | 'assinado' | 'recusado';
export type SavedCreditSupport = 'aprovado' | 'suporte';
export type SavedProposalPartyType = 'comprador' | 'vendedor';
export type SavedProposalTransactionForm = Record<string, string>;

export interface SavedProposalParty {
  id: string;
  proposal_id: string;
  tenant_id: string;
  party_type: SavedProposalPartyType;
  full_name: string;
  cpf: string;
  rg: string;
  phone: string;
  email: string;
  is_company: boolean;
  signature_channel: SavedSignatureChannel;
  signed_by: string;
  signature_status: SavedSignatureStatus;
  created_at: string;
  updated_at: string;
}

export interface SavedProposalHistory {
  id: string;
  proposal_id: string;
  tenant_id: string;
  label: string;
  detail: string;
  created_by: string | null;
  created_at: string;
}

export interface SavedProposal {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  source: 'crm' | 'draft' | 'manual';
  property_origin: SavedPropertyOrigin;
  property_reference: string;
  cep: string;
  numero: string;
  logradouro: string;
  bairro: string;
  complemento: string;
  cidade: string;
  uf: string;
  agent_user_id: string | null;
  agent_name: string;
  business_type: string;
  lead_type: string;
  origin: string;
  temperature: string;
  status: string;
  stage_id: SavedProposalStageId;
  value: number | string;
  payment_method: string;
  has_financing: boolean;
  financing_amount: string;
  down_payment: string;
  banking_support: SavedCreditSupport;
  specific_conditions: string;
  transaction_form?: SavedProposalTransactionForm | null;
  external_partners: boolean;
  reviewed: boolean;
  sent_to_proponent: boolean;
  sent_to_owner: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  parties: SavedProposalParty[];
  history: SavedProposalHistory[];
}

export interface SaveProposalPartyInput {
  id?: string;
  partyType: SavedProposalPartyType;
  fullName: string;
  cpf: string;
  rg: string;
  phone: string;
  email: string;
  isCompany: boolean;
  signatureChannel: SavedSignatureChannel;
  signedBy: string;
  signatureStatus: SavedSignatureStatus;
}

export interface SaveProposalHistoryInput {
  label: string;
  detail: string;
  createdAt?: string;
}

export interface SaveProposalInput {
  id?: string;
  tenantId: string;
  userId?: string | null;
  leadId?: string | null;
  source: 'crm' | 'draft' | 'manual';
  propertyOrigin: SavedPropertyOrigin;
  propertyReference: string;
  cep: string;
  numero: string;
  logradouro: string;
  bairro: string;
  complemento: string;
  cidade: string;
  uf: string;
  agentUserId?: string | null;
  agentName: string;
  businessType: string;
  leadType: string;
  origin: string;
  temperature: string;
  status: string;
  stageId: SavedProposalStageId;
  value: number;
  paymentMethod: string;
  hasFinancing: boolean;
  financingAmount: string;
  downPayment: string;
  bankingSupport: SavedCreditSupport;
  specificConditions: string;
  transactionForm?: SavedProposalTransactionForm;
  externalPartners: boolean;
  reviewed: boolean;
  sentToProponent: boolean;
  sentToOwner: boolean;
  parties: SaveProposalPartyInput[];
  history?: SaveProposalHistoryInput[];
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string | null | undefined) => Boolean(value && uuidPattern.test(value));

const mapProposalRow = (input: SaveProposalInput) => ({
  tenant_id: input.tenantId,
  lead_id: isUuid(input.leadId) ? input.leadId : null,
  source: input.source,
  property_origin: input.propertyOrigin,
  property_reference: input.propertyReference,
  cep: input.cep,
  numero: input.numero,
  logradouro: input.logradouro,
  bairro: input.bairro,
  complemento: input.complemento,
  cidade: input.cidade,
  uf: input.uf,
  agent_user_id: isUuid(input.agentUserId) ? input.agentUserId : null,
  agent_name: input.agentName,
  business_type: input.businessType,
  lead_type: input.leadType,
  origin: input.origin,
  temperature: input.temperature,
  status: input.status,
  stage_id: input.stageId,
  value: input.value,
  payment_method: input.paymentMethod,
  has_financing: input.hasFinancing,
  financing_amount: input.financingAmount,
  down_payment: input.downPayment,
  banking_support: input.bankingSupport,
  specific_conditions: input.specificConditions,
  transaction_form: input.transactionForm || {},
  external_partners: input.externalPartners,
  reviewed: input.reviewed,
  sent_to_proponent: input.sentToProponent,
  sent_to_owner: input.sentToOwner,
  updated_by: isUuid(input.userId) ? input.userId : null,
});

const mapPartyRow = (
  proposalId: string,
  tenantId: string,
  party: SaveProposalPartyInput,
) => ({
  ...(isUuid(party.id) ? { id: party.id } : {}),
  proposal_id: proposalId,
  tenant_id: tenantId,
  party_type: party.partyType,
  full_name: party.fullName,
  cpf: party.cpf,
  rg: party.rg,
  phone: party.phone,
  email: party.email,
  is_company: party.isCompany,
  signature_channel: party.signatureChannel,
  signed_by: party.signedBy,
  signature_status: party.signatureStatus,
});

const mapHistoryRow = (
  proposalId: string,
  tenantId: string,
  userId: string | null | undefined,
  item: SaveProposalHistoryInput,
) => ({
  proposal_id: proposalId,
  tenant_id: tenantId,
  label: item.label,
  detail: item.detail,
  created_by: isUuid(userId) ? userId : null,
  ...(item.createdAt ? { created_at: item.createdAt } : {}),
});

function composeSavedProposal(
  proposal: Omit<SavedProposal, 'parties' | 'history'>,
  parties: SavedProposalParty[],
  history: SavedProposalHistory[],
): SavedProposal {
  return {
    ...proposal,
    parties,
    history,
  };
}

export async function fetchSavedProposals(tenantId: string): Promise<SavedProposal[]> {
  if (!tenantId || tenantId === 'owner') return [];

  const { data, error } = await supabase
    .from('proposals')
    .select(`
      *,
      parties:proposal_parties(*),
      history:proposal_history(*)
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Erro ao buscar propostas.');
  }

  const rows = (data || []) as Array<
    Omit<SavedProposal, 'parties' | 'history'> & {
      parties: SavedProposalParty[] | null;
      history: SavedProposalHistory[] | null;
    }
  >;

  return rows.map((row) => composeSavedProposal(
    row,
    (row.parties || []).slice().sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    ),
    (row.history || []).slice().sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    ),
  ));
}

export async function createSavedProposal(input: SaveProposalInput): Promise<SavedProposal> {
  if (input.leadId && isUuid(input.leadId)) {
    const { data: existing, error: existingError } = await supabase
      .from('proposals')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('lead_id', input.leadId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message || 'Erro ao verificar proposta existente.');
    }

    const existingId = existing?.[0]?.id as string | undefined;
    if (existingId) {
      const updated = await updateSavedProposal({ ...input, id: existingId });

      if (!input.history?.length) return updated;

      const appendedHistory = await appendSavedProposalHistoryItems({
        proposalId: existingId,
        tenantId: input.tenantId,
        userId: input.userId,
        items: input.history,
      });
      const { parties, history, ...proposalRow } = updated;

      return composeSavedProposal(proposalRow, parties, [...appendedHistory, ...history]);
    }
  }

  const { data: proposalRow, error: proposalError } = await supabase
    .from('proposals')
    .insert({
      ...mapProposalRow(input),
      created_by: isUuid(input.userId) ? input.userId : null,
    })
    .select('*')
    .single();

  if (proposalError || !proposalRow) {
    throw new Error(proposalError?.message || 'Erro ao criar proposta.');
  }

  const proposal = proposalRow as Omit<SavedProposal, 'parties' | 'history'>;

  const parties = input.parties.length > 0
    ? await replaceSavedProposalParties(proposal.id, input.tenantId, input.parties)
    : [];

  const history = input.history?.length
    ? await appendSavedProposalHistoryItems({
        proposalId: proposal.id,
        tenantId: input.tenantId,
        userId: input.userId,
        items: input.history,
      })
    : [];

  return composeSavedProposal(proposal, parties, history);
}

export async function updateSavedProposal(input: SaveProposalInput & { id: string }): Promise<SavedProposal> {
  const { data: proposalRow, error: proposalError } = await supabase
    .from('proposals')
    .update(mapProposalRow(input))
    .eq('id', input.id)
    .eq('tenant_id', input.tenantId)
    .select('*')
    .single();

  if (proposalError || !proposalRow) {
    throw new Error(proposalError?.message || 'Erro ao atualizar proposta.');
  }

  const parties = await replaceSavedProposalParties(input.id, input.tenantId, input.parties);
  const { data: historyRows, error: historyError } = await supabase
    .from('proposal_history')
    .select('*')
    .eq('proposal_id', input.id)
    .order('created_at', { ascending: false });

  if (historyError) {
    throw new Error(historyError.message || 'Erro ao buscar histórico atualizado.');
  }

  return composeSavedProposal(
    proposalRow as Omit<SavedProposal, 'parties' | 'history'>,
    parties,
    (historyRows || []) as SavedProposalHistory[],
  );
}

export async function updateSavedProposalFields(
  input: SaveProposalInput & { id: string },
): Promise<void> {
  const { error } = await supabase
    .from('proposals')
    .update(mapProposalRow(input))
    .eq('id', input.id)
    .eq('tenant_id', input.tenantId);

  if (error) {
    throw new Error(error.message || 'Erro ao atualizar proposta.');
  }
}

export async function updateSavedProposalStage(
  id: string,
  tenantId: string,
  stageId: SavedProposalStageId,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from('proposals')
    .update({ stage_id: stageId, status })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message || 'Erro ao sincronizar etapa da proposta.');
  }
}

/**
 * Atualiza o `stage_id` (e o `status` legível) de todas as propostas vinculadas
 * a um lead. Usado quando o lead muda de etapa no kanban de leads — assim a
 * proposta correspondente não fica congelada na etapa antiga.
 * Retorna o número de propostas atualizadas.
 */
export async function syncProposalStageFromLead(
  leadId: string,
  tenantId: string,
  stageId: SavedProposalStageId,
  status: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('proposals')
    .update({ stage_id: stageId, status })
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId)
    .select('id');

  if (error) {
    throw new Error(error.message || 'Erro ao sincronizar proposta a partir do lead.');
  }

  return data?.length ?? 0;
}

export async function replaceSavedProposalParties(
  proposalId: string,
  tenantId: string,
  parties: SaveProposalPartyInput[],
): Promise<SavedProposalParty[]> {
  const { error: deleteError } = await supabase
    .from('proposal_parties')
    .delete()
    .eq('proposal_id', proposalId)
    .eq('tenant_id', tenantId);

  if (deleteError) {
    throw new Error(deleteError.message || 'Erro ao substituir participantes da proposta.');
  }

  if (parties.length === 0) return [];

  const { data, error } = await supabase
    .from('proposal_parties')
    .insert(parties.map((party) => mapPartyRow(proposalId, tenantId, party)))
    .select('*');

  if (error) {
    throw new Error(error.message || 'Erro ao salvar participantes da proposta.');
  }

  return (data || []) as SavedProposalParty[];
}

export async function appendSavedProposalHistoryItems({
  proposalId,
  tenantId,
  userId,
  items,
}: {
  proposalId: string;
  tenantId: string;
  userId?: string | null;
  items: SaveProposalHistoryInput[];
}): Promise<SavedProposalHistory[]> {
  if (items.length === 0) return [];

  const { data, error } = await supabase
    .from('proposal_history')
    .insert(items.map((item) => mapHistoryRow(proposalId, tenantId, userId, item)))
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Erro ao salvar histórico da proposta.');
  }

  return (data || []) as SavedProposalHistory[];
}
