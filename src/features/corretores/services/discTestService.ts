/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para gerenciar testes DISC no Supabase
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

/**
 * Estrutura de resposta individual (1 pergunta)
 */
export interface DISCResponse {
  D: number; // 1-4
  I: number; // 1-4
  S: number; // 1-4
  C: number; // 1-4
}

/**
 * Resultado calculado do teste
 */
export interface DISCResult {
  D: number; // 0-1 (percentual)
  I: number; // 0-1 (percentual)
  S: number; // 0-1 (percentual)
  C: number; // 0-1 (percentual)
}

/**
 * Perfil dominante
 */
export interface DominantProfile {
  perfil: 'D' | 'I' | 'S' | 'C';
  nome: string;
  percentual: number;
}

/**
 * Criar novo teste DISC
 */
export async function criarTesteDISC(
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
      `${config.url}/rest/v1/disc_tests`,
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
    console.error('❌ Erro ao criar teste DISC:', error);
    return null;
  }
}

/**
 * Salvar respostas do teste
 */
export async function salvarRespostasDISC(
  testId: string,
  respostas: DISCResponse[]
): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Preparar dados para inserção em massa
    const respostasFormatadas = respostas.map((resposta, index) => ({
      test_id: testId,
      question_number: index + 1,
      response_d: resposta.D,
      response_i: resposta.I,
      response_s: resposta.S,
      response_c: resposta.C
    }));
    
    const response = await fetch(
      `${config.url}/rest/v1/disc_responses`,
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
 * Calcular resultado do teste DISC
 * Fórmula: Percentual = Soma dos Pontos / 100
 * Conversão: 1→4pts, 2→3pts, 3→2pts, 4→1pt
 */
export function calcularResultadoDISC(respostas: DISCResponse[]): {
  resultado: DISCResult;
  dominantes: DominantProfile[];
} {
  
  // Sistema de pontos (INVERSO)
  const pontosPorNota: Record<number, number> = { 
    1: 4, // Mais se identifica = 4 pontos
    2: 3,
    3: 2,
    4: 1  // Menos se identifica = 1 ponto
  };
  
  // Contagem inicial
  const contagem = { D: 0, I: 0, S: 0, C: 0 };
  
  // Somar pontos de cada perfil
  respostas.forEach((resposta, index) => {
    contagem.D += pontosPorNota[resposta.D];
    contagem.I += pontosPorNota[resposta.I];
    contagem.S += pontosPorNota[resposta.S];
    contagem.C += pontosPorNota[resposta.C];
    
  });
  
  
  // Calcular percentuais
  const divisor = 100; // 10 perguntas × 10 pontos (4+3+2+1)
  const resultado: DISCResult = {
    D: contagem.D / divisor,
    I: contagem.I / divisor,
    S: contagem.S / divisor,
    C: contagem.C / divisor
  };
  
  // Verificar se soma = 1.0
  const soma = resultado.D + resultado.I + resultado.S + resultado.C;
  
  if (Math.abs(soma - 1.0) > 0.001) {
    console.warn('⚠️ Atenção: Soma dos percentuais não é 1.0:', soma);
  }
  
  // Identificar perfis dominantes (>= 25%)
  const dominantes: DominantProfile[] = [];
  const nomes: Record<string, string> = {
    D: 'DOMINÂNCIA',
    I: 'INFLUÊNCIA',
    S: 'ESTABILIDADE',
    C: 'CONFORMIDADE'
  };
  
  Object.keys(resultado).forEach((perfil) => {
    const percentual = resultado[perfil as keyof DISCResult];
    if (percentual >= 0.25) {
      dominantes.push({
        perfil: perfil as 'D' | 'I' | 'S' | 'C',
        nome: nomes[perfil],
        percentual: percentual
      });
    }
  });
  
  // Ordenar por percentual (maior primeiro)
  dominantes.sort((a, b) => b.percentual - a.percentual);
  
  
  return { resultado, dominantes };
}

/**
 * Salvar resultado calculado
 */
export async function salvarResultadoDISC(
  testId: string,
  resultado: DISCResult,
  dominantes: DominantProfile[]
): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const resultadoFormatado = {
      test_id: testId,
      percent_d: resultado.D,
      percent_i: resultado.I,
      percent_s: resultado.S,
      percent_c: resultado.C,
      dominant_profiles: dominantes.map(d => d.perfil)
    };
    
    const response = await fetch(
      `${config.url}/rest/v1/disc_results`,
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
 * Processar teste completo: calcular e salvar
 */
export async function processarTesteDISC(
  testId: string,
  respostas: DISCResponse[]
): Promise<{ resultado: DISCResult; dominantes: DominantProfile[] } | null> {
  try {
    
    // 1. Salvar respostas
    const respostasSalvas = await salvarRespostasDISC(testId, respostas);
    if (!respostasSalvas) {
      throw new Error('Falha ao salvar respostas');
    }
    
    // 2. Calcular resultado
    const { resultado, dominantes } = calcularResultadoDISC(respostas);
    
    // 3. Salvar resultado
    const resultadoSalvo = await salvarResultadoDISC(testId, resultado, dominantes);
    if (!resultadoSalvo) {
      throw new Error('Falha ao salvar resultado');
    }
    
    return { resultado, dominantes };
    
  } catch (error) {
    console.error('❌ Erro ao processar teste:', error);
    return null;
  }
}

/**
 * Validar resposta individual
 * ATUALIZADO: Agora permite valores repetidos (ex: duas respostas com 2)
 */
export function validarResposta(resposta: DISCResponse): boolean {
  const valores = [resposta.D, resposta.I, resposta.S, resposta.C];
  
  // Verificar se todos os valores estão entre 1 e 4
  if (!valores.every(v => v >= 1 && v <= 4)) return false;
  
  // Verificar se pelo menos um valor foi preenchido (não todos são 0)
  if (valores.every(v => v === 0)) return false;
  
  // PERMITIR REPETIÇÕES - Usuário pode dar a mesma nota para múltiplas palavras
  return true;
}

/**
 * Buscar resultado de um teste específico
 */
export async function buscarResultadoDISC(testId: string): Promise<{
  resultado: DISCResult;
  dominantes: DominantProfile[];
} | null> {
  try {
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const response = await fetch(
      `${config.url}/rest/v1/disc_results?test_id=eq.${testId}`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || data.length === 0) return null;
    
    const result = data[0];
    const nomes: Record<string, string> = {
      D: 'DOMINÂNCIA',
      I: 'INFLUÊNCIA',
      S: 'ESTABILIDADE',
      C: 'CONFORMIDADE'
    };
    
    return {
      resultado: {
        D: result.percent_d,
        I: result.percent_i,
        S: result.percent_s,
        C: result.percent_c
      },
      dominantes: result.dominant_profiles.map((perfil: string) => ({
        perfil: perfil as 'D' | 'I' | 'S' | 'C',
        nome: nomes[perfil],
        percentual: result[`percent_${perfil.toLowerCase()}`]
      }))
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar resultado:', error);
    return null;
  }
}

