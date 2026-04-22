/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para gerenciar testes comportamentais dos corretores
 * Integrado com Supabase
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

/**
 * Estrutura de dados dos testes comportamentais
 */
export interface TestesComportamentais {
  id?: number;
  corretor_id: string; // ID do usuário/corretor
  corretor_nome: string;
  corretor_email?: string;
  
  // Status dos testes
  disc_completo: boolean;
  disc_resultado?: string; // JSON com resultados
  disc_data_conclusao?: string;
  
  eneagrama_completo: boolean;
  eneagrama_resultado?: string; // JSON com resultados
  eneagrama_data_conclusao?: string;
  
  mbti_completo: boolean;
  mbti_tipo?: string; // Ex: ENFJ
  mbti_link_resultado?: string; // Link do 16personalities
  mbti_data_conclusao?: string;
  
  // Status geral
  todos_completos: boolean;
  data_inicio: string;
  data_conclusao_total?: string;
  
  created_at?: string;
  updated_at?: string;
}

/**
 * Estrutura dos resultados do teste DISC
 */
export interface ResultadoDISC {
  D: number; // Dominância
  I: number; // Influência
  S: number; // Estabilidade
  C: number; // Conformidade
  perfil_predominante: string;
  descricao: string;
}

/**
 * Estrutura dos resultados do teste Eneagrama
 */
export interface ResultadoEneagrama {
  tipo_principal: number; // 1-9
  asa?: string; // Ex: "3w2"
  pontuacoes: { [tipo: number]: number };
  descricao: string;
}

/**
 * Verifica se o corretor já completou os testes
 * ATUALIZADO: Busca direto na tabela Corretores para garantir persistência
 */
export async function verificarTestesCompletos(corretorNomeOuId: string): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // 🔍 BUSCAR NA TABELA CORRETORES (fonte única de verdade)
    // Tentar buscar por nome primeiro (compatibilidade com sistema atual)
    let response = await fetch(
      `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(corretorNomeOuId)}&select=id,nm_corretor,disc_tipo_principal,eneagrama_tipo_principal,mbti_tipo,disc_data_teste,eneagrama_data_teste,mbti_data_teste&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    let data = await response.json();
    
    // Se não encontrar por nome, tentar por ID numérico
    if (!response.ok || !data || data.length === 0) {
      const idNumerico = parseInt(corretorNomeOuId);
      if (!isNaN(idNumerico)) {
        response = await fetch(
          `${config.url}/rest/v1/Corretores?id=eq.${idNumerico}&select=id,nm_corretor,disc_tipo_principal,eneagrama_tipo_principal,mbti_tipo,disc_data_teste,eneagrama_data_teste,mbti_data_teste`,
          {
            method: 'GET',
            headers: headers
          }
        );
        data = await response.json();
      }
    }
    
    if (!response.ok || !data || data.length === 0) {
      return false;
    }
    
    const corretor = data[0];
    
    // ✅ VERIFICAR SE OS 3 TESTES ESTÃO COMPLETOS
    // OBRIGATÓRIO: DISC + ENEAGRAMA + MBTI para acessar Elaine
    const discCompleto = !!(corretor.disc_tipo_principal && corretor.disc_data_teste);
    const eneagramaCompleto = !!(corretor.eneagrama_tipo_principal && corretor.eneagrama_data_teste);
    const mbtiCompleto = !!(corretor.mbti_tipo && corretor.mbti_data_teste);
    
    
    // 🎯 RETORNAR TRUE APENAS SE TODOS OS 3 TESTES ESTIVEREM COMPLETOS
    const todosCompletos = discCompleto && eneagramaCompleto && mbtiCompleto;
    
    if (todosCompletos) {
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Erro ao verificar testes:', error);
    return false;
  }
}

/**
 * Busca os dados dos testes do corretor direto da tabela Corretores
 * ATUALIZADO: Busca na fonte única de verdade (tabela Corretores)
 */
export async function buscarTestesCorretor(corretorNomeOuId: string): Promise<TestesComportamentais | null> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Buscar por nome primeiro
    let response = await fetch(
      `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(corretorNomeOuId)}&select=*&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    let data = await response.json();
    
    // Se não encontrar por nome, tentar por ID
    if (!response.ok || !data || data.length === 0) {
      const idNumerico = parseInt(corretorNomeOuId);
      if (!isNaN(idNumerico)) {
        response = await fetch(
          `${config.url}/rest/v1/Corretores?id=eq.${idNumerico}&select=*`,
          {
            method: 'GET',
            headers: headers
          }
        );
        data = await response.json();
      }
    }
    
    if (!response.ok || !data || data.length === 0) {
      return null;
    }
    
    const corretor = data[0];
    
    // Converter dados da tabela Corretores para o formato TestesComportamentais
    const testesData: TestesComportamentais = {
      id: corretor.id,
      corretor_id: corretor.id.toString(),
      corretor_nome: corretor.nm_corretor || '',
      corretor_email: corretor.email || undefined,
      
      // DISC
      disc_completo: !!(corretor.disc_tipo_principal && corretor.disc_data_teste),
      disc_resultado: corretor.disc_tipo_principal ? JSON.stringify({
        D: corretor.disc_percentual_d || 0,
        I: corretor.disc_percentual_i || 0,
        S: corretor.disc_percentual_s || 0,
        C: corretor.disc_percentual_c || 0,
        perfil_predominante: corretor.disc_tipo_principal
      }) : undefined,
      disc_data_conclusao: corretor.disc_data_teste,
      
      // Eneagrama
      eneagrama_completo: !!(corretor.eneagrama_tipo_principal && corretor.eneagrama_data_teste),
      eneagrama_resultado: corretor.eneagrama_tipo_principal ? JSON.stringify({
        tipo_principal: corretor.eneagrama_tipo_principal
      }) : undefined,
      eneagrama_data_conclusao: corretor.eneagrama_data_teste,
      
      // MBTI
      mbti_completo: !!(corretor.mbti_tipo && corretor.mbti_data_teste),
      mbti_tipo: corretor.mbti_tipo,
      mbti_link_resultado: undefined,
      mbti_data_conclusao: corretor.mbti_data_teste,
      
      // Status geral
      todos_completos: !!(
        corretor.disc_tipo_principal && corretor.disc_data_teste &&
        corretor.eneagrama_tipo_principal && corretor.eneagrama_data_teste &&
        corretor.mbti_tipo && corretor.mbti_data_teste
      ),
      data_inicio: corretor.created_at || new Date().toISOString(),
      data_conclusao_total: undefined,
      
      created_at: corretor.created_at,
      updated_at: corretor.updated_at
    };
    
    return testesData;
    
  } catch (error) {
    console.error('❌ Erro ao buscar testes:', error);
    return null;
  }
}

/**
 * Inicia os testes para um corretor
 */
export async function iniciarTestes(corretorId: string, corretorNome: string, corretorEmail?: string): Promise<boolean> {
  try {
    
    // Verificar se já existe registro
    const testesExistentes = await buscarTestesCorretor(corretorId);
    if (testesExistentes) {
      return true;
    }
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const novoRegistro: Partial<TestesComportamentais> = {
      corretor_id: corretorId,
      corretor_nome: corretorNome,
      corretor_email: corretorEmail,
      disc_completo: false,
      eneagrama_completo: false,
      mbti_completo: false,
      todos_completos: false,
      data_inicio: new Date().toISOString()
    };
    
    const response = await fetch(
      `${config.url}/rest/v1/testes_comportamentais`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(novoRegistro)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao iniciar testes: ${response.status}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao iniciar testes:', error);
    return false;
  }
}

/**
 * Salva resultado do teste DISC
 */
export async function salvarResultadoDISC(corretorId: string, resultado: ResultadoDISC): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const updates = {
      disc_completo: true,
      disc_resultado: JSON.stringify(resultado),
      disc_data_conclusao: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const response = await fetch(
      `${config.url}/rest/v1/testes_comportamentais?corretor_id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify(updates)
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao salvar DISC: ${response.status}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao salvar DISC:', error);
    return false;
  }
}

/**
 * Salva resultado do teste Eneagrama DIRETAMENTE na tabela Corretores
 * ✅ ATUALIZADO: Salva na fonte única de verdade (tabela Corretores)
 */
export async function salvarResultadoEneagrama(corretorId: string, resultado: ResultadoEneagrama): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Converter corretorId para número (ID da tabela Corretores)
    const idNumerico = parseInt(corretorId);
    if (isNaN(idNumerico)) {
      console.error('❌ ID do corretor deve ser numérico:', corretorId);
      return false;
    }
    
    // Preparar dados para atualizar na tabela Corretores
    const updates = {
      eneagrama_tipo_principal: resultado.tipo_principal,
      eneagrama_data_teste: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${idNumerico}`,
      {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify(updates)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao salvar Eneagrama: ${response.status} - ${errorText}`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao salvar Eneagrama:', error);
    return false;
  }
}

/**
 * Salva resultado do teste MBTI
 * ✅ ATUALIZADO: Salva TAMBÉM na tabela Corretores (fonte única de verdade)
 */
export async function salvarResultadoMBTI(corretorId: string, tipo: string, linkResultado: string): Promise<boolean> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // 1. Atualizar tabela testes_comportamentais (compatibilidade)
    const testes = await buscarTestesCorretor(corretorId);
    const todosCompletos = testes?.disc_completo && testes?.eneagrama_completo && true;
    
    const updates = {
      mbti_completo: true,
      mbti_tipo: tipo,
      mbti_link_resultado: linkResultado,
      mbti_data_conclusao: new Date().toISOString(),
      todos_completos: todosCompletos,
      data_conclusao_total: todosCompletos ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString()
    };
    
    const response = await fetch(
      `${config.url}/rest/v1/testes_comportamentais?corretor_id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify(updates)
      }
    );
    
    if (!response.ok) {
      console.warn('⚠️ Falha ao atualizar testes_comportamentais (pode não existir registro):', response.status);
    }
    
    // 2. ✅ CRÍTICO: Atualizar tabela Corretores (fonte única de verdade para verificarTestesCompletos)
    const idNumerico = parseInt(corretorId);
    if (!isNaN(idNumerico)) {
      
      const corretoresUpdates = {
        mbti_tipo: tipo,
        mbti_data_teste: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const corretoresResponse = await fetch(
        `${config.url}/rest/v1/Corretores?id=eq.${idNumerico}`,
        {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify(corretoresUpdates)
        }
      );
      
      if (!corretoresResponse.ok) {
        const errorText = await corretoresResponse.text();
        console.error('❌ Erro ao atualizar Corretores com MBTI:', corretoresResponse.status, errorText);
      } else {
      }
    } else {
      // Fallback: tentar buscar por nome
      const corretoresUpdates = {
        mbti_tipo: tipo,
        mbti_data_teste: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const corretoresResponse = await fetch(
        `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(corretorId)}`,
        {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify(corretoresUpdates)
        }
      );
      
      if (corretoresResponse.ok) {
      }
    }
    
    if (todosCompletos) {
    }
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao salvar MBTI:', error);
    return false;
  }
}

/**
 * Calcula o progresso dos testes (0-100%)
 * ATUALIZADO: Busca direto da tabela Corretores
 */
export async function calcularProgresso(corretorNomeOuId: string): Promise<number> {
  try {
    const testes = await buscarTestesCorretor(corretorNomeOuId);
    
    if (!testes) return 0;
    
    let completos = 0;
    if (testes.disc_completo) completos++;
    if (testes.eneagrama_completo) completos++;
    if (testes.mbti_completo) completos++;
    
    const progresso = Math.round((completos / 3) * 100);
    
    return progresso;
    
  } catch (error) {
    console.error('❌ Erro ao calcular progresso:', error);
    return 0;
  }
}

