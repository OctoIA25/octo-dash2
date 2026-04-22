/**
 * Verificador de colunas 16Personalities no Supabase
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from './encryption';

export async function verificarColunas16Personalities(): Promise<{
  existem: boolean;
  mensagem: string;
  sqlParaExecutar?: string;
}> {
  try {
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Tentar fazer um SELECT com as colunas novas
    const response = await fetch(
      `${config.url}/rest/v1/Corretores?select=id,codigo_teste_16personalities&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );
    
    if (response.ok) {
      return {
        existem: true,
        mensagem: 'Banco de dados configurado corretamente!'
      };
    }
    
    // Se deu erro 400 ou 404, as colunas não existem
    const errorData = await response.json();
    
    if (errorData.code === 'PGRST204' || errorData.message?.includes('codigo_teste_16personalities')) {
      
      const sqlParaExecutar = `-- Execute este SQL no Supabase Dashboard (SQL Editor)

-- URL e metadados do teste
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS url_resultado_16personalities TEXT;
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS codigo_teste_16personalities VARCHAR(20);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS data_importacao_16personalities TIMESTAMPTZ;

-- Tipo de personalidade 16P
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS tipo_16p_codigo VARCHAR(7);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS tipo_16p_nome VARCHAR(50);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS tipo_16p_grupo VARCHAR(20);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS tipo_16p_descricao TEXT;
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS genero_informado_16p CHAR(1);

-- Dimensão 1: Energia
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS percentual_energia INTEGER;
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS lado_energia VARCHAR(20);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS letra_energia CHAR(1);

-- Dimensão 2: Mente
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS percentual_mente INTEGER;
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS lado_mente VARCHAR(20);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS letra_mente CHAR(1);

-- Dimensão 3: Natureza
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS percentual_natureza INTEGER;
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS lado_natureza VARCHAR(20);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS letra_natureza CHAR(1);

-- Dimensão 4: Abordagem
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS percentual_abordagem INTEGER;
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS lado_abordagem VARCHAR(20);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS letra_abordagem CHAR(1);

-- Dimensão 5: Identidade
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS percentual_identidade INTEGER;
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS lado_identidade VARCHAR(20);
ALTER TABLE "Corretores" ADD COLUMN IF NOT EXISTS letra_identidade CHAR(1);`;
      
      return {
        existem: false,
        mensagem: 'Colunas do 16Personalities não existem no banco de dados. Execute o SQL no Supabase Dashboard.',
        sqlParaExecutar
      };
    }
    
    // Outro erro
    return {
      existem: false,
      mensagem: 'Não foi possível verificar o banco de dados.'
    };
    
  } catch (error) {
    return {
      existem: false,
      mensagem: 'Erro ao conectar com o banco de dados.'
    };
  }
}

