/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para gerenciar testes de Eneagrama no Supabase
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';
import { salvarResultadoEneagrama as salvarNoTestesComportamentais, ResultadoEneagrama } from './testesComportamentaisService';

/**
 * Estrutura de resposta individual (1 pergunta)
 * 'A' ou 'B'
 */
export type EneagramaResponse = 'A' | 'B';

/**
 * Resultado calculado do teste
 * Pontuação de 0-10 para cada tipo
 */
export interface EneagramaResult {
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
  tipoPrincipal: number; // Tipo com maior pontuação (1-9)
  topTipos: number[]; // Tipos empatados com pontuação máxima
}

/**
 * Criar novo teste de Eneagrama
 */
export async function criarTesteEneagrama(
  corretorId: string,
  corretorNome: string,
  corretorEmail?: string
): Promise<string | null> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const novoTeste = {
      corretor_id: corretorId,
      corretor_nome: corretorNome,
      corretor_email: corretorEmail
    };
    
    const response = await fetch(
      `${config.url}/rest/v1/enneagram_tests`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(novoTeste)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao criar teste: ${response.status}`);
    }
    
    const data = await response.json();
    const testId = data[0]?.id;
    
    return testId;
    
  } catch (error) {
    console.error('❌ Erro ao criar teste de Eneagrama:', error);
    return null;
  }
}

/**
 * Salvar respostas do teste
 */
export async function salvarRespostasEneagrama(
  testId: string,
  respostas: EneagramaResponse[]
): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Preparar dados para inserção em massa
    const respostasFormatadas = respostas.map((resposta, index) => ({
      test_id: testId,
      question_number: index + 1,
      response: resposta
    }));
    
    const response = await fetch(
      `${config.url}/rest/v1/enneagram_responses`,
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(respostasFormatadas)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao salvar respostas: ${response.status}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao salvar respostas:', error);
    return false;
  }
}

/**
 * Calcular resultado do teste de Eneagrama
 * Cada resposta soma +1 ponto ao tipo correspondente
 */
export function calcularResultadoEneagrama(respostas: EneagramaResponse[]): EneagramaResult {
  
  // Mapeamento de perguntas para tipos
  const mapa: Record<number, { A: number; B: number }> = {
    1: { A: 1, B: 7 },
    2: { A: 2, B: 5 },
    3: { A: 3, B: 9 },
    4: { A: 4, B: 8 },
    5: { A: 6, B: 1 },
    6: { A: 2, B: 7 },
    7: { A: 5, B: 3 },
    8: { A: 9, B: 4 },
    9: { A: 8, B: 6 },
    10: { A: 1, B: 5 }
  };
  
  // Inicializar pontuações
  const scores: Record<number, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    6: 0, 7: 0, 8: 0, 9: 0
  };
  
  // Somar pontos para cada resposta
  respostas.forEach((resposta, index) => {
    const perguntaNum = index + 1;
    
    // Validação de segurança
    if (!mapa[perguntaNum]) {
      console.error(`❌ Erro: pergunta ${perguntaNum} não existe no mapa!`);
      return;
    }
    
    if (resposta !== 'A' && resposta !== 'B') {
      console.error(`❌ Erro: resposta inválida na pergunta ${perguntaNum}:`, resposta);
      return;
    }
    
    const tipo = mapa[perguntaNum][resposta];
    
    if (tipo) {
      scores[tipo]++;
    }
  });
  
  
  // Encontrar o tipo com maior pontuação
  let tipoPrincipal = 1;
  let maxScore = -1;
  
  for (const tipo in scores) {
    if (scores[tipo] > maxScore) {
      maxScore = scores[tipo];
      tipoPrincipal = parseInt(tipo);
    }
  }
  
  // Encontrar todos os tipos com pontuação máxima (empates)
  const topTipos = Object.keys(scores)
    .filter(tipo => scores[parseInt(tipo)] === maxScore)
    .map(Number);
  
  
  // Formatar scores no formato correto da interface
  const scoresFormatados = {
    1: scores[1],
    2: scores[2],
    3: scores[3],
    4: scores[4],
    5: scores[5],
    6: scores[6],
    7: scores[7],
    8: scores[8],
    9: scores[9]
  };
  
  return { scores: scoresFormatados, tipoPrincipal, topTipos };
}

/**
 * Salvar resultado calculado
 */
export async function salvarResultadoEneagrama(
  testId: string,
  resultado: EneagramaResult
): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const resultadoFormatado = {
      test_id: testId,
      score_type_1: resultado.scores[1],
      score_type_2: resultado.scores[2],
      score_type_3: resultado.scores[3],
      score_type_4: resultado.scores[4],
      score_type_5: resultado.scores[5],
      score_type_6: resultado.scores[6],
      score_type_7: resultado.scores[7],
      score_type_8: resultado.scores[8],
      score_type_9: resultado.scores[9],
      primary_type: resultado.tipoPrincipal,
      top_types: resultado.topTipos
    };
    
    const response = await fetch(
      `${config.url}/rest/v1/enneagram_results`,
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(resultadoFormatado)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao salvar resultado: ${response.status}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao salvar resultado:', error);
    return false;
  }
}

/**
 * Processar teste completo: salvar respostas, calcular e salvar resultado
 */
export async function processarTesteEneagrama(
  testId: string,
  respostas: EneagramaResponse[],
  corretorId?: string
): Promise<EneagramaResult | null> {
  try {
    
    // 1. Salvar respostas
    const respostasSalvas = await salvarRespostasEneagrama(testId, respostas);
    if (!respostasSalvas) {
      throw new Error('Falha ao salvar respostas');
    }
    
    // 2. Calcular resultado
    const resultado = calcularResultadoEneagrama(respostas);
    
    // 3. Salvar resultado nas tabelas do teste
    const resultadoSalvo = await salvarResultadoEneagrama(testId, resultado);
    if (!resultadoSalvo) {
      throw new Error('Falha ao salvar resultado');
    }
    
    // 4. Atualizar tabela de testes comportamentais
    if (corretorId) {
      const resultadoFormatado: ResultadoEneagrama = {
        tipo_principal: resultado.tipoPrincipal,
        pontuacoes: resultado.scores,
        descricao: `Tipo ${resultado.tipoPrincipal}`
      };
      await salvarNoTestesComportamentais(corretorId, resultadoFormatado);
    }
    
    return resultado;
    
  } catch (error) {
    console.error('❌ Erro ao processar teste:', error);
    return null;
  }
}

/**
 * Buscar resultado de um teste específico
 */
export async function buscarResultadoEneagrama(testId: string): Promise<EneagramaResult | null> {
  try {
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const response = await fetch(
      `${config.url}/rest/v1/enneagram_results?test_id=eq.${testId}`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || data.length === 0) return null;
    
    const result = data[0];
    
    return {
      scores: {
        1: result.score_type_1,
        2: result.score_type_2,
        3: result.score_type_3,
        4: result.score_type_4,
        5: result.score_type_5,
        6: result.score_type_6,
        7: result.score_type_7,
        8: result.score_type_8,
        9: result.score_type_9
      },
      tipoPrincipal: result.primary_type,
      topTipos: result.top_types
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar resultado:', error);
    return null;
  }
}

/**
 * Validar resposta individual
 */
export function validarRespostaEneagrama(resposta: string | null): boolean {
  return resposta === 'A' || resposta === 'B';
}

