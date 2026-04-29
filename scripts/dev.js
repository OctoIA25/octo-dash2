/**
 * Dev runner — roda Vite + API server em paralelo
 * Funciona em Windows (com ou sem cmd.exe no PATH), macOS e Linux
 *
 * Uso: node scripts/dev.js
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Carregar .env manualmente
function loadEnv() {
  try {
    const envPath = path.join(rootDir, '.env');
    const content = readFileSync(envPath, 'utf-8');
    const env = {};
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Remove aspas se houver
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    });
    return env;
  } catch (err) {
    console.warn('⚠️  Não foi possível ler .env:', err.message);
    return {};
  }
}

const envVars = loadEnv();
const processEnv = { ...process.env, ...envVars };

// Resolver paths dos binários locais
// Usar o JS entry direto (não o .cmd wrapper do npm) pra evitar EINVAL no Windows
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

// Cores ANSI
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function prefix(label, color) {
  return `${color}[${label}]${RESET} `;
}

function streamOutput(proc, label, color) {
  const pfx = prefix(label, color);
  proc.stdout.on('data', (data) => {
    const text = data.toString();
    text.split('\n').forEach((line) => {
      if (line.trim()) console.log(pfx + line);
    });
  });
  proc.stderr.on('data', (data) => {
    const text = data.toString();
    text.split('\n').forEach((line) => {
      if (line.trim()) console.error(pfx + line);
    });
  });
}

console.log(`${DIM}🚀 Iniciando Vite (frontend) + API server em paralelo...${RESET}`);
console.log(`${DIM}   Frontend: http://localhost:8080${RESET}`);
console.log(`${DIM}   API:      http://localhost:3001${RESET}`);
console.log(`${DIM}   Para parar: Ctrl+C${RESET}\n`);

// 1. Vite (frontend) — usa Node pra rodar o vite.js direto
const viteProc = spawn(process.execPath, ['--max-old-space-size=4096', viteBin], {
  cwd: rootDir,
  env: processEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});
streamOutput(viteProc, 'vite', CYAN);

// 2. API server (Express)
const apiProc = spawn(process.execPath, [path.join(rootDir, 'server', 'api-server.js')], {
  cwd: rootDir,
  env: processEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});
streamOutput(apiProc, 'api', MAGENTA);

// Shutdown handler — mata ambos os processos ao receber Ctrl+C
function shutdown() {
  console.log(`\n${DIM}🛑 Parando servidores...${RESET}`);
  try { viteProc.kill('SIGTERM'); } catch {}
  try { apiProc.kill('SIGTERM'); } catch {}
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Se um processo morre, mata o outro
viteProc.on('exit', (code) => {
  console.log(`${CYAN}[vite]${RESET} encerrado (code ${code})`);
  try { apiProc.kill('SIGTERM'); } catch {}
});
apiProc.on('exit', (code) => {
  console.log(`${MAGENTA}[api]${RESET} encerrado (code ${code})`);
  try { viteProc.kill('SIGTERM'); } catch {}
});

viteProc.on('error', (err) => {
  console.error(`${CYAN}[vite]${RESET} erro:`, err.message);
});
apiProc.on('error', (err) => {
  console.error(`${MAGENTA}[api]${RESET} erro:`, err.message);
});
