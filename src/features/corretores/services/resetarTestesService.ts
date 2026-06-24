/**
 * 🔄 Serviço para Resetar Testes de Corretores
 * Permite que corretores refaçam os testes
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

/**
 * Colunas espelho do 16Personalities (origem do MBTI do corretor). Devem ser
 * limpas junto com o MBTI para não deixar resíduo órfão — ver A1.
 */
const COLUNAS_16P_NULAS = {
  url_resultado_16personalities: null,
  codigo_teste_16personalities: null,
  tipo_16p_codigo: null,
  tipo_16p_nome: null,
  tipo_16p_grupo: null,
  tipo_16p_descricao: null,
  genero_informado_16p: null,
  data_importacao_16personalities: null,
} as const;

/**
 * Apaga o histórico DISC (tabela disc_test_results) de um corretor.
 *
 * O card DISC de "Meus Resultados" lê de disc_test_results, não das colunas de
 * Corretores. Se o reset limpasse só as colunas, o card continuaria mostrando o
 * resultado antigo (resultado fantasma) — M2. Por isso o reset de DISC também
 * apaga o histórico.
 */
async function apagarHistoricoDISC(corretorId: number): Promise<void> {
  const config = getSupabaseConfig();
  const headers = getAuthenticatedHeaders();
  const response = await fetch(
    `${config.url}/rest/v1/disc_test_results?corretor_id=eq.${corretorId}`,
    { method: 'DELETE', headers: { ...headers, 'Prefer': 'return=minimal' } }
  );
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Erro ao apagar histórico DISC:', error);
    throw new Error(`Erro ao apagar histórico DISC: ${response.status} - ${error}`);
  }
}

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
      mbti_data_teste: null,
      // O MBTI do corretor vem da importação 16Personalities; sem limpar essas
      // colunas, sobra um resíduo órfão que faz a página de importação achar que
      // "já tem importação" e PULAR o salvamento de uma nova importação (A1).
      ...COLUNAS_16P_NULAS
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

    // Apaga também o histórico, senão o card DISC mostra resultado fantasma (M2).
    await apagarHistoricoDISC(corretorId);

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
      mbti_data_teste: null,
      // 16Personalities (origem do MBTI) — limpar junto para não deixar órfão (A1)
      ...COLUNAS_16P_NULAS
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

    // Apaga também o histórico DISC (M2).
    await apagarHistoricoDISC(corretorId);

    return true;

  } catch (error) {
    console.error('❌ Erro ao resetar todos os testes:', error);
    throw error;
  }
}

// A exposição destas funções no console fica centralizada (e gated por DEV) em
// utils/consoleHelpers.ts — ver A2. Não reexpor aqui para não vazar em produção.

