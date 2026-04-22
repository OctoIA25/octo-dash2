import { getSupabaseConfig, getAuthenticatedHeaders, logSecureConnection } from '@/utils/encryption';

export interface HistoryLog {
  id: string;
  lead_id: number;
  action_type: string;
  description: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  created_by?: string;
}

/**
 * Registra um evento no histórico do lead
 */
export async function logLeadHistory(
  leadId: number, 
  actionType: string, 
  description: string, 
  oldValue?: string, 
  newValue?: string,
  createdBy: string = 'Sistema'
): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const logData = {
      lead_id: leadId,
      action_type: actionType,
      description: description,
      old_value: oldValue,
      new_value: newValue,
      created_by: createdBy
    };
    
    const response = await fetch(`${config.url}/rest/v1/lead_history_logs`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(logData)
    });
    
    if (!response.ok) {
      console.error('Erro ao registrar histórico:', await response.text());
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao registrar histórico:', error);
    return false;
  }
}

/**
 * Busca o histórico de um lead
 */
export async function fetchLeadHistory(leadId: number): Promise<HistoryLog[]> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const response = await fetch(`${config.url}/rest/v1/lead_history_logs?lead_id=eq.${leadId}&order=created_at.desc`, {
      method: 'GET',
      headers: headers
    });
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar histórico: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    return [];
  }
}
