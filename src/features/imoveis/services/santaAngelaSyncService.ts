/**
 * 🔄 SERVIÇO DE SINCRONIZAÇÃO AUTOMÁTICA - SANTA ANGELA
 * Sincroniza leads do Santa Angela a cada 5 minutos
 * Evita duplicatas usando source_lead_id
 */

import { supabase } from '@/lib/supabaseClient';
import {
  SantaAngelaLead,
  SantaAngelaConfig,
  fetchSantaAngelaLeads,
  fetchAllSantaAngelaLeads,
  testSantaAngelaConnection
} from './santaAngelaService';

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
  // Mapear situação para status permitidos pela constraint
  const statusTitulo = santaAngelaLead.situacaocadastropessoa_titulo || '';
  let status = 'Novos Leads'; // Status padrão permitido

  // Mapear para valores que provavelmente existem na constraint
  if (statusTitulo.includes('NOVO') || statusTitulo == null) status = 'Novos Leads';
  else if (statusTitulo.includes('EM ATENDIMENTO')) status = 'Interação';
  else if (statusTitulo.includes('VISITA')) status = 'Visita Agendada';
  else if (statusTitulo.includes('EM NEGOCIACAO')) status = 'Negociação';
  else if (statusTitulo.includes('PROPOSTA')) {
    if (statusTitulo.includes('CRIADA')) status = 'Visita Realizada';
    else if (statusTitulo.includes('ENVIADA')) status = 'Proposta Enviada';
    else if (statusTitulo.includes('ASSINADA')) status = 'Proposta Assinada';
    else status = 'Proposta'; // Default para Proposta
  }
  else if (statusTitulo.includes('VENDA')) status = 'Proposta Assinada';
  else if (statusTitulo.includes('SEM CONTATO')) status = 'Novos Leads';
  else status = 'Novos Leads'; // Default para situações não mapeadas

  return {
    tenant_id: tenantId,
    name: santaAngelaLead.nome || 'Lead Santa Angela',
    phone: santaAngelaLead.celular || santaAngelaLead.telefone || null,
    email: santaAngelaLead.email || null,
    source: 'Santa Angela',
    source_lead_id: santaAngelaLead.id, // ID único do Santa Angela
    status: status,
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
      santa_angela_temperatura: status,
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
 * Verifica quais leads já existem no banco (por telefone e source_lead_id)
 */
const getExistingLeadsInfo = async (tenantId: string): Promise<{
  phoneSet: Set<string>;
  sourceIdSet: Set<string>;
}> => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('phone, source_lead_id')
      .eq('tenant_id', tenantId)
      .eq('source', 'Santa Angela');

    if (error) {
      console.error('❌ Erro ao buscar leads existentes:', error);
      return { phoneSet: new Set(), sourceIdSet: new Set() };
    }

    const phoneSet = new Set(data?.map(lead => lead.phone).filter(phone => phone) || []);
    const sourceIdSet = new Set(data?.map(lead => lead.source_lead_id) || []);

    return { phoneSet, sourceIdSet };
  } catch (error) {
    console.error('❌ Erro ao buscar leads existentes:', error);
    return { phoneSet: new Set(), sourceIdSet: new Set() };
  }
};

/**
 * Insere novos leads no banco (INSERT simples)
 */
const insertNewLeads = async (
  leadsToInsert: any[],
  tenantId: string
): Promise<number> => {
  if (leadsToInsert.length === 0) return 0;

  let insertedCount = 0;

  for (const lead of leadsToInsert) {
    try {
      // INSERT simples (já verificamos duplicatas antes)
      const { error } = await supabase
        .from('leads')
        .insert(lead);

      if (!error) {
        insertedCount++;
        console.log(`✅ Lead inserido: ${lead.name}`);
      } else {
        // Se falhar por telefone, tentar inserir sem telefone
        if (error.message.includes('unique_phone_per_tenant')) {
          console.log(`⚠️ Telefone duplicado, tentando sem telefone: ${lead.name}`);
          const leadWithoutPhone = { ...lead, phone: null };
          const { error: error2 } = await supabase
            .from('leads')
            .insert(leadWithoutPhone);

          if (!error2) {
            insertedCount++;
            console.log(`✅ Lead inserido sem telefone: ${lead.name}`);
          } else {
            console.error('❌ Erro ao inserir lead mesmo sem telefone:', error2);
          }
        } else {
          console.error('❌ Erro ao inserir lead:', error);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao inserir lead:', error);
    }
  }

  return insertedCount;
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
    // 1. Buscar TODOS os leads do Santa Angela
    const santaAngelaLeads = await fetchAllSantaAngelaLeads(config.tenantId);
    result.totalFetched = santaAngelaLeads.length;

    if (santaAngelaLeads.length === 0) {
      result.message = 'Nenhum lead encontrado na API';
      result.success = true;
      return result;
    }

    // 2. Buscar leads já existentes no banco (telefone e source_id)
    const { phoneSet, sourceIdSet } = await getExistingLeadsInfo(config.tenantId);

    // 3. Separar novos leads de existentes
    const leadsToInsert: any[] = [];
    const leadsToUpdate: any[] = [];
    const skippedLeads: any[] = [];

    for (const saLead of santaAngelaLeads) {
      const mappedLead = mapSantaAngelaToLead(saLead, config.tenantId);
      const phone = mappedLead.phone;

      // Verificar duplicatas por telefone e por source_id
      const hasDuplicatePhone = phone && phoneSet.has(phone);
      const hasDuplicateSourceId = sourceIdSet.has(saLead.id);

      if (hasDuplicateSourceId) {
        // Se existe por source_id, atualizar
        leadsToUpdate.push(mappedLead);
      } else if (hasDuplicatePhone) {
        // Se existe por telefone mas não por source_id, pular para evitar constraint
        skippedLeads.push(mappedLead);
      } else {
        // Lead novo, pode inserir
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
