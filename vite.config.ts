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
      '/api/kenlo': {
        target: 'https://imob.valuegaia.com.br',
        changeOrigin: true,
        secure: false,
        router: (req: any) => {
          try {
            const requestUrl = new URL(req.url || '', 'http://localhost');
            const raw = requestUrl.searchParams.get('url') || '';
            if (raw) {
              const target = new URL(raw);
              return `${target.protocol}//${target.host}`;
            }
          } catch {
            // ignore
          }
          return 'https://imob.valuegaia.com.br';
        },
        rewrite: (path) => {
          try {
            const requestUrl = new URL(path || '', 'http://localhost');
            const raw = requestUrl.searchParams.get('url') || '';
            if (raw) {
              const target = new URL(raw);
              return `${target.pathname}${target.search}`;
            }
          } catch {
            // ignore
          }
          return '/integra/midia.ashx?midia=ChaveNaMao&p=pQdBmFcGRFgUiPu6qbT5CB0b4QQUZf5v';
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.log('❌ Proxy error:', err.message);
            (res as any).writeHead(500, {
              'Content-Type': 'application/json',
            });
            (res as any).end(JSON.stringify({ error: 'Proxy error', message: err.message }));
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('📤 Sending Request to Target:', req.method, req.url);
            // Manter o método original (GET/POST). Só aplicar Content-Type no POST.
            if (req.method && req.method.toUpperCase() !== 'GET') {
              proxyReq.method = 'POST';
              proxyReq.setHeader('Content-Type', 'application/x-www-form-urlencoded');
            }
            proxyReq.setHeader('Accept', 'application/xml, text/xml, */*');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('📥 Received Response from Target:', proxyRes.statusCode, req.url);
          });
        },
      }
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
          'radix-vendor': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          'recharts-vendor': ['recharts'],
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
