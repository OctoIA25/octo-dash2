/**
 * 🔧 DIAGNÓSTICO - Verificar salvamento e leitura de dados Eneagrama
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

export async function diagnosticarEneagrama(corretorId?: number) {
  
  const config = getSupabaseConfig();
  const headers = getAuthenticatedHeaders();
  
  try {
    // 1. Verificar estrutura da tabela Corretores
    
    const schemaResponse = await fetch(
      `${config.url}/rest/v1/Corretores?select=*&limit=1`,
      { method: 'GET', headers }
    );
    
    if (schemaResponse.ok) {
      const sampleData = await schemaResponse.json();
      if (sampleData && sampleData.length > 0) {
        const campos = Object.keys(sampleData[0]);
        
        // Verificar campos do Eneagrama
        const camposEneagrama = campos.filter(c => c.toLowerCase().includes('eneagrama'));
        if (camposEneagrama.length > 0) {
        } else {
          console.warn('⚠️ NENHUM campo de Eneagrama encontrado!');
        }
      }
    }
    
    // 2. Buscar todos os corretores com eneagrama_tipo_principal
    
    const corretoresResponse = await fetch(
      `${config.url}/rest/v1/Corretores?select=id,nm_corretor,eneagrama_tipo_principal,eneagrama_data_teste&eneagrama_tipo_principal=not.is.null`,
      { method: 'GET', headers }
    );
    
    if (corretoresResponse.ok) {
      const corretores = await corretoresResponse.json();
      
      if (corretores.length > 0) {
        corretores.forEach((c: any) => {
        });
      } else {
        console.warn('⚠️ Nenhum corretor tem eneagrama_tipo_principal preenchido');
      }
    }
    
    // 3. Se um ID específico foi fornecido, verificar esse corretor
    if (corretorId) {
      
      const corretorResponse = await fetch(
        `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=*`,
        { method: 'GET', headers }
      );
      
      if (corretorResponse.ok) {
        const corretor = await corretorResponse.json();
        if (corretor && corretor.length > 0) {
          
          // Verificar campos específicos do Eneagrama
          const c = corretor[0];
        } else {
          console.error('❌ Corretor não encontrado');
        }
      }
    }
    
    
  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error);
  }
}

// Exportar função global para usar no console
if (typeof window !== 'undefined') {
  (window as any).diagnosticarEneagrama = diagnosticarEneagrama;
}

