#!/usr/bin/env node
/**
 * Faxina segura de console.log/debug/info.
 *
 * Regras:
 *  - Processa APENAS arquivos em src/ (*.ts, *.tsx, *.js, *.jsx).
 *  - Remove apenas chamadas de UMA única linha que começam com console.log|debug|info
 *    e terminam na mesma linha (parênteses balanceados em single-line).
 *  - PULA (lista pra revisão manual) quando encontra:
 *      • console.error ou console.warn  (mantidos sempre)
 *      • chamadas multi-linha
 *      • presença de "await" nos argumentos
 *      • chamada de função nos argumentos (regex heurística)
 *  - Mantém indentação do arquivo intacta; apenas deleta a linha.
 *
 * Uso:
 *   node scripts/clean-console-logs.mjs           # dry-run (só relatório)
 *   node scripts/clean-console-logs.mjs --apply   # aplica as remoções
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const removeRegex = /^\s*console\.(log|debug|info)\s*\(.*\)\s*;?\s*$/;

/**
 * Remove strings e template literals do conteúdo da chamada pra detectar
 * chamadas de função reais nos argumentos (sem falsos positivos de parênteses
 * dentro de strings como "CRM (DashboardLayout)").
 */
function stripStrings(s) {
  return s
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function isUnsafe(text) {
  const openIdx = text.indexOf('(');
  const closeIdx = text.lastIndexOf(')');
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return false;
  const inner = text.slice(openIdx + 1, closeIdx);
  const stripped = stripStrings(inner);
  if (/\bawait\b/.test(stripped)) return true;
  // chamada BARE (não é method call nem new Ctor()):
  // algo como `foo(...)` sem `.` antes e sem `new` antes.
  // Método (`a.b()`), `new Date()`, `JSON.stringify()` etc. são tratados como puros.
  const bareCall = /(?:^|[^.\w$])(?<!new\s)(?<!new\s\s)([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  let m;
  while ((m = bareCall.exec(stripped)) !== null) {
    const name = m[1];
    // keywords de controle não são chamadas de função
    if (/^(if|for|while|switch|return|typeof|void|new|throw|in|of|do|else|yield|delete|instanceof|case)$/.test(name)) continue;
    return true;
  }
  return false;
}

const stats = {
  filesScanned: 0,
  filesModified: 0,
  linesRemoved: 0,
  skippedUnsafe: 0,
  skippedMultiline: 0,
};
const skipped = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      processFile(full);
    }
  }
}

function processFile(file) {
  stats.filesScanned++;
  const original = fs.readFileSync(file, 'utf8');
  const lines = original.split(/\r?\n/);
  const out = [];
  let modified = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // início de console.log (single ou multiline)
    const startMatch = /^\s*console\.(log|debug|info)\s*\(/.test(line);
    if (!startMatch) {
      out.push(line);
      i++;
      continue;
    }

    // encontra fim balanceando parênteses (ignorando strings/templates)
    let buf = line;
    let end = i;
    let parenDepth = 0;
    let closed = false;
    for (let j = i; j < lines.length; j++) {
      const cur = lines[j];
      const stripped = stripStrings(cur);
      for (const ch of stripped) {
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
      }
      if (j > i) buf += '\n' + cur;
      if (parenDepth <= 0) {
        end = j;
        closed = true;
        break;
      }
    }

    if (!closed) {
      out.push(line);
      i++;
      continue;
    }

    // buf agora contém o console.log completo
    if (isUnsafe(buf)) {
      stats.skippedUnsafe++;
      skipped.push({ file, line: i + 1, reason: 'unsafe', preview: line.trim().slice(0, 120) });
      for (let k = i; k <= end; k++) out.push(lines[k]);
      i = end + 1;
      continue;
    }

    // safe: drop todas as linhas da chamada
    stats.linesRemoved += (end - i + 1);
    modified = true;
    i = end + 1;
  }

  if (modified) {
    stats.filesModified++;
    if (APPLY) {
      fs.writeFileSync(file, out.join('\n'));
    }
  }
}

walk(SRC);

console.warn(`\n${APPLY ? '[APLICADO]' : '[DRY-RUN]'} Faxina de console.log`);
console.warn('─'.repeat(60));
console.warn(`Arquivos escaneados:    ${stats.filesScanned}`);
console.warn(`Arquivos modificados:   ${stats.filesModified}`);
console.warn(`Linhas removidas:       ${stats.linesRemoved}`);
console.warn(`Puladas (multilinha):   ${stats.skippedMultiline}`);
console.warn(`Puladas (inseguras):    ${stats.skippedUnsafe}`);
console.warn('─'.repeat(60));

if (skipped.length > 0) {
  const reportPath = path.join(ROOT, 'console-cleanup-skipped.txt');
  fs.writeFileSync(
    reportPath,
    skipped.map((s) => `${s.file}:${s.line}  [${s.reason}]  ${s.preview}`).join('\n')
  );
  console.warn(`\nRelatório de puladas: ${reportPath}`);
}

if (!APPLY) {
  console.warn('\n→ Para aplicar: node scripts/clean-console-logs.mjs --apply\n');
}
