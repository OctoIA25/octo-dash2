/**
 * Script para criar a tabela imoveis_corretores no Supabase
 * Usa a API de SQL do Supabase para execução direta
 */

const supabaseUrl = 'https://icpgzclbhhfmavihtetf.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcGd6Y2xiaGhmbWF2aWh0ZXRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTgwNDUzNiwiZXhwIjoyMDc1MzgwNTM2fQ.FkNrVhtRZwowrg_ReNFnWedeIMf1mWv3NyqXxwfqhr8';

const SQL = `
CREATE TABLE IF NOT EXISTS imoveis_corretores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  codigo_imovel TEXT NOT NULL,
  corretor_nome TEXT,
  corretor_email TEXT,
  corretor_telefone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT imoveis_corretores_tenant_codigo_unique UNIQUE (tenant_id, codigo_imovel)
);

CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_tenant_id ON imoveis_corretores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_corretores_codigo ON imoveis_corretores(codigo_imovel);
`;

async function createTable() {
  console.log('🔄 Criando tabela imoveis_corretores no Supabase...');
  console.log('📍 URL:', supabaseUrl);
  
  // Usar a API de SQL do Supabase (pg endpoint)
  const response = await fetch(`${supabaseUrl}/pg/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({ query: SQL })
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.log('⚠️ Tentando endpoint alternativo...');
    
    // Tentar endpoint de query
    const response2 = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal'
      }
    });
    
    // Se não funcionar, tentar inserir um registro de teste para verificar se a tabela existe
    const testResponse = await fetch(`${supabaseUrl}/rest/v1/imoveis_corretores?select=count`, {
      method: 'GET',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      }
    });
    
    if (testResponse.ok) {
      console.log('✅ Tabela imoveis_corretores já existe!');
      return;
    }
    
    console.log('❌ Não foi possível criar a tabela automaticamente.');
    console.log('\n📋 Execute manualmente no Supabase Dashboard > SQL Editor:');
    console.log('   URL: https://supabase.com/dashboard/project/icpgzclbhhfmavihtetf/sql');
    console.log('\n' + SQL);
    return;
  }
  
  const result = await response.json();
  console.log('✅ Tabela imoveis_corretores criada com sucesso!');
  console.log(result);
}

createTable().catch(console.error);
