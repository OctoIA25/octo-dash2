/**
 * 🎯 SERVIÇO DE MÉTRICAS DE LEADS (Multi-tenant)
 * 
 * Este serviço fornece métricas e dados de funil baseados em public.leads
 * com suporte para:
 * - Admin: métricas consolidadas de todo o tenant
 * - Corretor: métricas apenas dos próprios leads
 * - Segmentação por lead_type (1=Interessado, 2=Proprietário)
 * 
 * Fonte de dados: public.leads (mesma tabela do Kanban)
 */

import { supabase } from '@/lib/supabaseClient';
import { CRMLead, LeadType, LEAD_TYPE_INTERESSADO, LEAD_TYPE_PROPRIETARIO } from './leadsService';
import { ProcessedLead } from '@/data/realLeadsProcessor';

const TEST_TENANT_ID = 'tenant-area-de-teste';

/**
 * Mapeamento de stage do kenlo_leads (inglês) para status do CRM (português)
 */
const KENLO_STAGE_MAP: Record<string, string> = {
  'new': 'Novos Leads',
  'contacted': 'Interação',
  'qualified': 'Visita Agendada',
  'visit': 'Visita Realizada',
  'negotiation': 'Negociação',
  'proposal': 'Proposta Enviada',
  'closed': 'Proposta Assinada',
};

/**
 * Mapeamento de temperatura do kenlo_leads (inglês) para CRM (português)
 */
const KENLO_TEMPERATURE_MAP: Record<string, string> = {
  'cold': 'Frio',
  'warm': 'Morno',
  'hot': 'Quente',
};

/**
 * Converte um kenlo_lead para o formato CRMLead
 */
function kenloLeadToCRMLead(kenloLead: Record<string, unknown>): CRMLead {
  const stage = (kenloLead.stage as string) || 'new';
  const temperature = (kenloLead.temperature as string) || 'cold';

  return {
    id: kenloLead.id as string,
    tenant_id: kenloLead.tenant_id as string,
    name: (kenloLead.client_name as string) || 'Lead sem nome',
    phone: (kenloLead.client_phone as string) || null,
    email: (kenloLead.client_email as string) || null,
    source: (kenloLead.portal as string) || 'Kenlo',
    source_lead_id: (kenloLead.external_id as string) || null,
    status: KENLO_STAGE_MAP[stage] || 'Novos Leads',
    temperature: KENLO_TEMPERATURE_MAP[temperature] || 'Frio',
    property_id: null,
    property_code: (kenloLead.interest_reference as string) || null,
    property_value: null,
    property_type: kenloLead.interest_is_rent ? 'Locação' : kenloLead.interest_is_sale ? 'Venda' : null,
    assigned_agent_id: null,
    assigned_agent_name: (kenloLead.attended_by_name as string) || null,
    comments: (kenloLead.message as string) || null,
    tags: null,
    custom_fields: null,
    visit_date: null,
    closing_date: null,
    final_sale_value: null,
    archived_at: null,
    archive_reason: null,
    lead_type: 1,
    is_exclusive: false,
    participa_bolsao: false,
    assigned_at: (kenloLead.created_at as string) || new Date().toISOString(),
    created_at: (kenloLead.created_at as string) || new Date().toISOString(),
    updated_at: (kenloLead.updated_at as string) || new Date().toISOString(),
  };
}

/**
 * Busca kenlo_leads do Supabase e converte para CRMLead[]
 */
async function fetchKenloLeadsAsCRM(
  tenantId: string,
  agentId: string | null,
  includeArchived: boolean
): Promise<CRMLead[]> {
  try {
    // Buscar TODOS os kenlo_leads com paginação (Supabase limita a 1000 por query)
    const PAGE_SIZE = 1000;
    let allData: Record<string, unknown>[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('kenlo_leads')
        .select('*')
        .eq('tenant_id', tenantId)
        .range(from, from + PAGE_SIZE - 1);

      if (agentId) {
        query = query.eq('attended_by_name', agentId);
      }

      if (!includeArchived) {
        query = query.is('archived_at', null);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar kenlo_leads (page from=' + from + '):', error);
        break;
      }

      const page = (data || []) as Record<string, unknown>[];
      allData = [...allData, ...page];

      if (page.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    }

    return allData.map(kenloLeadToCRMLead);
  } catch (error) {
    console.error('❌ Erro ao buscar kenlo_leads:', error);
    return [];
  }
}

const TEST_TENANT_LEADS: CRMLead[] = (() => {
  const base = new Date('2026-02-01T10:00:00.000Z');
  const iso = (d: Date) => d.toISOString();
  const day = (n: number) => new Date(base.getTime() + n * 24 * 60 * 60 * 1000);

  const mk = (i: number, input: Partial<CRMLead> & Pick<CRMLead, 'status' | 'lead_type'>): CRMLead => {
    const createdAt = input.created_at ?? iso(day(i % 28));
    const updatedAt = input.updated_at ?? createdAt;
    return {
      id: input.id ?? `test-lead-${i}`,
      tenant_id: TEST_TENANT_ID,
      name: input.name ?? `Lead Teste ${String(i).padStart(3, '0')}`,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source ?? 'Site',
      source_lead_id: input.source_lead_id ?? null,
      status: input.status,
      temperature: input.temperature ?? (i % 5 === 0 ? 'Quente' : i % 3 === 0 ? 'Morno' : 'Frio'),
      property_id: input.property_id ?? null,
      property_code: input.property_code ?? `IMV-${1000 + i}`,
      property_value: input.property_value ?? (450000 + (i % 7) * 35000),
      property_type: input.property_type ?? (i % 4 === 0 ? 'Apartamento' : 'Casa'),
      assigned_agent_id: input.assigned_agent_id ?? (i % 4 === 0 ? 'agent-a' : i % 4 === 1 ? 'agent-b' : i % 4 === 2 ? 'agent-c' : 'agent-d'),
      assigned_agent_name: input.assigned_agent_name ?? (i % 4 === 0 ? 'Ana Giglio' : i % 4 === 1 ? 'Felipe Martins' : i % 4 === 2 ? 'Mariana Mamede' : 'André Coelho'),
      comments: input.comments ?? null,
      tags: input.tags ?? null,
      custom_fields: input.custom_fields ?? null,
      visit_date: input.visit_date ?? null,
      closing_date: input.closing_date ?? null,
      final_sale_value: input.final_sale_value ?? null,
      archived_at: input.archived_at ?? null,
      archive_reason: input.archive_reason ?? null,
      lead_type: input.lead_type,
      is_exclusive: input.is_exclusive ?? (i % 3 === 0),
      participa_bolsao: input.participa_bolsao ?? true,
      assigned_at: input.assigned_at ?? createdAt,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  };

  const interessadoStatuses = [
    'Novos Leads',
    'Interação',
    'Visita Agendada',
    'Visita Realizada',
    'Negociação',
    'Proposta Criada',
    'Proposta Enviada',
    'Proposta Assinada',
  ];

  const proprietarioStatuses = [
    'Novos Proprietários',
    'Em Atendimento',
    'Primeira Visita',
    'Criação do Estudo de Mercado',
    'Apresentação Do Estudo de Mercado',
    'Não Exclusivo',
    'Exclusivo',
    'Cadastro',
    'Plano de Marketing',
    'Propostas Respondidas',
    'Feitura de Contrato',
  ];

  const leads: CRMLead[] = [];

  for (let i = 1; i <= 36; i++) {
    const status = interessadoStatuses[i % interessadoStatuses.length];
    const isAssinada = status === 'Proposta Assinada';
    leads.push(
      mk(i, {
        status,
        lead_type: LEAD_TYPE_INTERESSADO,
        source: i % 6 === 0 ? 'Indicação' : i % 5 === 0 ? 'WhatsApp' : i % 4 === 0 ? 'Google Ads' : 'Site',
        visit_date: status === 'Visita Agendada' || status === 'Visita Realizada' ? iso(day((i % 28) + 1)) : null,
        closing_date: isAssinada ? iso(day((i % 28) + 2)) : null,
        final_sale_value: isAssinada ? 520000 + (i % 5) * 25000 : null,
      })
    );
  }

  for (let i = 37; i <= 52; i++) {
    const status = proprietarioStatuses[i % proprietarioStatuses.length];
    leads.push(
      mk(i, {
        status,
        lead_type: LEAD_TYPE_PROPRIETARIO,
        source: i % 3 === 0 ? 'Captação' : 'Indicação',
        property_value: 650000 + (i % 6) * 60000,
        property_type: i % 2 === 0 ? 'Apartamento' : 'Casa',
      })
    );
  }

  return leads.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
})();

/**
 * Etapas do funil de Interessado (comprador/locatário)
 */
export const FUNNEL_STAGES_INTERESSADO = [
  'Novos Leads',
  'Interação',
  'Visita Agendada',
  'Visita Realizada',
  'Negociação',
  'Proposta Criada',
  'Proposta Enviada',
  'Proposta Assinada'
];

/**
 * Etapas do funil de Proprietário (vendedor/locador)
 */
export const FUNNEL_STAGES_PROPRIETARIO = [
  'Novos Proprietários',
  'Em Atendimento',
  'Primeira Visita',
  'Criação do Estudo de Mercado',
  'Apresentação Do Estudo de Mercado',
  'Não Exclusivo',
  'Exclusivo',
  'Cadastro',
  'Plano de Marketing',
  'Propostas Respondidas',
  'Feitura de Contrato'
];

/**
 * Interface para métricas do funil
 */
export interface FunnelMetrics {
  stages: { name: string; count: number; percentage: number }[];
  totalLeads: number;
  leadType: LeadType;
  isAdminView: boolean;
}

/**
 * Interface para métricas gerais
 */
export interface LeadsMetrics {
  totalLeads: number;
  leadsByStatus: Record<string, number>;
  leadsByTemperature: Record<string, number>;
  leadsByType: Record<LeadType, number>;
  conversionRate: number;
  leadType: LeadType | 'all';
  isAdminView: boolean;
}

/**
 * Buscar leads do CRM para métricas
 * @param tenantId ID do tenant
 * @param agentId ID do corretor (null = admin, vê todos)
 * @param leadType Tipo de lead (1=Interessado, 2=Proprietário, null=todos)
 * @param includeArchived Incluir leads arquivados
 */
export async function fetchLeadsForMetrics(
  tenantId: string,
  agentId: string | null = null,
  leadType: LeadType | null = null,
  includeArchived: boolean = false
): Promise<CRMLead[]> {
  try {
    if (tenantId === TEST_TENANT_ID) {
      let results = TEST_TENANT_LEADS;

      if (agentId) {
        results = results.filter((l) => l.assigned_agent_id === agentId);
      }

      if (leadType === LEAD_TYPE_PROPRIETARIO) {
        results = results.filter((l) => l.lead_type === LEAD_TYPE_PROPRIETARIO);
      } else if (leadType === LEAD_TYPE_INTERESSADO) {
        results = results.filter(
          (l) => l.lead_type === LEAD_TYPE_INTERESSADO || l.lead_type === null || l.lead_type === undefined
        );
      }

      if (!includeArchived) {
        results = results.filter((l) => !l.archived_at);
      }

      return results;
    }

    let query = supabase
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantId);

    // Filtrar por corretor se não for admin
    if (agentId) {
      query = query.eq('assigned_agent_id', agentId);
    }

    // Filtrar por tipo de lead
    // NOTA: leads sem lead_type são tratados como Interessado (tipo 1) por padrão
    // Proprietário (tipo 2) requer filtro explícito no banco
    if (leadType === LEAD_TYPE_PROPRIETARIO) {
      query = query.eq('lead_type', leadType);
    }
    // Para Interessado (tipo 1) ou null, buscamos todos e filtramos no código
    // pois precisamos incluir leads com lead_type null/undefined

    // Excluir arquivados por padrão
    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    // Ordenar por data de criação (mais recentes primeiro)
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('❌ Erro ao buscar leads para métricas:', error);
      return [];
    }

    let crmLeads = (data || []) as CRMLead[];

    // Buscar kenlo_leads e unificar com leads do CRM
    const kenloLeads = await fetchKenloLeadsAsCRM(tenantId, agentId, includeArchived);
    let results = [...crmLeads, ...kenloLeads];

    // Filtrar por tipo Interessado no código (inclui leads com lead_type null/undefined)
    if (leadType === LEAD_TYPE_INTERESSADO) {
      results = results.filter(lead =>
        lead.lead_type === LEAD_TYPE_INTERESSADO ||
        lead.lead_type === null ||
        lead.lead_type === undefined
      );
    }


    return results;
  } catch (error) {
    console.error('❌ Erro ao buscar leads para métricas:', error);
    return [];
  }
}

/**
 * Calcular métricas do funil
 * @param leads Lista de leads
 * @param leadType Tipo de lead (1=Interessado, 2=Proprietário)
 * @param isAdminView Se é visão de admin (consolidada)
 */
export function calculateFunnelMetrics(
  leads: CRMLead[],
  leadType: LeadType,
  isAdminView: boolean
): FunnelMetrics {
  const stages = leadType === LEAD_TYPE_INTERESSADO 
    ? FUNNEL_STAGES_INTERESSADO 
    : FUNNEL_STAGES_PROPRIETARIO;

  const totalLeads = leads.length;

  const stagesData = stages.map(stageName => {
    // Mapear nome da etapa para possíveis variações no banco
    // IMPORTANTE: Usar apenas match EXATO para evitar contagem duplicada
    const count = leads.filter(lead => {
      const status = (lead.status || '').trim().toLowerCase();
      const stageLower = stageName.trim().toLowerCase();
      
      // Match exato (case-insensitive)
      if (status === stageLower) return true;
      
      // Mapeamentos específicos para variações conhecidas
      if (stageName === 'Novos Leads' && status === 'novo lead') return true;
      if (stageName === 'Novos Proprietários' && status === 'novo proprietário') return true;
      if (stageName === 'Em Atendimento' && status === 'em atendimento') return true;
      if (stageName === 'Interação' && status === 'interação') return true;
      if (stageName === 'Visita Agendada' && status === 'visita agendada') return true;
      if (stageName === 'Visita Realizada' && status === 'visita realizada') return true;
      if (stageName === 'Negociação' && status === 'negociação') return true;
      if (stageName === 'Proposta Criada' && status === 'proposta criada') return true;
      if (stageName === 'Proposta Enviada' && status === 'proposta enviada') return true;
      if (stageName === 'Proposta Assinada' && status === 'proposta assinada') return true;
      
      return false;
    }).length;

    return {
      name: stageName,
      count,
      percentage: totalLeads > 0 ? (count / totalLeads) * 100 : 0
    };
  });

  return {
    stages: stagesData,
    totalLeads,
    leadType,
    isAdminView
  };
}

/**
 * Calcular métricas gerais de leads
 * @param leads Lista de leads
 * @param leadType Tipo de lead ou 'all' para todos
 * @param isAdminView Se é visão de admin
 */
export function calculateLeadsMetrics(
  leads: CRMLead[],
  leadType: LeadType | 'all',
  isAdminView: boolean
): LeadsMetrics {
  const totalLeads = leads.length;

  // Agrupar por status
  const leadsByStatus: Record<string, number> = {};
  leads.forEach(lead => {
    const status = lead.status || 'Sem Status';
    leadsByStatus[status] = (leadsByStatus[status] || 0) + 1;
  });

  // Agrupar por temperatura
  const leadsByTemperature: Record<string, number> = {
    'Frio': 0,
    'Morno': 0,
    'Quente': 0
  };
  leads.forEach(lead => {
    const temp = lead.temperature || 'Frio';
    leadsByTemperature[temp] = (leadsByTemperature[temp] || 0) + 1;
  });

  // Agrupar por tipo
  const leadsByType: Record<LeadType, number> = {
    1: leads.filter(l => l.lead_type === 1).length,
    2: leads.filter(l => l.lead_type === 2).length
  };

  // Taxa de conversão (leads finalizados / total)
  const finalizados = leads.filter(lead => {
    const status = lead.status?.toLowerCase() || '';
    return status.includes('assinada') || status.includes('fechamento') || status.includes('contrato');
  }).length;
  const conversionRate = totalLeads > 0 ? (finalizados / totalLeads) * 100 : 0;

  return {
    totalLeads,
    leadsByStatus,
    leadsByTemperature,
    leadsByType,
    conversionRate,
    leadType,
    isAdminView
  };
}

/**
 * Converter CRMLead para ProcessedLead (compatibilidade com componentes legados)
 * @param crmLead Lead do CRM
 * @param index Índice para gerar id_lead sequencial
 */
export function crmLeadToProcessedLead(crmLead: Partial<CRMLead>, index: number = 0): ProcessedLead {
  // Mapear status do CRM para etapa_atual do ProcessedLead
  const etapaAtual = crmLead.status || 'Novos Leads';
  
  // Mapear temperatura
  const statusTemperatura = (() => {
    switch (crmLead.temperature?.toLowerCase()) {
      case 'quente': return 'Quente';
      case 'morno': return 'Morno';
      default: return 'Frio';
    }
  })();

  // Mapear tipo de lead
  const tipoLead = crmLead.lead_type === 2 ? 'Proprietário' : 'Interessado';
  
  // Determinar tipo de negócio (inferir de property_type ou outros campos)
  const tipoNegocio = crmLead.property_type?.toLowerCase()?.includes('locação') 
    ? 'Locação' 
    : 'Venda';

  return {
    id_lead: index + 1,
    nome_lead: crmLead.name || 'Lead sem nome',
    telefone: crmLead.phone || undefined,
    origem_lead: crmLead.source || 'API',
    data_entrada: crmLead.created_at?.split('T')[0] || '',
    status_temperatura: statusTemperatura,
    etapa_atual: etapaAtual,
    codigo_imovel: crmLead.property_code || '',
    valor_imovel: crmLead.property_value || 0,
    tipo_negocio: tipoNegocio,
    tipo_lead: tipoLead,
    corretor_responsavel: crmLead.assigned_agent_name || 'Não atribuído',
    data_finalizacao: crmLead.closing_date || '',
    valor_final_venda: crmLead.final_sale_value || undefined,
    Data_visita: crmLead.visit_date?.split('T')[0] || '',
    Imovel_visitado: crmLead.visit_date ? 'Sim' : 'Não',
    observacoes: crmLead.comments || '',
    Preferencias_lead: '',
    Conversa: ''
  };
}

/**
 * Converter array de CRMLead para ProcessedLead[]
 * @param crmLeads Lista de leads do CRM
 */
export function crmLeadsToProcessedLeads(crmLeads: CRMLead[]): ProcessedLead[] {
  return crmLeads.map((lead, index) => crmLeadToProcessedLead(lead, index));
}

/**
 * Hook-ready: Buscar e processar leads para métricas
 * @param tenantId ID do tenant
 * @param userId ID do usuário logado
 * @param isAdmin Se o usuário é admin
 * @param leadType Tipo de lead (opcional)
 */
export async function getMetricsData(
  tenantId: string,
  userId: string,
  isAdmin: boolean,
  leadType: LeadType | null = null
): Promise<{
  leads: CRMLead[];
  processedLeads: ProcessedLead[];
  funnelMetrics: FunnelMetrics | null;
  generalMetrics: LeadsMetrics;
}> {
  // Admin vê todos, corretor vê só os próprios
  const agentId = isAdmin ? null : userId;
  
  const leads = await fetchLeadsForMetrics(tenantId, agentId, leadType);
  const processedLeads = crmLeadsToProcessedLeads(leads);
  
  // Se filtrou por tipo, calcular funil específico
  const funnelMetrics = leadType 
    ? calculateFunnelMetrics(leads, leadType, isAdmin)
    : null;
  
  const generalMetrics = calculateLeadsMetrics(leads, leadType || 'all', isAdmin);

  return {
    leads,
    processedLeads,
    funnelMetrics,
    generalMetrics
  };
}

/**
 * Buscar contagens por status para o Kanban (usadas no funil)
 * @param tenantId ID do tenant
 * @param agentId ID do corretor (null = admin)
 * @param leadType Tipo de lead
 */
export async function fetchFunnelCounts(
  tenantId: string,
  agentId: string | null,
  leadType: LeadType
): Promise<Record<string, number>> {
  const leads = await fetchLeadsForMetrics(tenantId, agentId, leadType);
  
  const counts: Record<string, number> = {};
  const stages = leadType === LEAD_TYPE_INTERESSADO 
    ? FUNNEL_STAGES_INTERESSADO 
    : FUNNEL_STAGES_PROPRIETARIO;

  // Inicializar com 0
  stages.forEach(stage => {
    counts[stage] = 0;
  });

  // Contar leads por status
  leads.forEach(lead => {
    const status = lead.status || 'Novos Leads';
    if (counts[status] !== undefined) {
      counts[status]++;
    } else {
      // Tentar match parcial
      const matchedStage = stages.find(s => 
        s.toLowerCase() === status.toLowerCase() ||
        status.toLowerCase().includes(s.toLowerCase().split(' ')[0])
      );
      if (matchedStage) {
        counts[matchedStage]++;
      }
    }
  });

  return counts;
}
