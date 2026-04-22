/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

// Utilitário para criptografia de dados sensíveis
// Protege API keys e dados sensíveis no frontend

/**
 * Função simples de criptografia para ofuscar dados sensíveis
 * NOTA: Esta é uma ofuscação básica. Em produção, use variáveis de ambiente do servidor
 */
function simpleEncrypt(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const textChar = text.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    result += String.fromCharCode(textChar ^ keyChar);
  }
  return btoa(result); // Codificar em base64
}

/**
 * Função para descriptografar dados ofuscados
 */
function simpleDecrypt(encryptedText: string, key: string): string {
  const decoded = atob(encryptedText);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    const textChar = decoded.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    result += String.fromCharCode(textChar ^ keyChar);
  }
  return result;
}

/**
 * 🔐 CONFIGURAÇÕES CRIPTOGRAFADAS DO SUPABASE - NOVO PROJETO
 * As chaves reais são ofuscadas para proteção no frontend
 * Projeto: icpgzclbhhfmavihtetf
 */
const ENCRYPTION_KEY = 'OctoDash2025SecurityV2Enhanced';

// Usar variáveis de ambiente do Vite (mesma fonte que supabaseClient.ts)
const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ENV_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Função para obter configurações descriptografadas do Supabase
 * Só deve ser chamada internamente pelos serviços
 */
export function getSupabaseConfig() {
  if (!ENV_SUPABASE_URL || !ENV_SUPABASE_ANON_KEY) {
    console.error('❌ getSupabaseConfig: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados!');
  }
  return {
    url: ENV_SUPABASE_URL || '',
    serviceKey: ENV_SUPABASE_ANON_KEY || '',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'return=representation'
    }
  };
}

/**
 * Função para construir headers autenticados
 * Usa o JWT do usuário logado quando disponível, garantindo que RLS (auth.uid()) funcione.
 * Fallback para anon key se não houver sessão ativa.
 */
export function getAuthenticatedHeaders() {
  const config = getSupabaseConfig();

  let authToken = config.serviceKey; // fallback: anon key
  try {
    const sessionRaw = localStorage.getItem('octo-crm-auth');
    if (sessionRaw) {
      const sessionData = JSON.parse(sessionRaw);
      const accessToken = sessionData?.access_token;
      if (accessToken && typeof accessToken === 'string' && accessToken.startsWith('eyJ')) {
        authToken = accessToken;
      }
    }
  } catch {
    // silently fallback to anon key
  }

  return {
    ...config.headers,
    'apikey': config.serviceKey,
    'Authorization': `Bearer ${authToken}`
  };
}

/**
 * Log de segurança (não expõe dados sensíveis)
 */
export function logSecureConnection() {
  console.warn('⚠️ logSecureConnection: Supabase removido. Nenhuma conexão será realizada.');
}
