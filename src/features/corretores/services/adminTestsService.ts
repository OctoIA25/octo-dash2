/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para gerenciar testes comportamentais de ADMINS/OWNERS
 * 
 * Funcionalidades:
 * - Buscar resultados de testes do admin logado
 * - Salvar resultados de testes para admins
 * - Excluir resultados de testes (para refazer)
 * - Formatar resultados para envio no webhook
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

// ============================================================================
// INTERFACES
// ============================================================================

export interface AdminTestResults {
  userId: string;
  userEmail: string;
  userName: string;
  disc?: {
    tipoPrincipal: string;
    percentuais: { D: number; I: number; S: number; C: number };
    perfisDominantes: string[];
    dataTeste: string;
  };
  eneagrama?: {
    tipoPrincipal: number;
    scores: { [key: number]: number };
    dataTeste: string;
  };
  mbti?: {
    tipo: string;
    percentuais: { [key: string]: number };
    dataTeste: string;
  };
}

export interface AdminTestResultFormatted {
  disc?: string;
  eneagrama?: string;
  mbti?: string;
  resumo?: string;
}

// ============================================================================
// FUNÇÕES PARA BUSCAR RESULTADOS DO ADMIN
// ============================================================================

/**
 * Busca os resultados de testes do admin logado
 * Os admins salvam seus resultados na tabela admin_test_results
 */
export async function buscarResultadosAdmin(userId: string): Promise<AdminTestResults | null> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const response = await fetch(
      `${config.url}/rest/v1/admin_test_results?user_id=eq.${userId}&select=*&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (!response.ok) {
      // Se a tabela não existir, retornar null silenciosamente
      if (response.status === 404) {
        return null;
      }
      const error = await response.text();
      console.warn('⚠️ Erro ao buscar resultados do admin:', error);
      return null;
    }

    const data = await response.json();
    
    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];

    return {
      userId: result.user_id,
      userEmail: result.user_email || '',
      userName: result.user_name || '',
      disc: result.disc_tipo_principal ? {
        tipoPrincipal: result.disc_tipo_principal,
        percentuais: {
          D: result.disc_percentual_d || 0,
          I: result.disc_percentual_i || 0,
          S: result.disc_percentual_s || 0,
          C: result.disc_percentual_c || 0
        },
        perfisDominantes: result.disc_perfis_dominantes || [],
        dataTeste: result.disc_data_teste || ''
      } : undefined,
      eneagrama: result.eneagrama_tipo_principal ? {
        tipoPrincipal: result.eneagrama_tipo_principal,
        scores: {
          1: result.eneagrama_score_tipo_1 || 0,
          2: result.eneagrama_score_tipo_2 || 0,
          3: result.eneagrama_score_tipo_3 || 0,
          4: result.eneagrama_score_tipo_4 || 0,
          5: result.eneagrama_score_tipo_5 || 0,
          6: result.eneagrama_score_tipo_6 || 0,
          7: result.eneagrama_score_tipo_7 || 0,
          8: result.eneagrama_score_tipo_8 || 0,
          9: result.eneagrama_score_tipo_9 || 0
        },
        dataTeste: result.eneagrama_data_teste || ''
      } : undefined,
      mbti: result.mbti_tipo ? {
        tipo: result.mbti_tipo,
        percentuais: {
          Mind: result.mbti_percent_mind || 0,
          Energy: result.mbti_percent_energy || 0,
          Nature: result.mbti_percent_nature || 0,
          Tactics: result.mbti_percent_tactics || 0,
          Identity: result.mbti_percent_identity || 0
        },
        dataTeste: result.mbti_data_teste || ''
      } : undefined
    };

  } catch (error) {
    console.error('❌ Erro ao buscar resultados do admin:', error);
    return null;
  }
}

/**
 * Verifica quais testes o admin já realizou
 */
export async function verificarTestesAdminCompletos(userId: string): Promise<{
  disc: boolean;
  eneagrama: boolean;
  mbti: boolean;
  todosCompletos: boolean;
}> {
  const resultados = await buscarResultadosAdmin(userId);
  
  const status = {
    disc: !!resultados?.disc,
    eneagrama: !!resultados?.eneagrama,
    mbti: !!resultados?.mbti,
    todosCompletos: false
  };
  
  status.todosCompletos = status.disc && status.eneagrama && status.mbti;
  
  return status;
}

async function upsertAdminTestResult(updateData: Record<string, unknown>): Promise<Response> {
  const config = getSupabaseConfig();
  const headers = getAuthenticatedHeaders();

  return fetch(
    `${config.url}/rest/v1/admin_test_results?on_conflict=user_id`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(updateData)
    }
  );
}

// ============================================================================
// FUNÇÕES PARA SALVAR RESULTADOS DO ADMIN
// ============================================================================

/**
 * Salva resultado do teste DISC para o admin
 */
export async function salvarResultadoDISCAdmin(
  userId: string,
  userEmail: string,
  userName: string,
  resultado: {
    tipoPrincipal: string;
    percentuais: { D: number; I: number; S: number; C: number };
    perfisDominantes: Array<{ perfil: string; percentual: number }>;
  }
): Promise<boolean> {
  try {

    const updateData = {
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      disc_tipo_principal: resultado.tipoPrincipal,
      disc_percentual_d: resultado.percentuais.D,
      disc_percentual_i: resultado.percentuais.I,
      disc_percentual_s: resultado.percentuais.S,
      disc_percentual_c: resultado.percentuais.C,
      disc_perfis_dominantes: resultado.perfisDominantes.map(p => p.perfil),
      disc_data_teste: new Date().toISOString()
    };

    const response = await upsertAdminTestResult(updateData);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro ao salvar DISC do admin:', error);
      return false;
    }

    return true;

  } catch (error) {
    console.error('❌ Erro ao salvar resultado DISC do admin:', error);
    return false;
  }
}

/**
 * Salva resultado do teste Eneagrama para o admin
 */
export async function salvarResultadoEneagramaAdmin(
  userId: string,
  userEmail: string,
  userName: string,
  resultado: {
    tipoPrincipal: number;
    scores: { [key: number]: number };
  }
): Promise<boolean> {
  try {

    const updateData = {
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      eneagrama_tipo_principal: resultado.tipoPrincipal,
      eneagrama_score_tipo_1: resultado.scores[1] || 0,
      eneagrama_score_tipo_2: resultado.scores[2] || 0,
      eneagrama_score_tipo_3: resultado.scores[3] || 0,
      eneagrama_score_tipo_4: resultado.scores[4] || 0,
      eneagrama_score_tipo_5: resultado.scores[5] || 0,
      eneagrama_score_tipo_6: resultado.scores[6] || 0,
      eneagrama_score_tipo_7: resultado.scores[7] || 0,
      eneagrama_score_tipo_8: resultado.scores[8] || 0,
      eneagrama_score_tipo_9: resultado.scores[9] || 0,
      eneagrama_data_teste: new Date().toISOString()
    };

    const response = await upsertAdminTestResult(updateData);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro ao salvar Eneagrama do admin:', error);
      return false;
    }

    return true;

  } catch (error) {
    console.error('❌ Erro ao salvar resultado Eneagrama do admin:', error);
    return false;
  }
}

/**
 * Salva resultado do teste MBTI para o admin
 */
export async function salvarResultadoMBTIAdmin(
  userId: string,
  userEmail: string,
  userName: string,
  resultado: {
    tipoFinal: string;
    percentuais: { Mind: number; Energy: number; Nature: number; Tactics: number; Identity: number };
  }
): Promise<boolean> {
  try {

    const updateData = {
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      mbti_tipo: resultado.tipoFinal,
      mbti_percent_mind: resultado.percentuais.Mind,
      mbti_percent_energy: resultado.percentuais.Energy,
      mbti_percent_nature: resultado.percentuais.Nature,
      mbti_percent_tactics: resultado.percentuais.Tactics,
      mbti_percent_identity: resultado.percentuais.Identity,
      mbti_data_teste: new Date().toISOString()
    };

    const response = await upsertAdminTestResult(updateData);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro ao salvar MBTI do admin:', error);
      return false;
    }

    return true;

  } catch (error) {
    console.error('❌ Erro ao salvar resultado MBTI do admin:', error);
    return false;
  }
}

// ============================================================================
// FUNÇÕES PARA EXCLUIR RESULTADOS DO ADMIN
// ============================================================================

/**
 * Exclui TODOS os resultados de testes do admin (para poder refazer)
 */
export async function excluirResultadosAdmin(userId: string): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const response = await fetch(
      `${config.url}/rest/v1/admin_test_results?user_id=eq.${userId}`,
      {
        method: 'DELETE',
        headers: headers
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Erro ao excluir resultados do admin:', error);
      return false;
    }

    return true;

  } catch (error) {
    console.error('❌ Erro ao excluir resultados do admin:', error);
    return false;
  }
}

// ============================================================================
// FUNÇÕES PARA FORMATAR RESULTADOS PARA O WEBHOOK
// ============================================================================

/**
 * Formata os resultados do admin para envio no webhook
 * Retorna texto formatado para cada teste
 */
export function formatarResultadosParaWebhook(resultados: AdminTestResults): AdminTestResultFormatted {
  const formatted: AdminTestResultFormatted = {};

  // Formatar DISC
  if (resultados.disc) {
    const d = resultados.disc;
    const perfilNomes: Record<string, string> = {
      D: 'DOMINÂNCIA',
      I: 'INFLUÊNCIA',
      S: 'ESTABILIDADE',
      C: 'CONFORMIDADE'
    };
    
    formatted.disc = `
📊 RESULTADO DISC DO GESTOR:

PERFIL PRINCIPAL: ${perfilNomes[d.tipoPrincipal] || d.tipoPrincipal} (${d.tipoPrincipal})

DISTRIBUIÇÃO PERCENTUAL:
- D (Dominância): ${(d.percentuais.D * 100).toFixed(1)}%
- I (Influência): ${(d.percentuais.I * 100).toFixed(1)}%
- S (Estabilidade): ${(d.percentuais.S * 100).toFixed(1)}%
- C (Conformidade): ${(d.percentuais.C * 100).toFixed(1)}%

PERFIS DOMINANTES: ${d.perfisDominantes.map(p => perfilNomes[p] || p).join(', ')}

Data do Teste: ${new Date(d.dataTeste).toLocaleDateString('pt-BR')}
`.trim();
  }

  // Formatar Eneagrama
  if (resultados.eneagrama) {
    const e = resultados.eneagrama;
    const tipoNomes: Record<number, string> = {
      1: 'O Perfeccionista',
      2: 'O Prestativo',
      3: 'O Realizador',
      4: 'O Individualista',
      5: 'O Investigador',
      6: 'O Leal',
      7: 'O Entusiasta',
      8: 'O Desafiador',
      9: 'O Pacificador'
    };

    formatted.eneagrama = `
⭐ RESULTADO ENEAGRAMA DO GESTOR:

TIPO PRINCIPAL: Tipo ${e.tipoPrincipal} - ${tipoNomes[e.tipoPrincipal] || 'Desconhecido'}

PONTUAÇÃO POR TIPO:
${Object.entries(e.scores)
  .sort((a, b) => b[1] - a[1])
  .map(([tipo, score]) => `- Tipo ${tipo} (${tipoNomes[parseInt(tipo)] || ''}): ${score} pontos`)
  .join('\n')}

Data do Teste: ${new Date(e.dataTeste).toLocaleDateString('pt-BR')}
`.trim();
  }

  // Formatar MBTI
  if (resultados.mbti) {
    const m = resultados.mbti;
    
    formatted.mbti = `
🧠 RESULTADO MBTI DO GESTOR:

TIPO: ${m.tipo}

DIMENSÕES:
- Mind (Mente): ${m.percentuais.Mind}%
- Energy (Energia): ${m.percentuais.Energy}%
- Nature (Natureza): ${m.percentuais.Nature}%
- Tactics (Táticas): ${m.percentuais.Tactics}%
- Identity (Identidade): ${m.percentuais.Identity}%

Data do Teste: ${new Date(m.dataTeste).toLocaleDateString('pt-BR')}
`.trim();
  }

  // Criar resumo geral
  const testesRealizados: string[] = [];
  if (resultados.disc) testesRealizados.push(`DISC: ${resultados.disc.tipoPrincipal}`);
  if (resultados.eneagrama) testesRealizados.push(`Eneagrama: Tipo ${resultados.eneagrama.tipoPrincipal}`);
  if (resultados.mbti) testesRealizados.push(`MBTI: ${resultados.mbti.tipo}`);

  if (testesRealizados.length > 0) {
    formatted.resumo = `
📋 RESUMO DOS TESTES DO GESTOR (${resultados.userName}):

${testesRealizados.join('\n')}

${formatted.disc ? '\n---\n' + formatted.disc : ''}
${formatted.eneagrama ? '\n---\n' + formatted.eneagrama : ''}
${formatted.mbti ? '\n---\n' + formatted.mbti : ''}
`.trim();
  }

  return formatted;
}

/**
 * Busca e formata os resultados do admin para anexar no chat
 */
export async function buscarEFormatarResultadosAdmin(userId: string): Promise<AdminTestResultFormatted | null> {
  const resultados = await buscarResultadosAdmin(userId);
  
  if (!resultados) {
    return null;
  }

  return formatarResultadosParaWebhook(resultados);
}
