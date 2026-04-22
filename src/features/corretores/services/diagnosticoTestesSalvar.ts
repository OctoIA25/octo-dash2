/**
 * 🔧 DIAGNÓSTICO COMPLETO DE TESTES - SALVAR E BUSCAR
 * Execute no console do navegador para diagnosticar problemas
 * 
 * 💡 COMO USAR:
 * 1. Abra o DevTools (F12)
 * 2. Vá na aba Console
 * 3. Digite: await diagnosticarTesteCompleto(68, 'eneagrama') // ou 'mbti' ou 'disc'
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

/**
 * Diagnóstico completo de um teste específico
 */
export async function diagnosticarTesteCompleto(
  corretorId: number, 
  tipoTeste: 'eneagrama' | 'mbti' | 'disc'
): Promise<void> {
  
  try {
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    
    // 1. Verificar se o corretor existe
    const corretorUrl = `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=id,nm_corretor`;
    
    const corretorResponse = await fetch(corretorUrl, {
      method: 'GET',
      headers: headers
    });
    
    if (!corretorResponse.ok) {
      console.error('❌ Erro ao buscar corretor:', corretorResponse.status, corretorResponse.statusText);
      const errorText = await corretorResponse.text();
      console.error('❌ Detalhes:', errorText);
      return;
    }
    
    const corretorData = await corretorResponse.json();
    
    if (!corretorData || corretorData.length === 0) {
      console.error('❌ Corretor não encontrado no banco de dados!');
      return;
    }
    
    
    // 2. Buscar dados do teste específico
    
    let selectFields = '';
    let campoChave = '';
    
    switch (tipoTeste) {
      case 'eneagrama':
        selectFields = 'id,nm_corretor,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9,eneagrama_data_teste';
        campoChave = 'eneagrama_tipo_principal';
        break;
      case 'mbti':
        selectFields = 'id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity,mbti_data_teste';
        campoChave = 'mbti_tipo';
        break;
      case 'disc':
        selectFields = 'id,nm_corretor,disc_tipo_principal,disc_percentual_d,disc_percentual_i,disc_percentual_s,disc_percentual_c,disc_perfis_dominantes,disc_data_teste';
        campoChave = 'disc_tipo_principal';
        break;
    }
    
    const testeUrl = `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=${selectFields}`;
    
    const testeResponse = await fetch(testeUrl, {
      method: 'GET',
      headers: headers
    });
    
    if (!testeResponse.ok) {
      console.error('❌ Erro ao buscar teste:', testeResponse.status, testeResponse.statusText);
      const errorText = await testeResponse.text();
      console.error('❌ Detalhes:', errorText);
      return;
    }
    
    const testeData = await testeResponse.json();
    
    
    if (!testeData || testeData.length === 0) {
      console.error('❌ Nenhum dado retornado!');
      return;
    }
    
    const dados = testeData[0];
    
    // 3. Validar se o teste foi salvo
    
    const testeSalvo = dados[campoChave] !== null && dados[campoChave] !== undefined;
    
    if (testeSalvo) {
      
      // Exibir informações específicas
      switch (tipoTeste) {
        case 'eneagrama':
          for (let i = 1; i <= 9; i++) {
          }
          break;
        case 'mbti':
          break;
        case 'disc':
          break;
      }
      
    } else {
      console.error(`❌ Teste ${tipoTeste.toUpperCase()} NÃO FOI SALVO!`);
      console.error('💡 Campo chave está vazio:', campoChave, '=', dados[campoChave]);
    }
    
    
  } catch (error) {
    console.error('❌ ERRO NO DIAGNÓSTICO:', error);
    if (error instanceof Error) {
      console.error('   Mensagem:', error.message);
      console.error('   Stack:', error.stack);
    }
  }
}

/**
 * Buscar TODOS os corretores com testes salvos
 */
export async function listarTodosCorretoresComTestes(): Promise<void> {
  
  try {
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    const url = `${config.url}/rest/v1/Corretores?select=id,nm_corretor,disc_tipo_principal,disc_data_teste,eneagrama_tipo_principal,eneagrama_data_teste,mbti_tipo,mbti_data_teste&order=id.desc&limit=100`;
    
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });
    
    if (!response.ok) {
      console.error('❌ Erro ao buscar:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    
    
    let discCount = 0;
    let eneagramaCount = 0;
    let mbtiCount = 0;
    
    
    data.forEach((corretor: any, index: number) => {
      const temDisc = corretor.disc_tipo_principal !== null;
      const temEneagrama = corretor.eneagrama_tipo_principal !== null;
      const temMbti = corretor.mbti_tipo !== null;
      
      if (temDisc) discCount++;
      if (temEneagrama) eneagramaCount++;
      if (temMbti) mbtiCount++;
      
    });
    
    
  } catch (error) {
    console.error('❌ Erro ao listar:', error);
  }
}

// Exportar para o console do navegador
if (typeof window !== 'undefined') {
  (window as any).diagnosticarTesteCompleto = diagnosticarTesteCompleto;
  (window as any).listarTodosCorretoresComTestes = listarTodosCorretoresComTestes;
  
}

