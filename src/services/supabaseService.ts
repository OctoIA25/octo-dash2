/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

// Serviço para integração exclusiva com Supabase PostgreSQL
// Fonte única de dados do CRM Imobiliário
// SEGURO: API Keys criptografadas para proteção no frontend

import { ProcessedLead } from '@/data/realLeadsProcessor';
import { normalizeDate } from '@/utils/dateUtils';
import { normalizeCodigoImovel } from '@/utils/codigoImovelUtils';
import { supabase } from '@/lib/supabaseClient';

const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';
let warnedSupabaseRemoved = false;

const PAGE_SIZE = 1000;

const KENLO_STAGE_TO_ETAPA: Record<string, string> = {
  new: 'Novos Leads',
  contacted: 'Interação',
  qualified: 'Visita Agendada',
  visit_done: 'Visita Realizada',
  negotiation: 'Negociação',
  proposal: 'Proposta Enviada',
  closed_won: 'Proposta Assinada',
  closed_lost: 'Perdido',
};

const CRM_STATUS_TO_ETAPA: Record<string, string> = {
  'Novos Leads': 'Novos Leads',
  'Em Atendimento': 'Em Atendimento',
  'Interação': 'Interação',
  'Visita Agendada': 'Visita Agendada',
  'Visita Realizada': 'Visita Realizada',
  'Negociação': 'Negociação',
  'Proposta Criada': 'Proposta Criada',
  'Proposta Enviada': 'Proposta Enviada',
  'Proposta Assinada': 'Proposta Assinada',
};

const KENLO_TEMP_TO_PT: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
};

const getImpersonationTenant = (): string | null => {
  try {
    const raw = localStorage.getItem('owner-impersonation');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tenantId?: string };
    return parsed?.tenantId ?? null;
  } catch {
    return null;
  }
};

const resolveTenantId = async (): Promise<string | null> => {
  const impersonated = getImpersonationTenant();
  if (impersonated) return impersonated;

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;

  const { data: membership, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error || !membership) return null;
  return (membership as { tenant_id: string }).tenant_id ?? null;
};

interface KenloLeadRow {
  id: string;
  external_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  lead_timestamp: string | null;
  created_at: string | null;
  portal: string | null;
  message: string | null;
  interest_reference: string | null;
  interest_type: string | null;
  interest_is_sale: boolean | null;
  interest_is_rent: boolean | null;
  attended_by_name: string | null;
  stage: string | null;
  temperature: string | null;
  is_exclusive: boolean | null;
  archived_at: string | null;
  archive_reason: string | null;
}

interface CRMLeadRow {
  id: string;
  source_lead_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string | null;
  temperature: string | null;
  property_code: string | null;
  property_value: number | null;
  property_type: string | null;
  assigned_agent_name: string | null;
  comments: string | null;
  visit_date: string | null;
  closing_date: string | null;
  final_sale_value: number | null;
  archived_at: string | null;
  archive_reason: string | null;
  created_at: string | null;
}

async function fetchKenloLeadsPaginated(tenantId: string): Promise<KenloLeadRow[]> {
  const rows: KenloLeadRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kenlo_leads')
      .select(
        'id,external_id,client_name,client_phone,client_email,lead_timestamp,created_at,portal,message,interest_reference,interest_type,interest_is_sale,interest_is_rent,attended_by_name,stage,temperature,is_exclusive,archived_at,archive_reason'
      )
      .eq('tenant_id', tenantId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as KenloLeadRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchCRMLeads(tenantId: string): Promise<CRMLeadRow[]> {
  const { data, error } = await supabase
    .from('leads')
    .select(
      'id,source_lead_id,name,phone,email,source,status,temperature,property_code,property_value,property_type,assigned_agent_name,comments,visit_date,closing_date,final_sale_value,archived_at,archive_reason,created_at'
    )
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  return (data ?? []) as CRMLeadRow[];
}

function mapKenloToProcessed(row: KenloLeadRow, id: number, override?: CRMLeadRow): ProcessedLead {
  const stageKey = (override?.status && CRM_STATUS_TO_ETAPA[override.status]) ||
    (row.stage ? KENLO_STAGE_TO_ETAPA[row.stage] : undefined) ||
    'Novos Leads';

  const temperature =
    override?.temperature ??
    (row.temperature ? KENLO_TEMP_TO_PT[row.temperature] ?? row.temperature : 'Frio');

  const tipoNegocio = row.interest_is_sale
    ? 'Venda'
    : row.interest_is_rent
      ? 'Locação'
      : row.interest_type ?? 'Venda';

  return {
    id_lead: id,
    nome_lead: override?.name ?? row.client_name ?? 'Sem nome',
    telefone: override?.phone ?? row.client_phone ?? undefined,
    origem_lead: override?.source ?? row.portal ?? 'Kenlo',
    data_entrada: normalizeDate(row.lead_timestamp ?? row.created_at ?? ''),
    status_temperatura: temperature,
    etapa_atual: stageKey,
    codigo_imovel: normalizeCodigoImovel(override?.property_code ?? row.interest_reference ?? '') ?? '',
    valor_imovel: override?.property_value ?? 0,
    tipo_negocio: tipoNegocio,
    corretor_responsavel: override?.assigned_agent_name ?? row.attended_by_name ?? 'Não atribuído',
    data_finalizacao: override?.closing_date ?? '',
    valor_final_venda: override?.final_sale_value ?? undefined,
    Data_visita: override?.visit_date ?? '',
    Arquivamento: row.archived_at || override?.archived_at ? 'Arquivado' : undefined,
    motivo_arquivamento: row.archive_reason ?? override?.archive_reason ?? undefined,
    observacoes: override?.comments ?? row.message ?? '',
    Preferencias_lead: '',
    Imovel_visitado: '',
    Conversa: row.message ?? '',
  };
}

function mapCRMToProcessed(row: CRMLeadRow, id: number): ProcessedLead {
  const stageKey = (row.status && CRM_STATUS_TO_ETAPA[row.status]) || row.status || 'Novos Leads';
  return {
    id_lead: id,
    nome_lead: row.name ?? 'Sem nome',
    telefone: row.phone ?? undefined,
    origem_lead: row.source ?? 'CRM',
    data_entrada: normalizeDate(row.created_at ?? ''),
    status_temperatura: row.temperature ?? 'Frio',
    etapa_atual: stageKey,
    codigo_imovel: normalizeCodigoImovel(row.property_code ?? '') ?? '',
    valor_imovel: row.property_value ?? 0,
    tipo_negocio: row.property_type ?? 'Venda',
    corretor_responsavel: row.assigned_agent_name ?? 'Não atribuído',
    data_finalizacao: row.closing_date ?? '',
    valor_final_venda: row.final_sale_value ?? undefined,
    Data_visita: row.visit_date ?? '',
    Arquivamento: row.archived_at ? 'Arquivado' : undefined,
    motivo_arquivamento: row.archive_reason ?? undefined,
    observacoes: row.comments ?? '',
    Preferencias_lead: '',
    Imovel_visitado: '',
    Conversa: '',
  };
}

/**
 * Interface para resposta das tabelas do Supabase
 */
interface SupabaseTable {
  table_name: string;
  table_schema: string;
}

/**
 * Lista todas as tabelas disponíveis no Supabase
 */
export async function listSupabaseTables(): Promise<SupabaseTable[]> {
  try {
    console.warn('⚠️ listSupabaseTables: Supabase removido. Retornando lista vazia.');
    return [];
  } catch (error) {
    console.error('❌ Erro ao listar tabelas do Supabase:', error);
    return [];
  }
}

/**
 * Busca dados de uma tabela específica do Supabase
 */
export async function fetchSupabaseTable(tableName: string): Promise<any[]> {
  try {
    console.warn(`⚠️ fetchSupabaseTable: Supabase removido. Tabela '${tableName}' retornará vazia.`);
    return [];
  } catch (error) {
    console.error(`❌ Erro ao buscar dados da tabela ${tableName}:`, error);
    return [];
  }
}

/**
 * Interface para dados de equipes do Supabase
 */
export interface SupabaseTeam {
  id?: number;
  nome_equipe: string;
  corretores: string[];
  dias_acesso?: number[];
  ativa?: boolean;
}

/**
 * Busca dados de equipes do Supabase
 */
export async function fetchSupabaseTeamsData(): Promise<SupabaseTeam[]> {
  try {
    console.warn('⚠️ fetchSupabaseTeamsData: Supabase removido. Retornando lista vazia.');
    return [];
  } catch (error) {
    console.error('❌ Erro ao buscar dados de equipes do Supabase:', error);
    return [];
  }
}

/**
 * Processa dados brutos de equipes do Supabase
 */
function processSupabaseTeamsData(data: any[]): SupabaseTeam[] {
  
  if (!data || data.length === 0) {
    console.warn('⚠️ Nenhum dado de equipe para processar');
    return getDefaultTeamsData();
  }
  
  return data.map((row, index) => {
    // Mapear campos flexíveis da tabela de equipes
    const equipe: SupabaseTeam = {
      id: row.id || row.ID || (index + 1),
      nome_equipe: row.nome_equipe || row.nome || row.name || row.equipe || `Equipe ${index + 1}`,
      corretores: parseCorretores(row.corretores || row.corretor || row.members || row.integrantes || ''),
      dias_acesso: parseDiasAcesso(row.dias_acesso || row.dias || row.access_days || ''),
      ativa: row.ativa !== false && row.active !== false && row.status !== 'inativa'
    };
    
    return equipe;
  });
}

/**
 * Parse dos corretores (pode vir como string separada por vírgula ou array)
 */
function parseCorretores(corretoresData: any): string[] {
  if (Array.isArray(corretoresData)) {
    return corretoresData.filter(c => c && c.trim() !== '');
  }
  
  if (typeof corretoresData === 'string') {
    return corretoresData
      .split(',')
      .map(c => c.trim())
      .filter(c => c !== '');
  }
  
  return [];
}

/**
 * Parse dos dias de acesso (pode vir como string ou array)
 */
function parseDiasAcesso(diasData: any): number[] {
  if (Array.isArray(diasData)) {
    return diasData.filter(d => typeof d === 'number' && d >= 0 && d <= 6);
  }
  
  if (typeof diasData === 'string') {
    return diasData
      .split(',')
      .map(d => parseInt(d.trim()))
      .filter(d => !isNaN(d) && d >= 0 && d <= 6);
  }
  
  return [];
}

/**
 * Dados padrão de equipes quando não há tabela no Supabase
 */
function getDefaultTeamsData(): SupabaseTeam[] {
  return [
    {
      id: 1,
      nome_equipe: 'Equipe A',
      corretores: ['Ana Costa', 'João Santos'],
      dias_acesso: [1, 4, 0], // Segunda, quinta, domingo
      ativa: true
    },
    {
      id: 2,
      nome_equipe: 'Equipe B',
      corretores: ['Pedro Lima', 'Maria Silva'],
      dias_acesso: [2, 5], // Terça, sexta
      ativa: true
    },
    {
      id: 3,
      nome_equipe: 'Equipe C',
      corretores: ['Carlos Oliveira'],
      dias_acesso: [3, 6], // Quarta, sábado
      ativa: true
    }
  ];
}

/**
 * Busca TODOS os dados completos do banco Supabase
 * Esta função faz um "get all" completo de todas as tabelas principais
 */
export async function fetchAllSupabaseData(): Promise<{
  leads: ProcessedLead[];
  teams: SupabaseTeam[];
  tables: string[];
  totalRecords: number;
  timestamp: Date;
}> {
  try {
    const leads = await fetchSupabaseLeadsData();
    const teams: SupabaseTeam[] = [];
    return {
      leads,
      teams,
      tables: ['kenlo_leads', 'leads'],
      totalRecords: leads.length,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('❌ Erro crítico no GET ALL do Supabase:', error);

    return {
      leads: [],
      teams: [],
      tables: [],
      totalRecords: 0,
      timestamp: new Date()
    };
  }
}

/**
 * Busca dados de leads do Supabase (assumindo que existe uma tabela de leads)
 */
export async function fetchSupabaseLeadsData(): Promise<ProcessedLead[]> {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      if (DEBUG_LOGS && !warnedSupabaseRemoved) {
        console.warn('⚠️ fetchSupabaseLeadsData: tenant não resolvido. Retornando lista vazia.');
        warnedSupabaseRemoved = true;
      }
      return [];
    }

    const [kenloRows, crmRows] = await Promise.all([
      fetchKenloLeadsPaginated(tenantId),
      fetchCRMLeads(tenantId),
    ]);

    const overridesByExternal = new Map<string, CRMLeadRow>();
    const unmatchedCRM: CRMLeadRow[] = [];
    for (const crm of crmRows) {
      if (crm.source_lead_id) {
        overridesByExternal.set(crm.source_lead_id, crm);
      } else {
        unmatchedCRM.push(crm);
      }
    }

    let idSeq = 1;
    const merged: ProcessedLead[] = [];

    for (const row of kenloRows) {
      const override = row.external_id ? overridesByExternal.get(row.external_id) : undefined;
      merged.push(mapKenloToProcessed(row, idSeq++, override));
    }

    for (const crm of unmatchedCRM) {
      merged.push(mapCRMToProcessed(crm, idSeq++));
    }

    if (DEBUG_LOGS) {
    }

    return merged;
  } catch (error) {
    console.error('❌ Erro ao buscar dados do Supabase:', error);
    return [];
  }
}

/**
 * Processa dados brutos do Supabase para o formato da aplicação
 */
function processSupabaseData(data: any[], tableName: string): ProcessedLead[] {
  
  if (!data || data.length === 0) {
    return [];
  }
  
  const processedLeads: ProcessedLead[] = [];
  
  // Log dos campos disponíveis no primeiro registro para debug
  if (data.length > 0) {
  }
  
  data.forEach((row, index) => {
    // PROCESSAR TODOS OS REGISTROS - incluir até mesmo sem nome_lead para contagem total
    // Só pular se for realmente um registro completamente vazio
    if (!row || (typeof row === 'object' && Object.keys(row).length === 0)) {
      return;
    }
    
    // Processar data de entrada usando função utilitária
    const dataEntrada = normalizeDate(row.data_entrada);
    
    // Processar valor do imóvel de forma robusta
    let valorImovel = 0;
    if (row.valor_imovel && row.valor_imovel !== null && row.valor_imovel !== 'null' && row.valor_imovel !== '') {
      if (typeof row.valor_imovel === 'number') {
        valorImovel = row.valor_imovel;
      } else {
        // Remover caracteres não numéricos e converter
        const cleanValue = String(row.valor_imovel).replace(/[^\d.,]/g, '').replace(',', '.');
        valorImovel = parseFloat(cleanValue) || 0;
      }
    }
    
    // Processar valor final da venda de forma robusta
    let valorFinalVenda = undefined;
    if (row.valor_final_venda && row.valor_final_venda !== null && row.valor_final_venda !== 'null' && row.valor_final_venda !== '') {
      if (typeof row.valor_final_venda === 'number') {
        valorFinalVenda = row.valor_final_venda;
      } else {
        // Remover caracteres não numéricos e converter
        const cleanValue = String(row.valor_final_venda).replace(/[^\d.,]/g, '').replace(',', '.');
        valorFinalVenda = cleanValue ? parseFloat(cleanValue) : undefined;
      }
    }
    
    // Função helper para tratar valores vazios/nulos
    const safeString = (value: any, fallback: string = ''): string => {
      if (value === null || value === undefined || value === 'null' || value === 'NULL') {
        return fallback;
      }
      return String(value).trim();
    };

    // Processar conversa de forma robusta - garantir que TODAS as conversas sejam capturadas
    let conversa: string | undefined = undefined;
    if (row.Conversa !== null && row.Conversa !== undefined && row.Conversa !== 'null' && row.Conversa !== 'NULL') {
      const rawConversa = String(row.Conversa).trim();
      if (rawConversa !== '' && rawConversa !== 'undefined') {
        conversa = rawConversa;
      }
    }
    
    // 🏠 Processar código do imóvel com extração inteligente
    // Aceita formatos: CA0123, AP0123, CS1234, etc.
    // Também extrai da conversa se não estiver no campo direto
    const codigoImovel = normalizeCodigoImovel(row.codigo_imovel, conversa);

    // Mapear campos exatos da tabela CRM_Octo-Dash com tratamento robusto de dados
    const lead: ProcessedLead = {
      id_lead: row.id_lead || (index + 1),
      nome_lead: safeString(row.nome_lead, 'Lead sem nome'),
      telefone: safeString(row.telefone) || undefined,
      origem_lead: safeString(row.origem_lead, 'Orgânico'),
      data_entrada: dataEntrada,
      status_temperatura: safeString(row.status_temperatura, 'Frio'),
      etapa_atual: safeString(row.etapa_atual, 'Em Atendimento'),
      codigo_imovel: codigoImovel,
      valor_imovel: valorImovel,
      tipo_negocio: safeString(row.tipo_negocio, 'Venda'),
      tipo_lead: safeString(row.tipo_lead) || safeString(row.tipo_cliente) || safeString(row.perfil_lead) || undefined, // Buscar campo de tipo de lead
      corretor_responsavel: safeString(row.corretor_responsavel, 'Não atribuído'),
      data_finalizacao: safeString(row.data_finalizacao) ? normalizeDate(safeString(row.data_finalizacao)) : undefined,
      valor_final_venda: valorFinalVenda,
      Data_visita: safeString(row.Data_visita) ? normalizeDate(safeString(row.Data_visita)) : undefined,
      link_imovel: safeString(row.link_imovel) || undefined,
      Arquivamento: safeString(row.Arquivamento) || undefined,
      motivo_arquivamento: safeString(row.motivo_arquivamento) || undefined,
      observacoes: safeString(row.observacoes) || undefined,
      Preferencias_lead: safeString(row.Preferencias_lead) || undefined,
      Imovel_visitado: safeString(row.Imovel_visitado, 'Não'),
      Conversa: conversa
    };
    
    processedLeads.push(lead);
    
    // Log detalhado apenas dos primeiros 3 leads para debug
    if (processedLeads.length <= 3) {
    }
  });
  
  // Estatísticas do processamento
  const comCodigo = processedLeads.filter(l => l.codigo_imovel).length;
  const comConversa = processedLeads.filter(l => l.Conversa).length;
  
  
  return processedLeads;
}

/**
 * Função de fallback com dados de exemplo enriquecidos
 * Baseado nos 36 corretores reais do Supabase
 */
export function getSupabaseFallbackData(): ProcessedLead[] {
  console.warn('⚠️ getSupabaseFallbackData: Supabase removido. Nenhum dado de fallback será gerado.');
  return [];
}
