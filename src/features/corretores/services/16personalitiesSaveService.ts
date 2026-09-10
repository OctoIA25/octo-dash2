/**
 * Serviço para salvar dados do 16Personalities no Supabase
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';
import { DadosExtraidos16P } from './16personalitiesExtractor';

export interface ResultadoSalvamento {
  sucesso: boolean;
  mensagem: string;
  corretorId?: string;
}

/**
 * Salva ou atualiza dados do 16Personalities na tabela de corretores
 */
export async function salvarResultado16Personalities(
  corretorIdentificador: string,
  dados: DadosExtraidos16P
): Promise<ResultadoSalvamento> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Buscar o corretor na tabela Corretores
    // Estratégia 1: por email (identificador pode ser email do AuthContext)
    // Estratégia 2: por nome (compatibilidade)
    // Estratégia 3: por nome parcial extraído do email
    let corretores: any[] = [];
    
    // Tentar por email primeiro
    if (corretorIdentificador.includes('@')) {
      const emailResponse = await fetch(
        `${config.url}/rest/v1/Corretores?email=ilike.${encodeURIComponent(corretorIdentificador)}&select=id,nm_corretor&limit=1`,
        { method: 'GET', headers }
      );
      if (emailResponse.ok) {
        corretores = await emailResponse.json();
      }
    }
    
    // Fallback: buscar por nome
    if (!corretores || corretores.length === 0) {
      const nameResponse = await fetch(
        `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(corretorIdentificador)}&select=id,nm_corretor&limit=1`,
        { method: 'GET', headers }
      );
      if (nameResponse.ok) {
        corretores = await nameResponse.json();
      }
    }
    
    // Fallback: nome parcial do email
    if ((!corretores || corretores.length === 0) && corretorIdentificador.includes('@')) {
      const nomeFromEmail = corretorIdentificador.split('@')[0]?.replace(/[._-]/g, ' ');
      if (nomeFromEmail && nomeFromEmail.length > 2) {
        const partialResponse = await fetch(
          `${config.url}/rest/v1/Corretores?nm_corretor=ilike.*${encodeURIComponent(nomeFromEmail)}*&select=id,nm_corretor&limit=1`,
          { method: 'GET', headers }
        );
        if (partialResponse.ok) {
          corretores = await partialResponse.json();
        }
      }
    }
    
    
    if (!corretores || corretores.length === 0) {
      throw new Error('Corretor não encontrado na base de dados.');
    }
    
    const corretor = corretores[0];
    const corretorId = corretor.id;
    
    
    // Montar objeto de atualização
    const updateData = {
      // URLs e metadados
      url_resultado_16personalities: dados.url,
      codigo_teste_16personalities: dados.codigoTeste,
      tipo_16p_codigo: dados.tipoCodigo,
      tipo_16p_nome: dados.tipoNome,
      tipo_16p_grupo: dados.tipoGrupo,
      tipo_16p_descricao: dados.tipoDescricao,
      genero_informado_16p: dados.genero,
      
      // Atualizar também as colunas MBTI existentes (compatibilidade)
      mbti_tipo: dados.tipoCodigo,
      
      // Letra e lado de cada dimensão, derivados do código do tipo.
      //
      // As colunas de percentual (percentual_* e mbti_percent_*) são gravadas
      // como null de propósito: o valor que ia aqui era constante derivada da
      // própria letra (55/45), não medição. Escrever null também limpa o valor
      // fabricado de quem reimportar. As colunas ficam no banco por
      // compatibilidade — nenhuma tela lê mais.
      percentual_energia: null,
      lado_energia: dados.dimensoes.energia.lado,
      letra_energia: dados.dimensoes.energia.letra,
      mbti_percent_mind: null,

      percentual_mente: null,
      lado_mente: dados.dimensoes.mente.lado,
      letra_mente: dados.dimensoes.mente.letra,
      mbti_percent_energy: null,

      percentual_natureza: null,
      lado_natureza: dados.dimensoes.natureza.lado,
      letra_natureza: dados.dimensoes.natureza.letra,
      mbti_percent_nature: null,

      percentual_abordagem: null,
      lado_abordagem: dados.dimensoes.abordagem.lado,
      letra_abordagem: dados.dimensoes.abordagem.letra,
      mbti_percent_tactics: null,

      percentual_identidade: null,
      lado_identidade: dados.dimensoes.identidade.lado,
      letra_identidade: dados.dimensoes.identidade.letra,
      mbti_percent_identity: null,

      // Timestamps
      data_importacao_16personalities: new Date().toISOString(),
      mbti_data_teste: new Date().toISOString()
    };
    
    
    // Fazer request para atualizar no Supabase
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro na resposta do Supabase:', response.status, errorText);
      throw new Error(`Erro ao salvar no Supabase: ${response.status} - ${errorText}`);
    }
    
    const resultado = await response.json();
    
    return {
      sucesso: true,
      mensagem: 'Resultado do 16Personalities importado com sucesso!',
      corretorId
    };
    
  } catch (error) {
    console.error('❌ Erro ao salvar resultado 16Personalities:', error);
    return {
      sucesso: false,
      mensagem: error instanceof Error ? error.message : 'Erro desconhecido ao salvar dados'
    };
  }
}

/**
 * Busca dados atuais do 16Personalities de um corretor
 */
export async function buscarDados16Personalities(corretorIdentificador: string) {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    const selectFields = 'url_resultado_16personalities,tipo_16p_codigo,tipo_16p_nome,tipo_16p_grupo,data_importacao_16personalities';
    
    let dados: any[] = [];
    
    // Tentar por email primeiro
    if (corretorIdentificador.includes('@')) {
      const response = await fetch(
        `${config.url}/rest/v1/Corretores?email=ilike.${encodeURIComponent(corretorIdentificador)}&select=${selectFields}&limit=1`,
        { method: 'GET', headers }
      );
      if (response.ok) {
        dados = await response.json();
      }
    }
    
    // Fallback: buscar por nome
    if (!dados || dados.length === 0) {
      const response = await fetch(
        `${config.url}/rest/v1/Corretores?nm_corretor=ilike.${encodeURIComponent(corretorIdentificador)}&select=${selectFields}&limit=1`,
        { method: 'GET', headers }
      );
      if (response.ok) {
        dados = await response.json();
      }
    }
    
    if (dados && dados.length > 0) {
      return dados[0];
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Erro ao buscar dados 16Personalities:', error);
    return null;
  }
}

/**
 * Verifica se o corretor já tem dados do 16Personalities
 */
export async function verificarImportacaoExistente(corretorIdentificador: string): Promise<boolean> {
  const dados = await buscarDados16Personalities(corretorIdentificador);
  return dados !== null && dados.url_resultado_16personalities !== null;
}

