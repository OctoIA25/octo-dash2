#!/usr/bin/env node
/**
 * Converte `.single()` → `.maybeSingle()` APENAS em queries de SELECT.
 * Preserva `.single()` em chains de INSERT/UPDATE/UPSERT/DELETE (onde .single()
 * é legítimo e nunca retorna 0 rows).
 *
 * Heurística: olha os ~800 caracteres anteriores ao `.single()` na mesma chain
 * (delimitada por `;` ou novo `await/supabase.from`). Se contém insert/update/
 * upsert/delete, pula. Caso contrário, converte.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

let converted = 0;
let skipped = 0;
const report = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(full);
    } else if (EXT.has(path.extname(e.name))) {
      processFile(full);
    }
  }
}

function processFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let modified = false;
  // procurar todas as ocorrências de .single()
  const regex = /\.single\(\s*\)/g;
  let m;
  const hits = [];
  while ((m = regex.exec(src)) !== null) hits.push(m.index);
  if (hits.length === 0) return;

  // construir novo conteúdo
  let out = '';
  let last = 0;
  for (const idx of hits) {
    // olhar até 800 chars antes
    const chainStart = Math.max(0, idx - 800);
    const chain = src.slice(chainStart, idx);
    const isWrite = /\.(insert|update|upsert|delete)\s*\(/.test(chain) &&
                    // mas garantir que o insert/update veio ANTES na mesma chain
                    // (não em uma chain anterior já terminada).
                    // Pegar o último "supabase" antes do .single:
                    (() => {
                      const fromIdx = chain.lastIndexOf('supabase');
                      const sub = fromIdx >= 0 ? chain.slice(fromIdx) : chain;
                      return /\.(insert|update|upsert|delete)\s*\(/.test(sub);
                    })();

    out += src.slice(last, idx);
    if (isWrite) {
      out += '.single()';
      skipped++;
      report.push({ file, at: idx, action: 'kept (write chain)' });
    } else {
      out += '.maybeSingle()';
      converted++;
      modified = true;
    }
    last = idx + '.single()'.length;
  }
  out += src.slice(last);

  if (modified && APPLY) {
    fs.writeFileSync(file, out);
  }
}

walk(SRC);

console.warn(`\n${APPLY ? '[APLICADO]' : '[DRY-RUN]'} .single() → .maybeSingle()`);
console.warn('─'.repeat(60));
console.warn(`Convertidos:            ${converted}`);
console.warn(`Preservados (write):    ${skipped}`);
console.warn('─'.repeat(60));
if (!APPLY) console.warn('\n→ Para aplicar: node scripts/convert-single-to-maybesingle.mjs --apply\n');
