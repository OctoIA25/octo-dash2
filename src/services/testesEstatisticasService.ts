/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço: Estatísticas dos Testes Comportamentais
 * Função: Buscar e processar estatísticas de DISC, Eneagrama e MBTI
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

// Interfaces de estatísticas
export interface DISCStats {
  totalCorretores: number;
  comTeste: number;
  percentualCompleto: number;
  distribuicao: {
    D: { count: number; percentual: number };
    I: { count: number; percentual: number };
    S: { count: number; percentual: number };
    C: { count: number; percentual: number };
  };
  corretoresPorTipo: {
    D: Array<{ id: number; nome: string; percentuais: any }>;
    I: Array<{ id: number; nome: string; percentuais: any }>;
    S: Array<{ id: number; nome: string; percentuais: any }>;
    C: Array<{ id: number; nome: string; percentuais: any }>;
  };
  mediasPercentuais: {
    D: number;
    I: number;
    S: number;
    C: number;
  };
}

export interface EneagramaStats {
  totalCorretores: number;
  comTeste: number;
  percentualCompleto: number;
  distribuicao: {
    [tipo: number]: { count: number; percentual: number };
  };
  corretoresPorTipo: {
    [tipo: number]: Array<{ id: number; nome: string; tipo: number }>;
  };
  tipoMaisComum: number;
  tipoMenosComum: number;
}

export interface MBTIStats {
  totalCorretores: number;
  comTeste: number;
  percentualCompleto: number;
  distribuicao: {
    [tipo: string]: { count: number; percentual: number };
  };
  corretoresPorTipo: {
    [tipo: string]: Array<{ id: number; nome: string; tipo: string; percentuais: any }>;
  };
  dimensoes: {
    Extroversion_Introversion: { E: number; I: number };
    Sensing_Intuition: { S: number; N: number };
    Thinking_Feeling: { T: number; F: number };
    Judging_Perceiving: { J: number; P: number };
  };
  tipoMaisComum: string;
}

/**
 * Buscar estatísticas do teste DISC
 */
export async function buscarEstatisticasDISC(tenantId?: string): Promise<DISCStats> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : '';
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?select=id,nm_corretor,disc_tipo_principal,disc_percentual_d,disc_percentual_i,disc_percentual_s,disc_percentual_c&order=nm_corretor.asc${tenantFilter}`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (!response.ok) {
      throw new Error(`Erro ao buscar estatísticas DISC: ${response.status}`);
    }

    const data = await response.json();
    
    // Filtrar apenas corretores com teste completo
    const comTeste = data.filter((c: any) => c.disc_tipo_principal);
    
    // Calcular distribuição
    const distribuicao = { D: 0, I: 0, S: 0, C: 0 };
    const corretoresPorTipo: any = { D: [], I: [], S: [], C: [] };
    
    comTeste.forEach((c: any) => {
      const tipo = c.disc_tipo_principal as 'D' | 'I' | 'S' | 'C';
      distribuicao[tipo]++;
      corretoresPorTipo[tipo].push({
        id: c.id,
        nome: c.nm_corretor || 'Sem nome',
        percentuais: {
          D: c.disc_percentual_d || 0,
          I: c.disc_percentual_i || 0,
          S: c.disc_percentual_s || 0,
          C: c.disc_percentual_c || 0
        }
      });
    });
    
    // Calcular médias de percentuais
    const mediasPercentuais = {
      D: comTeste.reduce((sum: number, c: any) => sum + (c.disc_percentual_d || 0), 0) / (comTeste.length || 1),
      I: comTeste.reduce((sum: number, c: any) => sum + (c.disc_percentual_i || 0), 0) / (comTeste.length || 1),
      S: comTeste.reduce((sum: number, c: any) => sum + (c.disc_percentual_s || 0), 0) / (comTeste.length || 1),
      C: comTeste.reduce((sum: number, c: any) => sum + (c.disc_percentual_c || 0), 0) / (comTeste.length || 1)
    };
    
    const stats: DISCStats = {
      totalCorretores: data.length,
      comTeste: comTeste.length,
      percentualCompleto: (comTeste.length / data.length) * 100,
      distribuicao: {
        D: { 
          count: distribuicao.D, 
          percentual: (distribuicao.D / comTeste.length) * 100 
        },
        I: { 
          count: distribuicao.I, 
          percentual: (distribuicao.I / comTeste.length) * 100 
        },
        S: { 
          count: distribuicao.S, 
          percentual: (distribuicao.S / comTeste.length) * 100 
        },
        C: { 
          count: distribuicao.C, 
          percentual: (distribuicao.C / comTeste.length) * 100 
        }
      },
      corretoresPorTipo,
      mediasPercentuais
    };
    
    return stats;
    
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas DISC:', error);
    throw error;
  }
}

/**
 * Buscar estatísticas do teste Eneagrama
 */
export async function buscarEstatisticasEneagrama(tenantId?: string): Promise<EneagramaStats> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : '';
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?select=id,nm_corretor,eneagrama_tipo_principal&order=nm_corretor.asc${tenantFilter}`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (!response.ok) {
      throw new Error(`Erro ao buscar estatísticas Eneagrama: ${response.status}`);
    }

    const data = await response.json();
    
    // Filtrar apenas corretores com teste completo
    const comTeste = data.filter((c: any) => c.eneagrama_tipo_principal);
    
    // Calcular distribuição
    const distribuicao: any = {};
    const corretoresPorTipo: any = {};
    
    comTeste.forEach((c: any) => {
      const tipo = c.eneagrama_tipo_principal;
      if (!distribuicao[tipo]) {
        distribuicao[tipo] = 0;
        corretoresPorTipo[tipo] = [];
      }
      distribuicao[tipo]++;
      corretoresPorTipo[tipo].push({
        id: c.id,
        nome: c.nm_corretor || 'Sem nome',
        tipo: tipo
      });
    });
    
    // Encontrar tipo mais e menos comum
    let tipoMaisComum = 1;
    let tipoMenosComum = 1;
    let maxCount = 0;
    let minCount = Infinity;
    
    Object.entries(distribuicao).forEach(([tipo, count]) => {
      const c = count as number;
      if (c > maxCount) {
        maxCount = c;
        tipoMaisComum = parseInt(tipo);
      }
      if (c < minCount) {
        minCount = c;
        tipoMenosComum = parseInt(tipo);
      }
    });
    
    // Converter para formato com percentual
    const distribuicaoComPercentual: any = {};
    Object.entries(distribuicao).forEach(([tipo, count]) => {
      distribuicaoComPercentual[tipo] = {
        count: count,
        percentual: ((count as number) / comTeste.length) * 100
      };
    });
    
    const stats: EneagramaStats = {
      totalCorretores: data.length,
      comTeste: comTeste.length,
      percentualCompleto: (comTeste.length / data.length) * 100,
      distribuicao: distribuicaoComPercentual,
      corretoresPorTipo,
      tipoMaisComum,
      tipoMenosComum
    };
    
    return stats;
    
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas Eneagrama:', error);
    throw error;
  }
}

/**
 * Buscar estatísticas do teste MBTI
 */
export async function buscarEstatisticasMBTI(tenantId?: string): Promise<MBTIStats> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : '';
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity&order=nm_corretor.asc${tenantFilter}`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (!response.ok) {
      throw new Error(`Erro ao buscar estatísticas MBTI: ${response.status}`);
    }

    const data = await response.json();
    
    // Filtrar apenas corretores com teste completo
    const comTeste = data.filter((c: any) => c.mbti_tipo);
    
    // Calcular distribuição
    const distribuicao: any = {};
    const corretoresPorTipo: any = {};
    
    comTeste.forEach((c: any) => {
      // Extrair apenas os 4 primeiros caracteres (INTJ, ENFP, etc)
      const tipoBase = c.mbti_tipo.substring(0, 4).toUpperCase();
      
      if (!distribuicao[tipoBase]) {
        distribuicao[tipoBase] = 0;
        corretoresPorTipo[tipoBase] = [];
      }
      distribuicao[tipoBase]++;
      corretoresPorTipo[tipoBase].push({
        id: c.id,
        nome: c.nm_corretor || 'Sem nome',
        tipo: c.mbti_tipo,
        percentuais: {
          Mind: c.mbti_percent_mind ?? 50,
          Energy: c.mbti_percent_energy ?? 50,
          Nature: c.mbti_percent_nature ?? 50,
          Tactics: c.mbti_percent_tactics ?? 50,
          Identity: c.mbti_percent_identity ?? 50
        }
      });
    });
    
    // Calcular distribuição por dimensão
    const dimensoes = {
      Extroversion_Introversion: { E: 0, I: 0 },
      Sensing_Intuition: { S: 0, N: 0 },
      Thinking_Feeling: { T: 0, F: 0 },
      Judging_Perceiving: { J: 0, P: 0 }
    };
    
    comTeste.forEach((c: any) => {
      const tipo = c.mbti_tipo.substring(0, 4).toUpperCase();
      const [ei, sn, tf, jp] = tipo.split('');
      
      if (ei === 'E') dimensoes.Extroversion_Introversion.E++;
      if (ei === 'I') dimensoes.Extroversion_Introversion.I++;
      
      if (sn === 'S') dimensoes.Sensing_Intuition.S++;
      if (sn === 'N') dimensoes.Sensing_Intuition.N++;
      
      if (tf === 'T') dimensoes.Thinking_Feeling.T++;
      if (tf === 'F') dimensoes.Thinking_Feeling.F++;
      
      if (jp === 'J') dimensoes.Judging_Perceiving.J++;
      if (jp === 'P') dimensoes.Judging_Perceiving.P++;
    });
    
    // Encontrar tipo mais comum
    let tipoMaisComum = 'INTJ';
    let maxCount = 0;
    Object.entries(distribuicao).forEach(([tipo, count]) => {
      if ((count as number) > maxCount) {
        maxCount = count as number;
        tipoMaisComum = tipo;
      }
    });
    
    // Converter para formato com percentual
    const distribuicaoComPercentual: any = {};
    Object.entries(distribuicao).forEach(([tipo, count]) => {
      distribuicaoComPercentual[tipo] = {
        count: count,
        percentual: ((count as number) / comTeste.length) * 100
      };
    });
    
    const stats: MBTIStats = {
      totalCorretores: data.length,
      comTeste: comTeste.length,
      percentualCompleto: (comTeste.length / data.length) * 100,
      distribuicao: distribuicaoComPercentual,
      corretoresPorTipo,
      dimensoes,
      tipoMaisComum
    };
    
    return stats;
    
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas MBTI:', error);
    throw error;
  }
}

