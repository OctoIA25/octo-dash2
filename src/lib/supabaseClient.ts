import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Configuração de persistência de sessão
const SUPABASE_AUTH_CONFIG = {
  auth: {
    // Persistir sessão no localStorage para manter login mesmo após fechar o navegador
    persistSession: true,
    // Usar localStorage para armazenar a sessão (padrão)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Auto-refresh do token antes de expirar
    autoRefreshToken: true,
    // Detectar sessão em outras abas
    detectSessionInUrl: true,
    // Chave de armazenamento da sessão
    storageKey: 'octo-crm-auth',
  }
};

// =============================================================================
// VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
// =============================================================================
// Em produção (Docker), as variáveis VITE_* são injetadas durante o BUILD.
// Se estiverem faltando, significa que o build foi feito sem os build args.
// 
// Para corrigir no EasyPanel:
// 1. Vá em Settings > Build
// 2. Adicione Build Arguments:
//    - VITE_SUPABASE_URL=https://seu-projeto.supabase.co
//    - VITE_SUPABASE_ANON_KEY=sua-chave-anon
// 3. Faça um novo deploy
// =============================================================================

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage = `
╔════════════════════════════════════════════════════════════════════╗
║  ❌ ERRO: Variáveis de ambiente do Supabase não configuradas       ║
╚════════════════════════════════════════════════════════════════════╝

Variáveis faltando:
${!supabaseUrl ? '  ❌ VITE_SUPABASE_URL' : '  ✅ VITE_SUPABASE_URL'}
${!supabaseAnonKey ? '  ❌ VITE_SUPABASE_ANON_KEY' : '  ✅ VITE_SUPABASE_ANON_KEY'}

📋 COMO CORRIGIR NO EASYPANEL:
1. Vá em Settings > Build
2. Adicione Build Arguments:
   - VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   - VITE_SUPABASE_ANON_KEY=sua-chave-anon
3. Faça um novo deploy (Rebuild)

⚠️  IMPORTANTE: Essas variáveis são injetadas durante o BUILD, não em runtime!
`;
  console.error(errorMessage);
  
  // Mostrar erro na tela em vez de apenas lançar exceção
  if (typeof document !== 'undefined') {
    document.body.innerHTML = `
      <div style="
        font-family: 'Segoe UI', system-ui, sans-serif;
        max-width: 800px;
        margin: 50px auto;
        padding: 30px;
        background: #1a1a2e;
        color: #eee;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      ">
        <h1 style="color: #ff6b6b; margin-bottom: 20px;">❌ Erro de Configuração</h1>
        <p style="font-size: 18px; margin-bottom: 20px;">
          As variáveis de ambiente do Supabase não foram configuradas durante o build.
        </p>
        <div style="background: #0d0d1a; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #4ecdc4; margin-bottom: 15px;">📋 Como corrigir no EasyPanel:</h3>
          <ol style="line-height: 2; padding-left: 20px;">
            <li>Vá em <strong>Settings → Build</strong></li>
            <li>Adicione <strong>Build Arguments</strong>:
              <ul style="margin-top: 10px;">
                <li><code style="background: #2d2d44; padding: 4px 8px; border-radius: 4px;">VITE_SUPABASE_URL</code></li>
                <li><code style="background: #2d2d44; padding: 4px 8px; border-radius: 4px;">VITE_SUPABASE_ANON_KEY</code></li>
              </ul>
            </li>
            <li>Clique em <strong>Rebuild</strong></li>
          </ol>
        </div>
        <p style="color: #888; font-size: 14px;">
          ⚠️ Essas variáveis são injetadas durante o BUILD do Docker, não em runtime.
        </p>
      </div>
    `;
  }
  
  throw new Error('Supabase env vars missing. Check console for details.');
}

if (supabaseAnonKey.startsWith('sb_') || !supabaseAnonKey.startsWith('eyJ')) {
  const errorMessage = `
╔════════════════════════════════════════════════════════════════════╗
║  ❌ ERRO: Chave do Supabase inválida                               ║
╚════════════════════════════════════════════════════════════════════╝

VITE_SUPABASE_ANON_KEY precisa ser a chave JWT legacy (começa com "eyJ...").
Chaves publishable (começam com "sb_") NÃO funcionam para PostgREST e causam erro 406.
`;
  console.error(errorMessage);

  if (typeof document !== 'undefined') {
    document.body.innerHTML = `
      <div style="
        font-family: 'Segoe UI', system-ui, sans-serif;
        max-width: 800px;
        margin: 50px auto;
        padding: 30px;
        background: #1a1a2e;
        color: #eee;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      ">
        <h1 style="color: #ff6b6b; margin-bottom: 20px;">❌ Chave do Supabase inválida</h1>
        <p style="font-size: 18px; margin-bottom: 20px;">
          O build foi feito com uma chave publishable (sb_) ou com uma chave inválida.
        </p>
        <div style="background: #0d0d1a; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #4ecdc4; margin-bottom: 15px;">📋 Como corrigir no EasyPanel:</h3>
          <ol style="line-height: 2; padding-left: 20px;">
            <li>Vá em <strong>Settings → Build</strong></li>
            <li>Atualize <strong>Build Arguments</strong>:</li>
            <li><code style="background: #2d2d44; padding: 4px 8px; border-radius: 4px;">VITE_SUPABASE_ANON_KEY</code> deve começar com <strong>eyJ</strong></li>
            <li>Clique em <strong>Rebuild</strong></li>
          </ol>
        </div>
      </div>
    `;
  }

  throw new Error('Supabase anon key invalid. Must be JWT (eyJ...).');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, SUPABASE_AUTH_CONFIG);
