/**
 * Aplica os campos do Portal a partir do JSON REVISADO por você
 * (scripts/out/lancamentos-portal-proposto.json).
 *
 * DRY-RUN por padrão: só imprime o que faria. Para gravar de verdade:
 *   node scripts/apply-lancamentos-portal.mjs --apply
 *
 * Regras de segurança:
 *   - Só grava campos NÃO vazios do JSON (null/'' são ignorados → não apaga dado).
 *   - Filtra por tenant_id no UPDATE (nunca toca outro tenant).
 *   - _confianca e nome são metadados do rascunho: não vão pro banco.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TENANT = '65c69875-dc83-4062-90f6-6f6adc30df26';
const APPLY = process.argv.includes('--apply');
// input: 1º arg não-flag, ou o rascunho bruto por default.
const IN = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'scripts/out/lancamentos-portal-proposto.json';

const PORTAL_COLS = ['cidade', 'bairro', 'construtora', 'dormitorios', 'specs', 'estagio', 'preco_texto', 'tipo_dorms', 'preco_num', 'endereco_plantao'];
const isEmpty = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

let rows;
try {
  rows = JSON.parse(readFileSync(IN, 'utf8'));
} catch {
  console.error(`❌ Não achei/parseei ${IN}. Rode parse-lancamentos-portal.mjs antes e revise o arquivo.`);
  process.exit(1);
}

console.log(`\n${APPLY ? '✍️  APLICANDO' : '🧪 DRY-RUN (nada gravado)'} — ${rows.length} registro(s)\n`);

let updated = 0, skipped = 0, errors = 0;
for (const r of rows) {
  if (!r.id) { console.warn('⚠️  registro sem id, pulando'); skipped++; continue; }
  const patch = {};
  for (const col of PORTAL_COLS) {
    if (col in r && !isEmpty(r[col])) patch[col] = r[col];
  }
  if (!Object.keys(patch).length) { skipped++; continue; }

  console.log(`▸ ${r.nome || r.id}: ${JSON.stringify(patch)}`);

  if (APPLY) {
    const { error } = await supabase
      .from('lancamentos')
      .update(patch)
      .eq('id', r.id)
      .eq('tenant_id', TENANT); // trava de tenant
    if (error) { console.error(`   ❌ ${error.code} ${error.message} ${error.details || ''}`); errors++; }
    else updated++;
  } else {
    updated++;
  }
}

console.log(`\n${APPLY ? 'Gravados' : 'Seriam gravados'}: ${updated} · pulados (sem campo): ${skipped} · erros: ${errors}`);
if (!APPLY) console.log('→ Confira acima. Para gravar: node scripts/apply-lancamentos-portal.mjs --apply');
