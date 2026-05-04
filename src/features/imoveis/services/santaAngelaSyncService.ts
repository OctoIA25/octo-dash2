/**
 * 🔄 SERVIÇO DE SINCRONIZAÇÃO AUTOMÁTICA - SANTA ANGELA
 * Sincroniza leads do Santa Angela a cada 5 minutos
 * Evita duplicatas usando source_lead_id
 */

import { supabase } from '@/lib/supabaseClient';
import { fetchSantaAngelaLeads, SantaAngelaLead, SantaAngelaRequestBody } from './santaAngelaService.ts';

export interface SyncConfig {
  tenantId: string;
  intervalMinutes?: number; // Padrão: 5 minutos
  enabled?: boolean;
}

export interface SyncResult {
  success: boolean;
  totalFetched: number;
  newLeads: number;
  updatedLeads: number;
  errors: number;
  message: string;
}

let syncInterval: NodeJS.Timeout | null = null;
let isSyncing = false;

/**
 * Mapeia dados do Santa Angela para a tabela leads
 */
const mapSantaAngelaToLead = (
  santaAngelaLead: SantaAngelaLead,
  tenantId: string
): any => {
  // Determinar temperatura baseada no status
  const statusTitulo = santaAngelaLead.situacaocadastropessoa_titulo || '';
  let temperatura = 'Morno';
  if (statusTitulo.includes('EM ATENDIMENTO')) temperatura = 'Quente';
  else if (statusTitulo.includes('EM NEGOCIACAO')) temperatura = 'Quente';
  else if (statusTitulo.includes('FRI')) temperatura = 'Frio';

  return {
    tenant_id: tenantId,
    name: santaAngelaLead.nome || 'Lead Santa Angela',
    phone: santaAngelaLead.celular || santaAngelaLead.telefone || null,
    email: santaAngelaLead.email || null,
    source: 'Santa Angela',
    source_lead_id: santaAngelaLead.id, // ID único do Santa Angela
    status: 'Novos Leads',
    property_id: null,
    property_code: santaAngelaLead.cpfcnpj || null,
    property_type: santaAngelaLead.tipo || null,
    assigned_agent_id: null,
    assigned_agent_name: santaAngelaLead.corretor_nome || null,
    tags: ['Santa Angela', santaAngelaLead.midia_titulo || 'Outros'],
    custom_fields: {
      santa_angela_cpfcnpj: santaAngelaLead.cpfcnpj,
      santa_angela_tipopessoa: santaAngelaLead.tipopessoa,
      santa_angela_conjuge_nome: santaAngelaLead.conjuge_nome,
      santa_angela_imobiliaria_nome: santaAngelaLead.imobiliaria_nome,
      santa_angela_corretor_nome: santaAngelaLead.corretor_nome,
      santa_angela_usuario_cadastrador: santaAngelaLead.usuario_cadastrador,
      santa_angela_situacao: santaAngelaLead.situacaocadastropessoa_titulo,
      santa_angela_midia_titulo: santaAngelaLead.midia_titulo,
      santa_angela_midia_sigla: santaAngelaLead.midia_sigla,
      santa_angela_rd_uuid: santaAngelaLead.rd_uuid,
      santa_angela_temperatura: temperatura,
    },
    visit_date: null,
    closing_date: null,
    final_sale_value: null,
    created_at: santaAngelaLead.datahoracadastro || new Date().toISOString(),
    updated_at: santaAngelaLead.data_ultima_interacao || new Date().toISOString(),
    lead_type: 1, // 1 = Interessado
    participa_bolsao: false,
    assigned_at: new Date().toISOString(),
  };
};

/**
 * Verifica quais leads já existem no banco
 */
const getExistingSantaAngelaIds = async (tenantId: string): Promise<Set<string>> => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('source_lead_id')
      .eq('tenant_id', tenantId)
      .eq('source', 'Santa Angela');

    if (error) {
      console.error('❌ Erro ao buscar IDs existentes:', error);
      return new Set();
    }

    const existingIds = new Set(data?.map(lead => lead.source_lead_id) || []);
    
    return existingIds;
  } catch (error) {
    console.error('❌ Erro ao buscar IDs existentes:', error);
    return new Set();
  }
};

/**
 * Insere novos leads no banco
 */
const insertNewLeads = async (
  leadsToInsert: any[],
  tenantId: string
): Promise<number> => {
  if (leadsToInsert.length === 0) return 0;

  try {
    const { data, error } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select();

    if (error) {
      console.error('❌ Erro ao inserir leads:', JSON.stringify(error, null, 2));
      console.error('❌ Detalhes do erro:', error.message, error.code, error.hint);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error('❌ Erro ao inserir leads (catch):', error);
    return 0;
  }
};

/**
 * Atualiza leads existentes
 */
const updateExistingLeads = async (
  leadsToUpdate: any[],
  tenantId: string
): Promise<number> => {
  if (leadsToUpdate.length === 0) return 0;

  let updatedCount = 0;

  for (const lead of leadsToUpdate) {
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          updated_at: new Date().toISOString(),
          custom_fields: lead.custom_fields,
          assigned_at: lead.assigned_at,
        })
        .eq('source_lead_id', lead.source_lead_id)
        .eq('tenant_id', tenantId);

      if (!error) {
        updatedCount++;
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar lead:', error);
    }
  }

  return updatedCount;
};

/**
 * Executa uma sincronização única
 */
export const syncSantaAngelaLeads = async (
  config: SyncConfig
): Promise<SyncResult> => {
  if (isSyncing) {
    return {
      success: false,
      totalFetched: 0,
      newLeads: 0,
      updatedLeads: 0,
      errors: 0,
      message: 'Sincronização já em andamento',
    };
  }

  isSyncing = true;

  const result: SyncResult = {
    success: false,
    totalFetched: 0,
    newLeads: 0,
    updatedLeads: 0,
    errors: 0,
    message: '',
  };

  try {
    // 1. Buscar leads do Santa Angela
    const santaAngelaLeads = await fetchSantaAngelaLeads(config.tenantId);
    result.totalFetched = santaAngelaLeads.length;

    if (santaAngelaLeads.length === 0) {
      result.message = 'Nenhum lead encontrado na API';
      result.success = true;
      return result;
    }

    // 2. Buscar IDs já existentes no banco
    const existingIds = await getExistingSantaAngelaIds(config.tenantId);

    // 3. Separar novos leads de existentes
    const leadsToInsert: any[] = [];
    const leadsToUpdate: any[] = [];

    for (const saLead of santaAngelaLeads) {
      const mappedLead = mapSantaAngelaToLead(saLead, config.tenantId);
      
      if (existingIds.has(saLead.id)) {
        leadsToUpdate.push(mappedLead);
      } else {
        leadsToInsert.push(mappedLead);
      }
    }

    // 4. Inserir novos leads
    if (leadsToInsert.length > 0) {
      result.newLeads = await insertNewLeads(leadsToInsert, config.tenantId);
    }

    // 5. Atualizar leads existentes
    if (leadsToUpdate.length > 0) {
      result.updatedLeads = await updateExistingLeads(leadsToUpdate, config.tenantId);
    }

    result.success = true;
    result.message = `Sincronização concluída: ${result.newLeads} novos, ${result.updatedLeads} atualizados`;

  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    result.errors = 1;
    result.message = `Erro na sincronização: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    isSyncing = false;
  }

  return result;
};

/**
 * Inicia a sincronização automática
 */
export const startAutoSync = (config: SyncConfig): void => {
  if (syncInterval) {
    console.log('⚠️ Sincronização automática já está ativa');
    return;
  }

  if (!config.enabled) {
    console.log('⚠️ Sincronização automática desabilitada');
    return;
  }

  const intervalMs = (config.intervalMinutes || 5) * 60 * 1000;


  // Executar primeira sincronização imediatamente
  syncSantaAngelaLeads(config);

  // Configurar intervalo
  syncInterval = setInterval(() => {
    syncSantaAngelaLeads(config);
  }, intervalMs);
};

/**
 * Para a sincronização automática
 */
export const stopAutoSync = (): void => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
};

/**
 * Verifica se a sincronização está ativa
 */
export const isAutoSyncActive = (): boolean => {
  return syncInterval !== null;
};
