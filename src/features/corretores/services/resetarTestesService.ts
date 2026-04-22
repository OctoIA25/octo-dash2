/**
 * 🔄 Serviço para Resetar Testes de Corretores
 * Permite que corretores refaçam os testes
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

/**
 * Resetar teste de Eneagrama de um corretor
 * Remove os dados para permitir refazer o teste
 */
export async function resetarTesteEneagrama(corretorId: number): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const updateData = {
      eneagrama_tipo_principal: null,
      eneagrama_score_tipo_1: null,
      eneagrama_score_tipo_2: null,
      eneagrama_score_tipo_3: null,
      eneagrama_score_tipo_4: null,
      eneagrama_score_tipo_5: null,
      eneagrama_score_tipo_6: null,
      eneagrama_score_tipo_7: null,
      eneagrama_score_tipo_8: null,
      eneagrama_score_tipo_9: null,
      eneagrama_data_teste: null
    };

    const url = `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Prefer': 'return=representation',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });


    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro na resposta:', error);
      throw new Error(`Erro ao resetar Eneagrama: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return true;

  } catch (error) {
    console.error('❌ Erro ao resetar teste de Eneagrama:', error);
    throw error;
  }
}

/**
 * Resetar teste de MBTI de um corretor
 */
export async function resetarTesteMBTI(corretorId: number): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const updateData = {
      mbti_tipo: null,
      mbti_percent_mind: null,
      mbti_percent_energy: null,
      mbti_percent_nature: null,
      mbti_percent_tactics: null,
      mbti_percent_identity: null,
      mbti_data_teste: null
    };

    const url = `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Prefer': 'return=representation',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });


    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro na resposta:', error);
      throw new Error(`Erro ao resetar MBTI: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return true;

  } catch (error) {
    console.error('❌ Erro ao resetar teste de MBTI:', error);
    throw error;
  }
}

/**
 * Resetar teste de DISC de um corretor
 */
export async function resetarTesteDISC(corretorId: number): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const updateData = {
      disc_tipo_principal: null,
      disc_percentual_d: null,
      disc_percentual_i: null,
      disc_percentual_s: null,
      disc_percentual_c: null,
      disc_perfis_dominantes: null,
      disc_data_teste: null
    };

    const url = `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Prefer': 'return=representation',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });


    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro na resposta:', error);
      throw new Error(`Erro ao resetar DISC: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return true;

  } catch (error) {
    console.error('❌ Erro ao resetar teste de DISC:', error);
    throw error;
  }
}

/**
 * Resetar TODOS os testes de um corretor
 */
export async function resetarTodosTestes(corretorId: number): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const updateData = {
      // DISC
      disc_tipo_principal: null,
      disc_percentual_d: null,
      disc_percentual_i: null,
      disc_percentual_s: null,
      disc_percentual_c: null,
      disc_perfis_dominantes: null,
      disc_data_teste: null,
      // Eneagrama
      eneagrama_tipo_principal: null,
      eneagrama_score_tipo_1: null,
      eneagrama_score_tipo_2: null,
      eneagrama_score_tipo_3: null,
      eneagrama_score_tipo_4: null,
      eneagrama_score_tipo_5: null,
      eneagrama_score_tipo_6: null,
      eneagrama_score_tipo_7: null,
      eneagrama_score_tipo_8: null,
      eneagrama_score_tipo_9: null,
      eneagrama_data_teste: null,
      // MBTI
      mbti_tipo: null,
      mbti_percent_mind: null,
      mbti_percent_energy: null,
      mbti_percent_nature: null,
      mbti_percent_tactics: null,
      mbti_percent_identity: null,
      mbti_data_teste: null
    };

    const url = `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Prefer': 'return=representation',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });


    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro na resposta:', error);
      throw new Error(`Erro ao resetar testes: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    return true;

  } catch (error) {
    console.error('❌ Erro ao resetar todos os testes:', error);
    throw error;
  }
}

// Exportar funções para o console do navegador
if (typeof window !== 'undefined') {
  (window as any).resetarTesteEneagrama = resetarTesteEneagrama;
  (window as any).resetarTesteMBTI = resetarTesteMBTI;
  (window as any).resetarTesteDISC = resetarTesteDISC;
  (window as any).resetarTodosTestes = resetarTodosTestes;
  
}

