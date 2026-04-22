/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { getSupabaseConfig, getAuthenticatedHeaders, logSecureConnection } from '@/utils/encryption';
import { logLeadHistory } from './historyService';

/**
 * Atualiza o corretor responsável por um lead no Supabase
 * @returns Dados atualizados do lead
 */
export async function updateLeadCorretor(leadId: number, novoCorretor: string): Promise<any> {
  try {
    logSecureConnection();
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Tabela de leads no Supabase
    const leadTable = 'CRM_Octo-Dash';
    
    // Montar body da requisição
    const updateData = {
      corretor_responsavel: novoCorretor
    };
    
    // Fazer update no Supabase usando REST API
    const response = await fetch(`${config.url}/rest/v1/${leadTable}?id_lead=eq.${leadId}`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation' // Retornar o registro atualizado
      },
      body: JSON.stringify(updateData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao atualizar lead: ${response.status} - ${errorText}`);
    }
    
    const updatedData = await response.json();

    // Registrar no histórico
    await logLeadHistory(
      leadId,
      'mudanca_corretor',
      `Lead atribuído ao corretor ${novoCorretor}`,
      undefined,
      novoCorretor
    );
    
    // Retornar dados atualizados
    return updatedData.length > 0 ? updatedData[0] : true;
    
  } catch (error) {
    console.error(`❌ Erro ao atualizar corretor do lead ${leadId}:`, error);
    throw error;
  }
}

/**
 * Atualiza múltiplos campos de um lead no Supabase
 */
export async function updateLead(leadId: number, updates: Partial<Record<string, any>>): Promise<boolean> {
  try {
    logSecureConnection();
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const leadTable = 'CRM_Octo-Dash';
    
    const response = await fetch(`${config.url}/rest/v1/${leadTable}?id_lead=eq.${leadId}`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao atualizar lead: ${response.status} - ${errorText}`);
    }
    
    const updatedData = await response.json();

    // Identificar mudanças importantes para o histórico
    const promises = [];

    if (updates.etapa_atual) {
      promises.push(logLeadHistory(
        leadId, 
        'mudanca_etapa', 
        `Mudança de etapa para ${updates.etapa_atual}`,
        undefined,
        updates.etapa_atual
      ));
    }

    if (updates.corretor_responsavel) {
      promises.push(logLeadHistory(
        leadId, 
        'mudanca_corretor', 
        `Corretor alterado para ${updates.corretor_responsavel}`,
        undefined,
        updates.corretor_responsavel
      ));
    }

    if (updates.Data_visita) {
      promises.push(logLeadHistory(
        leadId, 
        'agendamento_visita', 
        `Visita agendada para ${new Date(updates.Data_visita).toLocaleDateString('pt-BR')}`,
        undefined,
        String(updates.Data_visita)
      ));
    }
    
    if (updates.data_finalizacao) {
      promises.push(logLeadHistory(
        leadId, 
        'finalizacao', 
        `Lead finalizado`,
        undefined,
        String(updates.data_finalizacao)
      ));
    }

    if (updates.Arquivamento === 'Sim') {
      promises.push(logLeadHistory(
        leadId, 
        'arquivamento', 
        `Lead arquivado${updates.motivo_arquivamento ? ': ' + updates.motivo_arquivamento : ''}`,
        undefined,
        'Arquivado'
      ));
    }

    await Promise.all(promises);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Erro ao atualizar lead ${leadId}:`, error);
    throw error;
  }
}
