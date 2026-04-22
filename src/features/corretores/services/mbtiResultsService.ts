/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para buscar e visualizar resultados MBTI dos corretores
 * Integrado com a agente ELAINE
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

export interface MBTICorretorProfile {
  corretor_id: number;
  corretor_nome: string;
  corretor_email?: string;
  tipo_mbti: string; // Ex: "INTJ-A", "ENFP-T"
  descricao: string;
  cor: string;
  emoji: string;
  percentuais: {
    Mind: number;
    Energy: number;
    Nature: number;
    Tactics: number;
    Identity: number;
  };
  data_teste: string;
  historico_testes: number;
}

// Mapeamento de cores e emojis por tipo MBTI
const MBTI_METADATA: Record<string, { cor: string; emoji: string; descricao: string }> = {
  // Analistas
  'INTJ': { cor: '#6366f1', emoji: '🧠', descricao: 'Arquiteto - Estratégico e inovador' },
  'INTP': { cor: '#8b5cf6', emoji: '🔬', descricao: 'Lógico - Curioso e inventivo' },
  'ENTJ': { cor: '#dc2626', emoji: '👔', descricao: 'Comandante - Líder natural' },
  'ENTP': { cor: '#f59e0b', emoji: '💡', descricao: 'Inovador - Criativo e estratégico' },
  
  // Diplomatas
  'INFJ': { cor: '#10b981', emoji: '🌟', descricao: 'Advogado - Inspirador e idealista' },
  'INFP': { cor: '#06b6d4', emoji: '🎨', descricao: 'Mediador - Empático e criativo' },
  'ENFJ': { cor: '#14b8a6', emoji: '🤝', descricao: 'Protagonista - Carismático e motivador' },
  'ENFP': { cor: '#f97316', emoji: '✨', descricao: 'Ativista - Entusiasta e criativo' },
  
  // Sentinelas
  'ISTJ': { cor: '#64748b', emoji: '📋', descricao: 'Logístico - Prático e confiável' },
  'ISFJ': { cor: '#6366f1', emoji: '🛡️', descricao: 'Defensor - Dedicado e protetor' },
  'ESTJ': { cor: '#7c3aed', emoji: '⚖️', descricao: 'Executivo - Organizado e direto' },
  'ESFJ': { cor: '#ec4899', emoji: '💝', descricao: 'Cônsul - Prestativo e popular' },
  
  // Exploradores
  'ISTP': { cor: '#78716c', emoji: '🔧', descricao: 'Virtuoso - Prático e explorador' },
  'ISFP': { cor: '#a855f7', emoji: '🎭', descricao: 'Aventureiro - Flexível e charmoso' },
  'ESTP': { cor: '#ef4444', emoji: '⚡', descricao: 'Empreendedor - Energético e perceptivo' },
  'ESFP': { cor: '#f59e0b', emoji: '🎉', descricao: 'Animador - Espontâneo e entusiasmado' }
};

/**
 * Buscar todos os corretores que fizeram o teste de MBTI
 */
export async function buscarCorretoresComMBTI(tenantId?: string): Promise<MBTICorretorProfile[]> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : '';
    // Estratégia 1: Buscar com filtro not.is.null
    let url = `${config.url}/rest/v1/Corretores?select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity,mbti_data_teste&mbti_tipo=not.is.null&order=mbti_data_teste.desc${tenantFilter}`;
    
    
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
      url = `${config.url}/rest/v1/Corretores?select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity,mbti_data_teste&order=id.desc&limit=1000${tenantFilter}`;
      
      
      response = await fetch(url, {
        method: 'GET',
        headers: headers
      });
      
      if (response.ok) {
        const allData = await response.json();
        
        // Filtrar no cliente: apenas quem tem mbti_tipo preenchido
        data = (allData || []).filter((c: any) => 
          c.mbti_tipo !== null && 
          c.mbti_tipo !== undefined &&
          typeof c.mbti_tipo === 'string' &&
          c.mbti_tipo.length >= 4
        );
        
        
        // Ordenar por data do teste (mais recente primeiro)
        data.sort((a: any, b: any) => {
          const dateA = a.mbti_data_teste ? new Date(a.mbti_data_teste).getTime() : 0;
          const dateB = b.mbti_data_teste ? new Date(b.mbti_data_teste).getTime() : 0;
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
    const perfis: MBTICorretorProfile[] = data
      .filter((corretor: any) => {
        // Validar que o corretor tem tipo MBTI válido
        const tipoValido = corretor.mbti_tipo !== null && 
                          corretor.mbti_tipo !== undefined &&
                          typeof corretor.mbti_tipo === 'string' &&
                          corretor.mbti_tipo.length >= 4;
        
        if (!tipoValido) {
          console.warn(`⚠️ Corretor ${corretor.id} (${corretor.nm_corretor}) tem tipo MBTI inválido:`, corretor.mbti_tipo);
        }
        
        return tipoValido;
      })
      .map((corretor: any) => {
        // Extrair o tipo base (sem -A/-T)
        const tipoBase = corretor.mbti_tipo.substring(0, 4).toUpperCase();
        const metadata = MBTI_METADATA[tipoBase] || {
          cor: '#6b7280',
          emoji: '❓',
          descricao: corretor.mbti_tipo
        };
        
        return {
          corretor_id: corretor.id,
          corretor_nome: corretor.nm_corretor || 'Corretor sem nome',
          corretor_email: undefined,
          tipo_mbti: corretor.mbti_tipo,
          descricao: metadata.descricao,
          cor: metadata.cor,
          emoji: metadata.emoji,
          percentuais: {
            Mind: corretor.mbti_percent_mind ?? 50,
            Energy: corretor.mbti_percent_energy ?? 50,
            Nature: corretor.mbti_percent_nature ?? 50,
            Tactics: corretor.mbti_percent_tactics ?? 50,
            Identity: corretor.mbti_percent_identity ?? 50
          },
          data_teste: corretor.mbti_data_teste || new Date().toISOString(),
          historico_testes: 1 // Por enquanto, assumimos 1 teste
        };
      });
    
    
    if (perfis.length > 0) {
      perfis.forEach((p, i) => {
      });
    }
    
    return perfis;
    
  } catch (error) {
    console.error('❌ Erro ao buscar corretores com MBTI:', error);
    return [];
  }
}

/**
 * Buscar resultado MBTI de um corretor específico por ID
 */
export async function buscarResultadoMBTICorretor(
  corretorId: number
): Promise<MBTICorretorProfile | null> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity,mbti_data_teste`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar resultado: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data || data.length === 0 || !data[0].mbti_tipo) {
      return null;
    }
    
    const corretor = data[0];
    const tipoBase = corretor.mbti_tipo.substring(0, 4).toUpperCase();
    const metadata = MBTI_METADATA[tipoBase] || {
      cor: '#6b7280',
      emoji: '❓',
      descricao: corretor.mbti_tipo
    };
    
    const perfil: MBTICorretorProfile = {
      corretor_id: corretor.id,
      corretor_nome: corretor.nm_corretor || 'Corretor sem nome',
      corretor_email: undefined,
      tipo_mbti: corretor.mbti_tipo,
      descricao: metadata.descricao,
      cor: metadata.cor,
      emoji: metadata.emoji,
      percentuais: {
        Mind: corretor.mbti_percent_mind || 50,
        Energy: corretor.mbti_percent_energy || 50,
        Nature: corretor.mbti_percent_nature || 50,
        Tactics: corretor.mbti_percent_tactics || 50,
        Identity: corretor.mbti_percent_identity || 50
      },
      data_teste: corretor.mbti_data_teste || new Date().toISOString(),
      historico_testes: 1
    };
    
    return perfil;
    
  } catch (error) {
    console.error('❌ Erro ao buscar resultado MBTI:', error);
    return null;
  }
}

/**
 * Buscar tipo MBTI de um corretor específico por nome
 * Retorna apenas o tipo MBTI (ex: "ENFP-T")
 */
export async function buscarMBTICorretor(
  corretorNome: string,
  tenantId?: string
): Promise<{ tipo_mbti: string } | null> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : '';
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(corretorNome)}&select=mbti_tipo${tenantFilter}`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar MBTI: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data || data.length === 0 || !data[0].mbti_tipo) {
      return null;
    }
    
    return { tipo_mbti: data[0].mbti_tipo };
    
  } catch (error) {
    console.error('❌ Erro ao buscar tipo MBTI:', error);
    return null;
  }
}

