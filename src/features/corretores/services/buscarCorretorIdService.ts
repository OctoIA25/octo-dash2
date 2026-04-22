/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para buscar ID do corretor pelo nome na tabela Corretores
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

/**
 * Buscar ID numérico do corretor pelo nome
 */
export async function buscarIdCorretorPorNome(
  nomeCoretor: string
): Promise<number | null> {
  try {
    if (!nomeCoretor || nomeCoretor.trim() === '') {
      console.warn('⚠️ Nome do corretor vazio');
      return null;
    }

    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Buscar na tabela Corretores pelo nome
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(nomeCoretor)}&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      console.error('❌ Erro ao buscar corretor:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.warn('⚠️ Corretor não encontrado:', nomeCoretor);
      return null;
    }
    
    const corretorId = data[0]?.id;
    
    return corretorId;
    
  } catch (error) {
    console.error('❌ Erro ao buscar ID do corretor:', error);
    return null;
  }
}

