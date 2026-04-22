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
}));
