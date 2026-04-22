/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para buscar e visualizar resultados ENEAGRAMA dos corretores
 * Integrado com a agente ELAINE
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';

export interface EneagramaCorretorProfile {
  corretor_id: number;
  corretor_nome: string;
  corretor_email?: string;
  tipo_principal: number; // 1-9
  nome_tipo: string;
  emoji_tipo: string;
  cor_tipo: string;
  scores: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
    6: number;
    7: number;
    8: number;
    9: number;
  };
  data_teste: string;
  historico_testes: number;
}

/**
 * Buscar todos os corretores que fizeram o teste de ENEAGRAMA
 */
export async function buscarCorretoresComEneagrama(): Promise<EneagramaCorretorProfile[]> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Estratégia 1: Buscar com filtro not.is.null
    let url = `${config.url}/rest/v1/Corretores?select=id,nm_corretor,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9,eneagrama_data_teste&eneagrama_tipo_principal=not.is.null&order=eneagrama_data_teste.desc`;
    
    
    let response = await fetch(url, {
      method: 'GET',
      headers: headers
    });
    
    
    let data: any[] = [];
    
    if (response.ok) {
      data = await response.json();
    } else {
      console.warn('⚠️ Tentativa 1 falhou, tentando estratégia alternativa...');
      
      // Estratégia 2: Buscar todos e filtrar no cliente
      url = `${config.url}/rest/v1/Corretores?select=id,nm_corretor,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9,eneagrama_data_teste&order=id.desc&limit=1000`;
      
      
      response = await fetch(url, {
        method: 'GET',
        headers: headers
      });
      
      if (response.ok) {
        const allData = await response.json();
        
        // Filtrar no cliente: apenas quem tem eneagrama_tipo_principal preenchido
        data = (allData || []).filter((c: any) => 
          c.eneagrama_tipo_principal !== null && 
          c.eneagrama_tipo_principal !== undefined &&
          typeof c.eneagrama_tipo_principal === 'number'
        );
        
        
        // Ordenar por data do teste (mais recente primeiro)
        data.sort((a: any, b: any) => {
          const dateA = a.eneagrama_data_teste ? new Date(a.eneagrama_data_teste).getTime() : 0;
          const dateB = b.eneagrama_data_teste ? new Date(b.eneagrama_data_teste).getTime() : 0;
          return dateB - dateA;
        });
      } else {
        const errorText = await response.text();
        console.error('❌ Erro na resposta (Tentativa 2):', errorText);
        throw new Error(`Erro ao buscar corretores: ${response.status} - ${errorText}`);
      }
    }
    
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Mapear para o formato do perfil
    const perfis: EneagramaCorretorProfile[] = data
      .filter((corretor: any) => {
        // Validar que o corretor tem tipo principal válido
        const tipoValido = corretor.eneagrama_tipo_principal !== null && 
                          corretor.eneagrama_tipo_principal !== undefined &&
                          typeof corretor.eneagrama_tipo_principal === 'number' &&
                          corretor.eneagrama_tipo_principal >= 1 &&
                          corretor.eneagrama_tipo_principal <= 9;
        
        if (!tipoValido) {
          console.warn(`⚠️ Corretor ${corretor.id} (${corretor.nm_corretor}) tem tipo inválido:`, corretor.eneagrama_tipo_principal);
        }
        
        return tipoValido;
      })
      .map((corretor: any) => {
        const tipo = ENEAGRAMA_TIPOS[corretor.eneagrama_tipo_principal];
        return {
          corretor_id: corretor.id,
          corretor_nome: corretor.nm_corretor || 'Corretor sem nome',
          corretor_email: undefined,
          tipo_principal: corretor.eneagrama_tipo_principal,
          nome_tipo: tipo?.nome || `Tipo ${corretor.eneagrama_tipo_principal}`,
          emoji_tipo: tipo?.emoji || '❓',
          cor_tipo: tipo?.cor || '#cccccc',
          scores: {
            1: corretor.eneagrama_score_tipo_1 ?? 0,
            2: corretor.eneagrama_score_tipo_2 ?? 0,
            3: corretor.eneagrama_score_tipo_3 ?? 0,
            4: corretor.eneagrama_score_tipo_4 ?? 0,
            5: corretor.eneagrama_score_tipo_5 ?? 0,
            6: corretor.eneagrama_score_tipo_6 ?? 0,
            7: corretor.eneagrama_score_tipo_7 ?? 0,
            8: corretor.eneagrama_score_tipo_8 ?? 0,
            9: corretor.eneagrama_score_tipo_9 ?? 0
          },
          data_teste: corretor.eneagrama_data_teste || new Date().toISOString(),
          historico_testes: 1 // Por enquanto, assumimos 1 teste
        };
      });
    
    
    if (perfis.length > 0) {
      perfis.forEach((p, i) => {
      });
    }
    
    return perfis;
    
  } catch (error) {
    console.error('❌ Erro ao buscar corretores com Eneagrama:', error);
    return [];
  }
}

/**
 * Buscar resultado Eneagrama de um corretor específico
 */
export async function buscarResultadoEneagramaCorretor(
  corretorId: number
): Promise<EneagramaCorretorProfile | null> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=id,nm_corretor,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9,eneagrama_data_teste`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar resultado: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data || data.length === 0 || !data[0].eneagrama_tipo_principal) {
      return null;
    }
    
    const corretor = data[0];
    
    const perfil: EneagramaCorretorProfile = {
      corretor_id: corretor.id,
      corretor_nome: corretor.nm_corretor || 'Corretor sem nome',
      corretor_email: undefined,
      tipo_principal: corretor.eneagrama_tipo_principal,
      scores: {
        1: corretor.eneagrama_score_tipo_1 || 0,
        2: corretor.eneagrama_score_tipo_2 || 0,
        3: corretor.eneagrama_score_tipo_3 || 0,
        4: corretor.eneagrama_score_tipo_4 || 0,
        5: corretor.eneagrama_score_tipo_5 || 0,
        6: corretor.eneagrama_score_tipo_6 || 0,
        7: corretor.eneagrama_score_tipo_7 || 0,
        8: corretor.eneagrama_score_tipo_8 || 0,
        9: corretor.eneagrama_score_tipo_9 || 0
      },
      data_teste: corretor.eneagrama_data_teste || new Date().toISOString()
    };
    
    return perfil;
    
  } catch (error) {
    console.error('❌ Erro ao buscar resultado Eneagrama:', error);
    return null;
  }
}

