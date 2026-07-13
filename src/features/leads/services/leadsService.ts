/**
 * 🎯 SERVIÇO DE LEADS DO CRM (Multi-tenant)
 * 
 * Este serviço gerencia os leads do corretor no Kanban.
 * Fonte de dados: public.leads (tabela do CRM)
 * 
 * Usado por: MeusLeadsAtribuidosSection (Kanban do corretor)
 */

import { supabase } from '@/lib/supabaseClient';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';

/**
 * Interface para leads do CRM/Kanban
 */
/**
 * Tipos de lead
 * 1 = Interessado (comprador/locatário) - DEFAULT
 * 2 = Proprietário (vendedor/locador)
 */
export type LeadType = 1 | 2;

export const LEAD_TYPE_INTERESSADO: LeadType = 1;
export const LEAD_TYPE_PROPRIETARIO: LeadType = 2;

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  1: 'Interessado',
  2: 'Proprietário'
};

export interface CRMLead {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  source_lead_id: string | null;
  status: string;
  temperature: string | null;
  property_id: string | null;
  property_code: string | null;
  property_value: number | null;
  property_type: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  comments: string | null;
  tags: string[] | null;
  custom_fields: Record<string, any> | null;
  visit_date: string | null;
  closing_date: string | null;
  final_sale_value: number | null;
  archived_at: string | null;
  archive_reason: string | null;
  lead_type: LeadType; // 1 = Interessado (default), 2 = Proprietário
  is_exclusive: boolean;
  participa_bolsao: boolean;
  /** Quando o corretor ATUAL recebeu este lead — base do cronômetro do bolsão */
  assigned_at: string;
  created_at: string;
  updated_at: string;
  first_response_at?: string | null;
}

/**
 * Interface compatível com BolsaoLead para o Kanban existente
 * Mapeia campos de CRMLead para o formato esperado pelo componente
 */
export interface KanbanLead {
  id: string;
  created_at: string;
  codigo: string | null;
  corretor: string | null;
  lead: string | null;
  numerocorretor: string | null;
  status: string | null;
  corretor_responsavel: string | null;
  numero_corretor_responsavel: string | null;
  data_atribuicao: string | null;
  atendido: boolean | null;
  data_atendimento: string | null;
  data_finalizacao: string | null;
  data_expiracao: string | null;
  nomedolead: string | null;
  Foto: string | null;
  portal: string | null;
  // Campos extras do CRM
  email: string | null;
  temperature: string | null;
  property_value: number | null;
  comments: string | null;
  // Arquivamento
  archived_at: string | null;
  archive_reason: string | null;
  // Tipo de lead: 1 = Interessado, 2 = Proprietário
  lead_type: LeadType;
  // Bolsão
  is_exclusive: boolean;
  participa_bolsao: boolean;
  /** Quando o corretor ATUAL recebeu este lead — base do cronômetro do bolsão */
  assigned_at: string;
  /**
   * EVENT TIME: quando o lead realmente surgiu/manifestou interesse no portal.
   * Para exibição, ordenação e filtros por data DO LEAD — NÃO para SLA/bolsão
   * (que usam created_at/assigned_at = processing time). Kenlo: lead_timestamp;
   * CRM: created_at (lá já é a data real do lead).
   */
  event_at: string;
}

const LEADS_TABLE = 'leads';

// Colunas que o Kanban realmente consome. Explícitas de propósito: `select('*')`
// trazia campos gordos (em kenlo_leads, o raw_data JSONB = payload Kenlo inteiro por
// lead) que o Kanban nunca lê e que dominavam o tempo de download.
const LEADS_KANBAN_COLUMNS =
  'id,created_at,updated_at,assigned_at,closing_date,property_code,property_value,assigned_agent_name,name,phone,email,source,status,temperature,comments,archived_at,archive_reason,lead_type,is_exclusive,participa_bolsao';
const KENLO_KANBAN_COLUMNS =
  'id,client_name,client_phone,client_email,message,interest_reference,attended_by_name,is_exclusive,interest_type,interest_is_sale,interest_is_rent,stage,temperature,portal,lead_timestamp,archived_at,archive_reason,updated_at,created_at,tenant_id';

const KENLO_PAGE_SIZE = 1000;
const KENLO_PAGE_CONCURRENCY = 6; // lotes paralelos em vez de páginas em série

// Pagina kenlo_leads em lotes concorrentes. `buildPageQuery(from)` deve devolver a
// query já filtrada/ordenada para o intervalo [from, from+PAGE_SIZE). Para quando um
// lote traz uma página com < PAGE_SIZE — mesmo critério do loop serial, avaliado por
// lote. ponytail: no pior caso o último lote busca algumas páginas vazias além do fim.
async function fetchKenloPagesInBatches(
  buildPageQuery: (from: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  maxPages = 50
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let batchStart = 0; batchStart < maxPages; batchStart += KENLO_PAGE_CONCURRENCY) {
    const size = Math.min(KENLO_PAGE_CONCURRENCY, maxPages - batchStart);
    const pages = await Promise.all(
      Array.from({ length: size }, (_, i) => buildPageQuery((batchStart + i) * KENLO_PAGE_SIZE))
    );
    let reachedEnd = false;
    for (const { data, error } of pages) {
      if (error) {
        console.error('❌ Erro kenlo_leads (lote):', error);
        reachedEnd = true;
        break;
      }
      const rows = (data || []) as Record<string, unknown>[];
      all.push(...rows);
      if (rows.length < KENLO_PAGE_SIZE) reachedEnd = true;
    }
    if (reachedEnd) break;
  }
  return all;
}
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

async function setFirstResponseAtIfMissing(
  tableName: typeof LEADS_TABLE | 'kenlo_leads',
  leadId: string,
  firstResponseAt: string
): Promise<void> {
  const { error } = await supabase
    .from(tableName)
    .update({ first_response_at: firstResponseAt })
    .eq('id', leadId)
    .is('first_response_at', null);

  if (error) {
    console.warn(`⚠️ Status atualizado, mas não foi possível gravar first_response_at em ${tableName}:`, error);
  }
}

/**
 * Mapeamento de stage do kenlo_leads para status do CRM
 */
const KENLO_STAGE_TO_STATUS: Record<string, string> = {
  'new': 'Novos Leads',
  'contacted': 'Interação',
  'qualified': 'Visita Agendada',
  'visit_scheduled': 'Visita Agendada',
  'visit_done': 'Visita Realizada',
  'visit': 'Visita Realizada',
  'negotiation': 'Negociação',
  'proposal': 'Proposta Enviada',
  'closed_won': 'Proposta Assinada',
  'closed_lost': 'Arquivado',
};

const KENLO_TEMP_MAP: Record<string, string> = {
  'cold': 'Frio',
  'warm': 'Morno',
  'hot': 'Quente',
};

/**
 * Converte um kenlo_lead para KanbanLead
 */
export function mapKenloToKanbanLead(kl: Record<string, unknown>): KanbanLead {
  const stage = (kl.stage as string) || 'new';
  const status = KENLO_STAGE_TO_STATUS[stage] || 'Novos Leads';
  return {
    id: kl.id as string,
    // created_at = processing time (import); o bolsão depende disto — NÃO trocar.
    created_at: (kl.created_at as string) || '',
    // event_at = data REAL do lead (Kenlo: lead_timestamp). Para exibição/ordenação.
    event_at: (kl.lead_timestamp as string) || (kl.created_at as string) || '',
    codigo: (kl.interest_reference as string) || null,
    corretor: (kl.attended_by_name as string) || null,
    lead: (kl.client_phone as string) || null,
    numerocorretor: null,
    status: mapStatusToKanbanSlug(status),
    corretor_responsavel: (kl.attended_by_name as string) || null,
    numero_corretor_responsavel: null,
    data_atribuicao: (kl.lead_timestamp as string) || (kl.created_at as string) || null,
    atendido: stage !== 'new',
    data_atendimento: stage !== 'new' ? (kl.updated_at as string) : null,
    data_finalizacao: null,
    data_expiracao: null,
    nomedolead: (kl.client_name as string) || 'Lead sem nome',
    Foto: null,
    portal: (kl.portal as string) || null,
    email: (kl.client_email as string) || null,
    temperature: KENLO_TEMP_MAP[(kl.temperature as string) || 'cold'] || 'Frio',
    property_value: null,
    comments: (kl.message as string) || null,
    archived_at: (kl.archived_at as string) || null,
    archive_reason: (kl.archive_reason as string) || null,
    // kenlo_leads vem sempre de portais → sempre interessado
    lead_type: LEAD_TYPE_INTERESSADO,
    is_exclusive: Boolean(kl.is_exclusive),
    // Leads vindos do Kenlo entram automaticamente no bolsão
    participa_bolsao: true,
    // Kenlo não tem assigned_at — usa created_at como base
    assigned_at: (kl.created_at as string) || '',
  };
}

/**
 * Busca kenlo_leads para o kanban.
 * Mostra apenas leads que já foram interagidos (stage != 'new')
 * + os 50 mais recentes em stage 'new' para não sobrecarregar o kanban.
 * Leads "new" em massa ficam na Central de Leads.
 */
async function fetchAllKenloLeadsForKanban(tenantId?: string): Promise<KanbanLead[]> {
  try {
    // Todos os leads não-arquivados da imobiliária, em lotes paralelos.
    // MAX_PAGES = 50 (50 mil leads) é o teto de segurança.
    const all = await fetchKenloPagesInBatches((from) => {
      let query = supabase
        .from('kenlo_leads')
        .select(KENLO_KANBAN_COLUMNS)
        .is('archived_at', null)
        // event time: ordena pela data REAL do lead, não pela de import.
        .order('lead_timestamp', { ascending: false })
        .range(from, from + KENLO_PAGE_SIZE - 1);
      if (tenantId) query = query.eq('tenant_id', tenantId);
      return query;
    }, 50);

    return all.map(mapKenloToKanbanLead);
  } catch (error) {
    console.error('❌ Erro ao buscar kenlo_leads para kanban:', error);
    return [];
  }
}

/**
 * Mapear status do banco para formato do Kanban (slug)
 * Banco usa "Novos Leads", Kanban usa "novos-leads"
 */
function mapStatusToKanbanSlug(status: string): string {
  const statusMap: Record<string, string> = {
    // Interessado
    'Novos Leads': 'novos-leads',
    'Interação': 'interacao',
    'Visita Agendada': 'visita-agendada',
    'Visita Realizada': 'visita-realizada',
    'Negociação': 'negociacao',
    'Proposta Criada': 'proposta-criada',
    'Proposta Enviada': 'proposta-enviada',
    'Proposta Assinada': 'proposta-assinada',
    // Proprietário (11 etapas do funil)
    'Novos Proprietários': 'novos-proprietarios',
    'Novo Proprietário': 'novos-proprietarios',
    'Em Atendimento': 'em-atendimento',
    'Primeira Visita': 'primeira-visita',
    'Criação do Estudo de Mercado': 'criacao-estudo-mercado',
    'Apresentação do Estudo de Mercado': 'apresentacao-estudo-mercado',
    'Não Exclusivo': 'nao-exclusivo',
    'Exclusivo': 'exclusivo',
    'Cadastro': 'cadastro',
    'Plano de Marketing': 'plano-marketing',
    'Propostas Respondidas': 'propostas-respondidas',
    'Feitura de Contrato': 'feitura-contrato',
    'Arquivado': 'arquivado'
  };
  return statusMap[status] || status?.toLowerCase().replace(/\s+/g, '-') || 'novos-leads';
}

/**
 * Mapear slug do Kanban para status do banco
 * Kanban usa "novos-leads", Banco usa "Novos Leads"
 */
function mapKanbanSlugToStatus(slug: string): string {
  const slugMap: Record<string, string> = {
    'novos-leads': 'Novos Leads',
    'interacao': 'Interação',
    'visita-agendada': 'Visita Agendada',
    'visita-realizada': 'Visita Realizada',
    'negociacao': 'Negociação',
    'proposta-criada': 'Proposta Criada',
    'proposta-enviada': 'Proposta Enviada',
    'proposta-assinada': 'Proposta Assinada',
    // Proprietário
    'novos-proprietarios': 'Novos Proprietários',
    'em-atendimento': 'Em Atendimento',
    'primeira-visita': 'Primeira Visita',
    'criacao-estudo-mercado': 'Criação do Estudo de Mercado',
    'apresentacao-estudo-mercado': 'Apresentação do Estudo de Mercado',
    'nao-exclusivo': 'Não Exclusivo',
    'exclusivo': 'Exclusivo',
    'cadastro': 'Cadastro',
    'plano-marketing': 'Plano de Marketing',
    'propostas-respondidas': 'Propostas Respondidas',
    'feitura-contrato': 'Feitura de Contrato',
    'arquivado': 'Arquivado'
  };
  return slugMap[slug] || slug;
}

/**
 * Mapear CRMLead para formato do Kanban (compatibilidade com BolsaoLead)
 */
export function mapToKanbanLead(lead: CRMLead): KanbanLead {
  return {
    id: lead.id,
    created_at: lead.created_at,
    // CRM: created_at já é a data real do lead → event_at = created_at (UI uniforme).
    event_at: lead.created_at,
    codigo: lead.property_code,
    corretor: lead.assigned_agent_name,
    lead: lead.phone,
    numerocorretor: null,
    status: mapStatusToKanbanSlug(lead.status),
    corretor_responsavel: lead.assigned_agent_name,
    numero_corretor_responsavel: null,
    data_atribuicao: lead.created_at,
    atendido: lead.status !== 'Novos Leads',
    data_atendimento: lead.status !== 'Novos Leads' ? lead.updated_at : null,
    data_finalizacao: lead.status === 'Proposta Assinada' ? lead.closing_date : null,
    data_expiracao: null,
    nomedolead: lead.name,
    Foto: null,
    portal: lead.source,
    email: lead.email,
    temperature: lead.temperature,
    property_value: lead.property_value,
    comments: lead.comments,
    archived_at: lead.archived_at,
    archive_reason: lead.archive_reason,
    lead_type: (lead.lead_type as LeadType) ?? LEAD_TYPE_INTERESSADO,
    is_exclusive: Boolean(lead.is_exclusive),
    participa_bolsao: lead.participa_bolsao !== false,
    assigned_at: lead.assigned_at || lead.created_at,
  };
}

/**
 * Busca leads do corretor logado (por assigned_agent_id)
 * @param userId - ID do usuário logado (auth.uid)
 */
export async function fetchLeadsDoCorretorCRM(
  userId: string,
  tenantId?: string,
  corretorNome?: string,
  leadType?: LeadType
): Promise<KanbanLead[]> {
  try {

    // 1) leads do CRM (tabela leads) — escopo por tenant obrigatório.
    //    Colunas explícitas: `select('*')` traz campos gordos que o Kanban não usa.
    let crmQuery = supabase
      .from(LEADS_TABLE)
      .select(LEADS_KANBAN_COLUMNS)
      .eq('assigned_agent_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (tenantId) crmQuery = crmQuery.eq('tenant_id', tenantId);
    if (leadType) crmQuery = crmQuery.eq('lead_type', leadType);

    // 2) kenlo_leads atribuídos pelo NOME do corretor, em lotes paralelos.
    //    kenlo_leads são sempre Interessado; se o filtro é Proprietário, pular.
    const buscaKenlo = leadType !== LEAD_TYPE_PROPRIETARIO && !!corretorNome && corretorNome.trim().length > 0;

    const [crmResult, kenloRows] = await Promise.all([
      crmQuery,
      buscaKenlo
        ? fetchKenloPagesInBatches((from) => {
            let q = supabase
              .from('kenlo_leads')
              .select(KENLO_KANBAN_COLUMNS)
              .ilike('attended_by_name', corretorNome!.trim())
              .is('archived_at', null)
              // event time: ordena pela data REAL do lead, não pela de import.
              // ORDER estável é obrigatório com paginação paralela (offsets disjuntos).
              .order('lead_timestamp', { ascending: false })
              .range(from, from + KENLO_PAGE_SIZE - 1);
            if (tenantId) q = q.eq('tenant_id', tenantId);
            return q;
          }, 20)
        : Promise.resolve([] as Record<string, unknown>[]),
    ]);

    if (crmResult.error) {
      console.error('❌ Erro ao buscar leads do corretor (CRM):', crmResult.error);
      throw crmResult.error;
    }
    const crmLeads = (crmResult.data || []).map(mapToKanbanLead);
    const kenloLeads = kenloRows.map((kl) => mapKenloToKanbanLead(kl));

    const allLeads = [...crmLeads, ...kenloLeads];
    return allLeads;

  } catch (error) {
    console.error('❌ Erro ao buscar leads do corretor:', error);
    return [];
  }
}

/**
 * Busca leads do corretor por nome (fallback se não tiver ID)
 * @param nomeCorretor - Nome do corretor
 */
export async function fetchLeadsDoCorretorPorNome(
  nomeCorretor: string,
  tenantId?: string,
  leadType?: LeadType
): Promise<KanbanLead[]> {
  try {

    // 1) leads (CRM)
    let crmQuery = supabase
      .from(LEADS_TABLE)
      .select('id,tenant_id,name,phone,email,source,source_lead_id,status,temperature,property_id,property_code,property_value,property_type,assigned_agent_id,assigned_agent_name,comments,tags,custom_fields,visit_date,closing_date,final_sale_value,lead_type,is_exclusive,participa_bolsao,assigned_at,created_at,updated_at')
      .ilike('assigned_agent_name', nomeCorretor)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (tenantId) crmQuery = crmQuery.eq('tenant_id', tenantId);
    if (leadType) crmQuery = crmQuery.eq('lead_type', leadType);

    const { data, error } = await crmQuery;
    if (error) {
      console.error('❌ Erro ao buscar leads por nome:', error);
      throw error;
    }
    const crmLeads = (data || []).map(mapToKanbanLead);

    // 2) kenlo_leads por attended_by_name — em lotes paralelos.
    //    kenlo_leads são sempre Interessado; se filtro é Proprietário, pular.
    if (leadType === LEAD_TYPE_PROPRIETARIO) {
      return crmLeads;
    }
    const allKenlo = await fetchKenloPagesInBatches((from) => {
      let q = supabase
        .from('kenlo_leads')
        .select(KENLO_KANBAN_COLUMNS)
        .ilike('attended_by_name', nomeCorretor)
        .is('archived_at', null)
        // event time: ordena pela data REAL do lead, não pela de import.
        .order('lead_timestamp', { ascending: false })
        .range(from, from + KENLO_PAGE_SIZE - 1);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      return q;
    }, 20);
    const kenloLeads = allKenlo.map((kl) => mapKenloToKanbanLead(kl));

    const all = [...crmLeads, ...kenloLeads];
    return all;
  } catch (error) {
    console.error('❌ Erro ao buscar leads por nome:', error);
    return [];
  }
}

/**
 * Busca TODOS os leads em andamento (para Admin)
 * Retorna leads de todos os corretores do tenant
 */
export async function fetchTodosLeadsCRM(tenantId?: string, leadType?: LeadType): Promise<KanbanLead[]> {
  try {

    // Buscar leads CRM — filtrar por tenant_id (escopo multi-tenant obrigatório)
    let crmQuery = supabase
      .from(LEADS_TABLE)
      .select(LEADS_KANBAN_COLUMNS)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (tenantId) crmQuery = crmQuery.eq('tenant_id', tenantId);
    if (leadType) crmQuery = crmQuery.eq('lead_type', leadType);

    const { data, error } = await crmQuery;
    if (error) {
      console.error('❌ Erro ao buscar leads CRM:', error);
      throw error;
    }
    const crmLeads = (data || []).map(mapToKanbanLead);

    // kenlo_leads (sempre Interessado; se filtro é Proprietário, pular)
    if (leadType === LEAD_TYPE_PROPRIETARIO) {
      return crmLeads;
    }
    const kenloLeads = await fetchAllKenloLeadsForKanban(tenantId);

    const allLeads = [...crmLeads, ...kenloLeads];
    return allLeads;

  } catch (error) {
    console.error('❌ Erro ao buscar todos os leads:', error);
    return [];
  }
}

/**
 * Atualiza o status de um lead no Kanban
 * @param leadId - ID do lead (UUID)
 * @param novoStatus - Novo status (slug do Kanban como 'visita-agendada' ou texto como 'Visita Agendada')
 */
export async function atualizarStatusLeadCRM(
  leadId: string,
  novoStatus: string
): Promise<{ success: boolean; message: string }> {
  try {
    const statusParaSalvar = mapKanbanSlugToStatus(novoStatus);
    const nowIso = new Date().toISOString();


    // Tentar atualizar na tabela leads primeiro
    const updateData: Record<string, any> = {
      status: statusParaSalvar,
      updated_at: nowIso
    };
    
    const isFirstResponse = ![
      'Novos Leads',
      'Novos Proprietários',
    ].includes(statusParaSalvar);

    if (statusParaSalvar === 'Proposta Assinada') {
      updateData.closing_date = nowIso;
    }

    let updatedCrmLead: Array<{ id: string }> | null = null;
    let crmError: unknown = null;

    // IDs do Kenlo podem não ser UUID. Evita consultar public.leads com um ID
    // incompatível antes do fallback para kenlo_leads.
    if (isUuid(leadId)) {
      const crmResult = await supabase
        .from(LEADS_TABLE)
        .update(updateData)
        .eq('id', leadId)
        .select('id');

      updatedCrmLead = crmResult.data;
      crmError = crmResult.error;
    } else {
      updatedCrmLead = [];
    }

    // Se não encontrou na tabela leads, tentar na kenlo_leads
    if (!crmError && (!updatedCrmLead || updatedCrmLead.length === 0)) {
      // Mapear status pt-BR para stage inglês para kenlo_leads
      const statusToStage: Record<string, string> = {
        'Novos Leads': 'new',
        'Interação': 'contacted',
        'Visita Agendada': 'qualified',
        'Visita Realizada': 'visit_done',
        'Negociação': 'negotiation',
        'Proposta Criada': 'proposal',
        'Proposta Enviada': 'proposal',
        'Proposta Assinada': 'closed_won',
      };

      const kenloStage = statusToStage[statusParaSalvar] || 'new';
      const kenloTemp = statusParaSalvar === 'Proposta Assinada' ? 'hot' :
                        ['Negociação', 'Proposta Criada', 'Proposta Enviada'].includes(statusParaSalvar) ? 'warm' : undefined;

      const kenloUpdate: Record<string, any> = {
        stage: kenloStage,
        updated_at: nowIso,
      };
      if (kenloTemp) kenloUpdate.temperature = kenloTemp;

      const { data: updatedKenloLead, error: kenloError } = await supabase
        .from('kenlo_leads')
        .update(kenloUpdate)
        .eq('id', leadId)
        .select('id');

      if (kenloError) {
        console.error('❌ Erro ao atualizar kenlo_lead:', kenloError);
        throw kenloError;
      }

      if (!updatedKenloLead || updatedKenloLead.length === 0) {
        return { success: false, message: 'Lead não encontrado para atualizar status.' };
      }

      if (isFirstResponse) {
        await setFirstResponseAtIfMissing('kenlo_leads', leadId, nowIso);
      }

    } else if (crmError) {
      console.error('❌ Erro ao atualizar status CRM:', crmError);
      throw crmError;
    } else {
      if (isFirstResponse) {
        await setFirstResponseAtIfMissing(LEADS_TABLE, leadId, nowIso);
      }
    }

    leadsEventEmitter.emit();

    return { success: true, message: `Status atualizado para ${statusParaSalvar}!` };

  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';

    const message = /failed to fetch|networkerror|load failed/i.test(errorMessage)
      ? 'Nao foi possivel conectar ao Supabase. Verifique internet, URL/chave do Supabase, CORS ou bloqueios do navegador.'
      : errorMessage || 'Erro ao atualizar status.';

    return { success: false, message };
  }
}

/**
 * Atualiza a temperatura de um lead
 */
export async function atualizarTemperaturaLeadCRM(
  leadId: string, 
  novaTemperatura: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from(LEADS_TABLE)
      .update({ 
        temperature: novaTemperatura,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) throw error;
    
    // 🔔 Notificar componentes que escutam
    leadsEventEmitter.emit();
    
    return { success: true, message: `Temperatura atualizada para ${novaTemperatura}!` };
  } catch (error) {
    console.error('❌ Erro ao atualizar temperatura:', error);
    return { success: false, message: 'Erro ao atualizar temperatura.' };
  }
}

/**
 * Arquiva um lead (soft delete)
 */
export async function arquivarLeadCRM(
  leadId: string,
  motivo?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from(LEADS_TABLE)
      .update({ 
        archived_at: new Date().toISOString(),
        archive_reason: motivo || 'Arquivado pelo usuário',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) throw error;
    
    // 🔔 Notificar componentes que escutam
    leadsEventEmitter.emit();
    
    return { success: true, message: 'Lead arquivado com sucesso!' };
  } catch (error) {
    console.error('❌ Erro ao arquivar lead:', error);
    return { success: false, message: 'Erro ao arquivar lead.' };
  }
}

/**
 * Busca leads arquivados do corretor logado
 * @param userId - ID do usuário logado (auth.uid)
 */
export async function fetchLeadsArquivadosDoCorretor(userId: string): Promise<KanbanLead[]> {
  try {
    
    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('*')
      .eq('assigned_agent_id', userId)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
    
    if (error) throw error;
    
    const leads = (data || []).map(mapToKanbanLead);
    return leads;
  } catch (error) {
    console.error('❌ Erro ao buscar leads arquivados do corretor:', error);
    return [];
  }
}

/**
 * Busca TODOS os leads arquivados do tenant (para Admin/Gestão)
 */
export async function fetchTodosLeadsArquivadosCRM(): Promise<KanbanLead[]> {
  try {
    
    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
    
    if (error) throw error;
    
    const leads = (data || []).map(mapToKanbanLead);
    return leads;
  } catch (error) {
    console.error('❌ Erro ao buscar todos os leads arquivados:', error);
    return [];
  }
}

/**
 * Desarquiva um lead (restaura para ativo)
 */
export async function desarquivarLeadCRM(
  leadId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from(LEADS_TABLE)
      .update({ 
        archived_at: null,
        archive_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) throw error;
    
    leadsEventEmitter.emit();
    
    return { success: true, message: 'Lead restaurado com sucesso!' };
  } catch (error) {
    console.error('❌ Erro ao desarquivar lead:', error);
    return { success: false, message: 'Erro ao desarquivar lead.' };
  }
}

/**
 * Busca métricas do funil para um corretor
 */
export async function fetchMetricasFunilCorretor(userId: string): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('status')
      .eq('assigned_agent_id', userId)
      .is('archived_at', null);
    
    if (error) throw error;
    
    const metricas: Record<string, number> = {};
    (data || []).forEach(lead => {
      const status = lead.status || 'Novos Leads';
      metricas[status] = (metricas[status] || 0) + 1;
    });
    
    return metricas;
  } catch (error) {
    console.error('❌ Erro ao buscar métricas:', error);
    return {};
  }
}

/**
 * Busca métricas do funil para todos os corretores (Admin)
 */
export async function fetchMetricasFunilAdmin(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('status')
      .is('archived_at', null);
    
    if (error) throw error;
    
    const metricas: Record<string, number> = {};
    (data || []).forEach(lead => {
      const status = lead.status || 'Novos Leads';
      metricas[status] = (metricas[status] || 0) + 1;
    });
    
    return metricas;
  } catch (error) {
    console.error('❌ Erro ao buscar métricas admin:', error);
    return {};
  }
}
