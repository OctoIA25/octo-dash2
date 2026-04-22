/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

/**
 * Serviço para gerenciar resultados dos testes de personalidade
 * - DISC
 * - Eneagrama
 * - MBTI (16Personalities)
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

// ============================================================================
// INTERFACES DOS RESULTADOS DOS TESTES
// ============================================================================

export interface ResultadoDISC {
  tipoPrincipal: 'D' | 'I' | 'S' | 'C';
  percentuais: {
    D: number; // 0.0000 a 1.0000
    I: number;
    S: number;
    C: number;
  };
  perfisDominantes: Array<{
    perfil: 'D' | 'I' | 'S' | 'C';
    percentual: number;
  }>;
}

export interface ResultadoEneagrama {
  tipoPrincipal: number; // 1 a 9
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
  topTipos: number[]; // Tipos com pontuação máxima
}

export interface ResultadoMBTI {
  tipoFinal: string; // ex: "INTJ-A", "ENFP-T"
  percentuais: {
    Mind: number; // 0 a 100
    Energy: number;
    Nature: number;
    Tactics: number;
    Identity: number;
  };
}

export interface TodosOsTestes {
  disc?: ResultadoDISC;
  eneagrama?: ResultadoEneagrama;
  mbti?: ResultadoMBTI;
}

// ============================================================================
// FUNÇÕES PARA SALVAR RESULTADOS NO SUPABASE
// ============================================================================

/**
 * Salva resultado do teste DISC para um corretor
 * Salva tanto na tabela Corretores quanto em disc_test_results para histórico
 */
export async function salvarResultadoDISC(
  corretorId: number,
  resultado: ResultadoDISC,
  corretorNome?: string,
  corretorEmail?: string
): Promise<any> {
  try {
    
    // Validação do ID
    if (!corretorId || isNaN(corretorId)) {
      throw new Error(`ID do corretor inválido: ${corretorId}`);
    }

    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const updateData = {
      disc_tipo_principal: resultado.tipoPrincipal,
      disc_percentual_d: resultado.percentuais.D,
      disc_percentual_i: resultado.percentuais.I,
      disc_percentual_s: resultado.percentuais.S,
      disc_percentual_c: resultado.percentuais.C,
      disc_perfis_dominantes: resultado.perfisDominantes.map(p => p.perfil),
      disc_data_teste: new Date().toISOString()
    };

    // 1. Atualizar tabela Corretores (colunas principais)
    const responseCorretores = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!responseCorretores.ok) {
      const error = await responseCorretores.text();
      throw new Error(`Erro ao atualizar Corretores: ${responseCorretores.status} - ${error}`);
    }

    const dataCorretores = await responseCorretores.json();

    // 2. Inserir em disc_test_results para manter histórico completo
    const testResultData = {
      corretor_id: corretorId,
      corretor_nome: corretorNome || 'Não informado',
      corretor_email: corretorEmail || null,
      tipo_principal: resultado.tipoPrincipal,
      percentual_d: resultado.percentuais.D,
      percentual_i: resultado.percentuais.I,
      percentual_s: resultado.percentuais.S,
      percentual_c: resultado.percentuais.C,
      perfis_dominantes: resultado.perfisDominantes.map(p => p.perfil),
      data_teste: new Date().toISOString()
    };

    const responseTestResults = await fetch(
      `${config.url}/rest/v1/disc_test_results`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(testResultData)
      }
    );

    if (!responseTestResults.ok) {
      const error = await responseTestResults.text();
      console.warn('⚠️ Aviso: Falha ao salvar histórico:', error);
      // Não falha completamente, pois o principal já foi salvo
    } else {
      const dataTestResults = await responseTestResults.json();
    }

    return { corretores: dataCorretores };

  } catch (error) {
    console.error('❌ Erro ao salvar resultado DISC:', error);
    throw error;
  }
}

/**
 * Salva resultado do teste Eneagrama para um corretor
 */
export async function salvarResultadoEneagrama(
  corretorId: number,
  resultado: ResultadoEneagrama
): Promise<any> {
  try {
    
    // Validação crítica
    if (!resultado || !resultado.tipoPrincipal) {
      throw new Error('Resultado inválido: tipoPrincipal é obrigatório');
    }
    
    if (!resultado.scores || typeof resultado.scores !== 'object') {
      throw new Error('Resultado inválido: scores é obrigatório');
    }
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    // Garantir que scores existem (usar 0 como fallback)
    const updateData = {
      eneagrama_tipo_principal: resultado.tipoPrincipal,
      eneagrama_score_tipo_1: resultado.scores[1] ?? 0,
      eneagrama_score_tipo_2: resultado.scores[2] ?? 0,
      eneagrama_score_tipo_3: resultado.scores[3] ?? 0,
      eneagrama_score_tipo_4: resultado.scores[4] ?? 0,
      eneagrama_score_tipo_5: resultado.scores[5] ?? 0,
      eneagrama_score_tipo_6: resultado.scores[6] ?? 0,
      eneagrama_score_tipo_7: resultado.scores[7] ?? 0,
      eneagrama_score_tipo_8: resultado.scores[8] ?? 0,
      eneagrama_score_tipo_9: resultado.scores[9] ?? 0,
      eneagrama_data_teste: new Date().toISOString()
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
      throw new Error(`Erro ao salvar Eneagrama: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    // Verificar se os dados foram realmente salvos
    if (data && data.length > 0) {
      const corretorAtualizado = data[0];
    } else {
      console.warn('⚠️ Resposta vazia do Supabase - dados podem não ter sido salvos');
    }
    
    return data;

  } catch (error) {
    console.error('❌ Erro ao salvar resultado Eneagrama:', error);
    throw error;
  }
}

/**
 * Salva resultado do teste MBTI para um corretor
 */
export async function salvarResultadoMBTI(
  corretorId: number,
  resultado: ResultadoMBTI
): Promise<any> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const updateData = {
      mbti_tipo: resultado.tipoFinal,
      mbti_percent_mind: resultado.percentuais.Mind,
      mbti_percent_energy: resultado.percentuais.Energy,
      mbti_percent_nature: resultado.percentuais.Nature,
      mbti_percent_tactics: resultado.percentuais.Tactics,
      mbti_percent_identity: resultado.percentuais.Identity,
      mbti_data_teste: new Date().toISOString()
    };

    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro ao salvar MBTI: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('❌ Erro ao salvar resultado MBTI:', error);
    throw error;
  }
}

/**
 * Salva todos os testes de uma vez (DISC, Eneagrama, MBTI)
 */
export async function salvarTodosOsTestes(
  corretorId: number,
  resultados: TodosOsTestes
): Promise<any> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const updateData: any = {};

    // DISC
    if (resultados.disc) {
      updateData.disc_tipo_principal = resultados.disc.tipoPrincipal;
      updateData.disc_percentual_d = resultados.disc.percentuais.D;
      updateData.disc_percentual_i = resultados.disc.percentuais.I;
      updateData.disc_percentual_s = resultados.disc.percentuais.S;
      updateData.disc_percentual_c = resultados.disc.percentuais.C;
      updateData.disc_perfis_dominantes = resultados.disc.perfisDominantes.map(p => p.perfil);
      updateData.disc_data_teste = new Date().toISOString();
    }

    // Eneagrama
    if (resultados.eneagrama) {
      updateData.eneagrama_tipo_principal = resultados.eneagrama.tipoPrincipal;
      for (let i = 1; i <= 9; i++) {
        updateData[`eneagrama_score_tipo_${i}`] = resultados.eneagrama.scores[i as keyof typeof resultados.eneagrama.scores];
      }
      updateData.eneagrama_data_teste = new Date().toISOString();
    }

    // MBTI
    if (resultados.mbti) {
      updateData.mbti_tipo = resultados.mbti.tipoFinal;
      updateData.mbti_percent_mind = resultados.mbti.percentuais.Mind;
      updateData.mbti_percent_energy = resultados.mbti.percentuais.Energy;
      updateData.mbti_percent_nature = resultados.mbti.percentuais.Nature;
      updateData.mbti_percent_tactics = resultados.mbti.percentuais.Tactics;
      updateData.mbti_percent_identity = resultados.mbti.percentuais.Identity;
      updateData.mbti_data_teste = new Date().toISOString();
    }

    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro ao salvar testes: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('❌ Erro ao salvar testes:', error);
    throw error;
  }
}

// ============================================================================
// FUNÇÕES PARA BUSCAR RESULTADOS DO SUPABASE
// ============================================================================

/**
 * Busca todos os dados de personalidade de um corretor
 */
export async function buscarPerfilCorretor(corretorId: number): Promise<any> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=*`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro ao buscar perfil: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data[0];

  } catch (error) {
    console.error('❌ Erro ao buscar perfil do corretor:', error);
    throw error;
  }
}

/**
 * Busca estatísticas dos testes (quantos corretores fizeram cada teste)
 */
export async function buscarEstatisticasTestes(tenantId?: string): Promise<any> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : '';
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?select=disc_tipo_principal,eneagrama_tipo_principal,mbti_tipo${tenantFilter}`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro ao buscar estatísticas: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    // Calcular estatísticas
    const stats = {
      totalCorretores: data.length,
      comDISC: data.filter((c: any) => c.disc_tipo_principal).length,
      comEneagrama: data.filter((c: any) => c.eneagrama_tipo_principal).length,
      comMBTI: data.filter((c: any) => c.mbti_tipo).length,
      comTodosTestes: data.filter((c: any) => 
        c.disc_tipo_principal && c.eneagrama_tipo_principal && c.mbti_tipo
      ).length,
      distribuicaoDISC: {} as Record<string, number>,
      distribuicaoEneagrama: {} as Record<number, number>,
      distribuicaoMBTI: {} as Record<string, number>
    };

    // Distribuição DISC
    data.forEach((c: any) => {
      if (c.disc_tipo_principal) {
        stats.distribuicaoDISC[c.disc_tipo_principal] = 
          (stats.distribuicaoDISC[c.disc_tipo_principal] || 0) + 1;
      }
    });

    // Distribuição Eneagrama
    data.forEach((c: any) => {
      if (c.eneagrama_tipo_principal) {
        stats.distribuicaoEneagrama[c.eneagrama_tipo_principal] = 
          (stats.distribuicaoEneagrama[c.eneagrama_tipo_principal] || 0) + 1;
      }
    });

    // Distribuição MBTI
    data.forEach((c: any) => {
      if (c.mbti_tipo) {
        stats.distribuicaoMBTI[c.mbti_tipo] = 
          (stats.distribuicaoMBTI[c.mbti_tipo] || 0) + 1;
      }
    });

    return stats;

  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    throw error;
  }
}

// ============================================================================
// EXEMPLO DE USO
// ============================================================================

/*
// Exemplo 1: Salvar resultado DISC
const resultadoDISC = {
  tipoPrincipal: 'I',
  percentuais: {
    D: 0.24,
    I: 0.29,
    S: 0.26,
    C: 0.21
  },
  perfisDominantes: [
    { perfil: 'I', percentual: 0.29 },
    { perfil: 'S', percentual: 0.26 }
  ]
};
await salvarResultadoDISC(123, resultadoDISC);

// Exemplo 2: Salvar todos os testes de uma vez
await salvarTodosOsTestes(123, {
  disc: resultadoDISC,
  eneagrama: resultadoEneagrama,
  mbti: resultadoMBTI
});

// Exemplo 3: Buscar perfil completo
const perfil = await buscarPerfilCorretor(123);

// Exemplo 4: Estatísticas gerais
const stats = await buscarEstatisticasTestes();
*/

