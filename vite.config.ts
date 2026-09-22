/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    // O Vite 7 recusa requisição cujo Host ele não conhece — e devolve um 403
    // com texto, não uma tela em branco, o que ajuda a descobrir. Isso protege
    // contra DNS rebinding e é o comportamento certo por padrão.
    //
    // Para abrir a Dash por um endereço externo (demonstração por túnel),
    // listar o domínio em VITE_ALLOWED_HOSTS, separado por vírgula. Vazio, que
    // é o normal, mantém o padrão do Vite.
    allowedHosts: (process.env.VITE_ALLOWED_HOSTS ?? '')
      .split(',').map((h) => h.trim()).filter(Boolean),
    proxy: {
      '/api/v1': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.log('❌ API Proxy error:', err.message);
            if (res && typeof res.writeHead === 'function') {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'API Server not running', message: 'Execute: node server/api-server.js' }));
            }
          });
        },
      },
      // Mesma rota do servidor (server/kenloXmlProxy.js), com allowlist de host.
      // Antes o Vite tinha um proxy PRÓPRIO aqui, que aceitava qualquer ?url= e
      // caía numa URL hardcoded quando o parâmetro faltava — dev e produção se
      // comportavam diferente, que foi como o bug do catálogo passou despercebido.
      '/api/kenlo': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    }
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Em produção, remove console.* e debugger do bundle (mantém console.error/warn se preferir usar pure)
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chartjs-vendor': ['chart.js', 'react-chartjs-2'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'query-vendor': ['@tanstack/react-query'],
          'date-vendor': ['date-fns', 'chartjs-adapter-date-fns'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
  test: {
    globals: true,            // describe/it/expect disponíveis sem import
    environment: "jsdom",     // DOM simulado para testar componentes React
    setupFiles: "./src/test/setup.ts",
    css: false,               // ignora CSS nos testes (mais rápido)
    // Prazo de 20 s no lugar dos 5 s padrão. Medido, não chutado: numa execução
    // limpa há 20 testes entre 1,7 s e 5,2 s — os de página inteira, que montam
    // componentes grandes e fazem cliques reais no jsdom. Com 5 s, esses 20 têm
    // menos de 3x de folga, e a própria suíte carrega a máquina (load 11 antes,
    // 23 durante). Bastava rodar num momento ruim para 17 deles caírem juntos:
    // foi o que aconteceu, e a suíte passou a "às vezes passar" — pior que não
    // ter portão, porque ninguém sabe se a falha é real.
    // Com 20 s a folga vira 12x para os de 1,7 s e 4x para o mais lento.
    // Se um dia um teste travar de verdade, ele leva 20 s para acusar em vez de
    // 5 s; é o preço, e é menor que o de uma suíte não confiável.
    testTimeout: 20_000,
    // Excluímos node_modules (em qualquer nível, incl. server/node_modules), dist e
    // supabase. NÃO excluímos "server" inteiro: os testes de envio/ambiente vivem em
    // server/recommendations (os arquivos de runtime não são *.test.*, logo não entram).
    // "**/e2e/**" fica de fora: são testes do PLAYWRIGHT (rodam via `npm run e2e`), não
    // do vitest — incluí-los aqui quebraria (import de @playwright/test não resolvido).
    // O glob precisa do "**/" na frente: "e2e/**" só casa com o e2e/ da raiz, e worktrees
    // do Claude Code em .claude/ carregam uma cópia inteira do repo (e2e e testes juntos).
    // ".claude/**" cobre o resto dessa cópia — sem ele a suíte roda duas vezes.
    exclude: ["**/node_modules/**", "**/dist/**", "supabase/**", "**/e2e/**", ".claude/**"],
    // alias "@/" é herdado de resolve.alias acima
  },
}));
