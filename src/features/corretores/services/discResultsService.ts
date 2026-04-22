/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para buscar e visualizar resultados DISC dos corretores
 * Integrado com a agente ELAINE
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

export interface DISCResultData {
  id: string;
  corretor_id: number;
  corretor_nome: string;
  corretor_email?: string;
  tipo_principal: 'D' | 'I' | 'S' | 'C';
  percentual_d: number;
  percentual_i: number;
  percentual_s: number;
  percentual_c: number;
  perfis_dominantes: string[];
  data_teste: string;
  versao_teste: number;
  created_at: string;
}

export interface DISCCorretorProfile {
  corretor_id: number;
  corretor_nome: string;
  corretor_email?: string;
  tipo_principal: 'D' | 'I' | 'S' | 'C';
  percentuais: {
    D: number;
    I: number;
    S: number;
    C: number;
  };
  perfis_dominantes: string[];
  data_teste: string;
  historico_testes: number; // Quantidade de testes realizados
}

/**
 * Buscar resultado DISC mais recente de um corretor específico
 */
export async function buscarResultadoDISCCorretor(
  corretorId: number
): Promise<DISCResultData | null> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Buscar o resultado mais recente
    const response = await fetch(
      `${config.url}/rest/v1/disc_test_results?corretor_id=eq.${corretorId}&order=data_teste.desc&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar resultado: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data || data.length === 0) {
      return null;
    }
    
    const result = data[0];
    
    return {
      id: result.id,
      corretor_id: result.corretor_id,
      corretor_nome: result.corretor_nome,
      corretor_email: result.corretor_email,
      tipo_principal: result.tipo_principal,
      percentual_d: parseFloat(result.percentual_d),
      percentual_i: parseFloat(result.percentual_i),
      percentual_s: parseFloat(result.percentual_s),
      percentual_c: parseFloat(result.percentual_c),
      perfis_dominantes: result.perfis_dominantes || [],
      data_teste: result.data_teste,
      versao_teste: result.versao_teste,
      created_at: result.created_at
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar resultado DISC:', error);
    return null;
  }
}

/**
 * Buscar histórico completo de testes DISC de um corretor
 */
export async function buscarHistoricoDISC(
  corretorId: number
): Promise<DISCResultData[]> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const response = await fetch(
      `${config.url}/rest/v1/disc_test_results?corretor_id=eq.${corretorId}&order=data_teste.desc`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar histórico: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.map((item: any) => ({
      id: item.id,
      corretor_id: item.corretor_id,
      corretor_nome: item.corretor_nome,
      corretor_email: item.corretor_email,
      tipo_principal: item.tipo_principal,
      percentual_d: parseFloat(item.percentual_d),
      percentual_i: parseFloat(item.percentual_i),
      percentual_s: parseFloat(item.percentual_s),
      percentual_c: parseFloat(item.percentual_c),
      perfis_dominantes: item.perfis_dominantes || [],
      data_teste: item.data_teste,
      versao_teste: item.versao_teste,
      created_at: item.created_at
    }));
    
  } catch (error) {
    console.error('❌ Erro ao buscar histórico DISC:', error);
    return [];
  }
}

/**
 * Buscar perfil DISC formatado para a agente ELAINE
 */
export async function buscarPerfilDiscParaELAINE(
  corretorId: number
): Promise<DISCCorretorProfile | null> {
  try {
    const resultado = await buscarResultadoDISCCorretor(corretorId);
    if (!resultado) return null;
    
    const historico = await buscarHistoricoDISC(corretorId);
    
    return {
      corretor_id: resultado.corretor_id,
      corretor_nome: resultado.corretor_nome,
      corretor_email: resultado.corretor_email,
      tipo_principal: resultado.tipo_principal,
      percentuais: {
        D: resultado.percentual_d,
        I: resultado.percentual_i,
        S: resultado.percentual_s,
        C: resultado.percentual_c
      },
      perfis_dominantes: resultado.perfis_dominantes,
      data_teste: resultado.data_teste,
      historico_testes: historico.length
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar perfil para ELAINE:', error);
    return null;
  }
}

/**
 * Buscar todos os corretores com testes DISC realizados
 */
export async function buscarCorretoresComDISC(tenantId?: string): Promise<DISCCorretorProfile[]> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Buscar todos os testes mais recentes agrupados por corretor
    // Note: disc_test_results não tem tenant_id direto; o isolamento é garantido pela RLS via Corretores
    const response = await fetch(
      `${config.url}/rest/v1/disc_test_results?order=data_teste.desc`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar corretores: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Agrupar por corretor (pegar o mais recente de cada um)
    const mapaCorretores: { [key: number]: DISCResultData } = {};
    
    data.forEach((item: any) => {
      if (!mapaCorretores[item.corretor_id]) {
        mapaCorretores[item.corretor_id] = {
          id: item.id,
          corretor_id: item.corretor_id,
          corretor_nome: item.corretor_nome,
          corretor_email: item.corretor_email,
          tipo_principal: item.tipo_principal,
          percentual_d: parseFloat(item.percentual_d),
          percentual_i: parseFloat(item.percentual_i),
          percentual_s: parseFloat(item.percentual_s),
          percentual_c: parseFloat(item.percentual_c),
          perfis_dominantes: item.perfis_dominantes || [],
          data_teste: item.data_teste,
          versao_teste: item.versao_teste,
          created_at: item.created_at
        };
      }
    });
    
    // Converter para array de perfis
    const perfis = await Promise.all(
      Object.values(mapaCorretores).map(async (resultado) => {
        const historico = await buscarHistoricoDISC(resultado.corretor_id);
        return {
          corretor_id: resultado.corretor_id,
          corretor_nome: resultado.corretor_nome,
          corretor_email: resultado.corretor_email,
          tipo_principal: resultado.tipo_principal,
          percentuais: {
            D: resultado.percentual_d,
            I: resultado.percentual_i,
            S: resultado.percentual_s,
            C: resultado.percentual_c
          },
          perfis_dominantes: resultado.perfis_dominantes,
          data_teste: resultado.data_teste,
          historico_testes: historico.length
        };
      })
    );
    
    return perfis;
    
  } catch (error) {
    console.error('❌ Erro ao buscar corretores com DISC:', error);
    return [];
  }
}

/**
 * Buscar corretores por tipo DISC principal
 */
export async function buscarCorretoresPorTipoDISC(
  tipoDISC: 'D' | 'I' | 'S' | 'C'
): Promise<DISCCorretorProfile[]> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const response = await fetch(
      `${config.url}/rest/v1/disc_test_results?tipo_principal=eq.${tipoDISC}&order=data_teste.desc`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar corretores por tipo: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Agrupar por corretor
    const mapaCorretores: { [key: number]: DISCResultData } = {};
    
    data.forEach((item: any) => {
      if (!mapaCorretores[item.corretor_id]) {
        mapaCorretores[item.corretor_id] = {
          id: item.id,
          corretor_id: item.corretor_id,
          corretor_nome: item.corretor_nome,
          corretor_email: item.corretor_email,
          tipo_principal: item.tipo_principal,
          percentual_d: parseFloat(item.percentual_d),
          percentual_i: parseFloat(item.percentual_i),
          percentual_s: parseFloat(item.percentual_s),
          percentual_c: parseFloat(item.percentual_c),
          perfis_dominantes: item.perfis_dominantes || [],
          data_teste: item.data_teste,
          versao_teste: item.versao_teste,
          created_at: item.created_at
        };
      }
    });
    
    const perfis = Object.values(mapaCorretores).map((resultado) => ({
      corretor_id: resultado.corretor_id,
      corretor_nome: resultado.corretor_nome,
      corretor_email: resultado.corretor_email,
      tipo_principal: resultado.tipo_principal,
      percentuais: {
        D: resultado.percentual_d,
        I: resultado.percentual_i,
        S: resultado.percentual_s,
        C: resultado.percentual_c
      },
      perfis_dominantes: resultado.perfis_dominantes,
      data_teste: resultado.data_teste,
      historico_testes: 1
    }));
    
    return perfis;
    
  } catch (error) {
    console.error('❌ Erro ao buscar corretores por tipo:', error);
    return [];
  }
}

/**
 * Análise de compatibilidade de equipe por perfil DISC
 */
export interface AnaliseDISCEquipe {
  tipoDominante: 'D' | 'I' | 'S' | 'C';
  corretoresNesteTipo: DISCCorretorProfile[];
  percentualEquipe: number;
  forcasEquipe: string[];
  pontosDeAtenção: string[];
}

export async function analisarCompatibilidadeEquipe(
  corretoresIds: number[]
): Promise<AnaliseDISCEquipe[]> {
  try {
    
    // Buscar perfis de todos os corretores
    const perfis = await Promise.all(
      corretoresIds.map(id => buscarPerfilDiscParaELAINE(id))
    );
    
    const perfisFiltrados = perfis.filter((p) => p !== null) as DISCCorretorProfile[];
    
    if (perfisFiltrados.length === 0) {
      throw new Error('Nenhum perfil DISC encontrado');
    }
    
    // Agrupar por tipo
    const porTipo: { [key in 'D' | 'I' | 'S' | 'C']: DISCCorretorProfile[] } = {
      D: [],
      I: [],
      S: [],
      C: []
    };
    
    perfisFiltrados.forEach((perfil) => {
      porTipo[perfil.tipo_principal].push(perfil);
    });
    
    // Análises de compatibilidade
    const analises: AnaliseDISCEquipe[] = [
      {
        tipoDominante: 'D',
        corretoresNesteTipo: porTipo.D,
        percentualEquipe: (porTipo.D.length / perfisFiltrados.length) * 100,
        forcasEquipe: ['Liderança', 'Decisão rápida', 'Orientação a resultados'],
        pontosDeAtenção: ['Pode ser agressivo', 'Pouca empatia', 'Impaciente com detalhes']
      },
      {
        tipoDominante: 'I',
        corretoresNesteTipo: porTipo.I,
        percentualEquipe: (porTipo.I.length / perfisFiltrados.length) * 100,
        forcasEquipe: ['Comunicação', 'Entusiasmo', 'Relacionamento'],
        pontosDeAtenção: ['Falta de foco', 'Emotivo', 'Desorganizado']
      },
      {
        tipoDominante: 'S',
        corretoresNesteTipo: porTipo.S,
        percentualEquipe: (porTipo.S.length / perfisFiltrados.length) * 100,
        forcasEquipe: ['Estabilidade', 'Confiabilidade', 'Trabalho em equipe'],
        pontosDeAtenção: ['Resistência a mudanças', 'Lento', 'Passivo']
      },
      {
        tipoDominante: 'C',
        corretoresNesteTipo: porTipo.C,
        percentualEquipe: (porTipo.C.length / perfisFiltrados.length) * 100,
        forcasEquipe: ['Precisão', 'Análise', 'Atenção a detalhes'],
        pontosDeAtenção: ['Perfeccionista', 'Crítico', 'Procrastinação']
      }
    ];
    
    return analises;
    
  } catch (error) {
    console.error('❌ Erro ao analisar compatibilidade:', error);
    return [];
  }
}

