/**
 * Dump de todos os books de LANÇAMENTOS de um tenant, com foco nos campos que
 * alimentam os cards do Portal público (view portal_lancamentos).
 *
 * Só leitura. Mostra, por lançamento, todos os campos do Portal e sinaliza
 * quais estão FALTANDO (o Portal exibe/filtra por eles).
 *
 * Uso:  node scripts/dump-lancamentos-portal.mjs [tenant_id]
 *       (default = 65c69875-dc83-4062-90f6-6f6adc30df26)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TENANT = process.argv[2] || '65c69875-dc83-4062-90f6-6f6adc30df26';

// Campos do Portal (view portal_lancamentos + filtros da listagem). O 3º valor
// marca quais são exibidos nos CARDS do site — quando vazios, degradam o card.
const PORTAL_FIELDS = [
  'nome', 'descricao', 'cidade', 'bairro', 'estagio', 'construtora',
  'dormitorios', 'specs', 'preco_texto', 'preco_num', 'tipo_dorms',
  'exclusivo', 'publicar_site', 'endereco_plantao',
];

const isEmpty = (v) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const { data, error } = await supabase
  .from('lancamentos')
  .select(
    // book_pdf omitido de propósito (base64 pesado); só o filename.
    'id, nome, descricao, cidade, bairro, estagio, construtora, dormitorios, ' +
    'specs, preco_texto, preco_num, tipo_dorms, exclusivo, publicar_site, ' +
    'endereco_plantao, book_pdf_filename, fotos, created_at, updated_at'
  )
  .eq('tenant_id', TENANT)
  .order('created_at', { ascending: true });

if (error) {
  console.error('❌ Erro na query:', error.code, error.message, error.details, error.hint);
  process.exit(1);
}

if (!data.length) {
  console.log(`Nenhum lançamento para o tenant ${TENANT}.`);
  process.exit(0);
}

console.log(`\n📦 ${data.length} lançamento(s) — tenant ${TENANT}\n`);

for (const l of data) {
  const faltando = PORTAL_FIELDS.filter((f) => isEmpty(l[f]) && f !== 'exclusivo' && f !== 'publicar_site');
  const fotos = Array.isArray(l.fotos) ? l.fotos.length : 0;

  console.log('─'.repeat(72));
  console.log(`▸ ${l.nome || '(sem nome)'}   [${l.id}]`);
  for (const f of PORTAL_FIELDS) {
    const v = l[f];
    const shown = isEmpty(v) ? '⚠️  (vazio)' : JSON.stringify(v);
    console.log(`   ${f.padEnd(16)} ${shown}`);
  }
  console.log(`   ${'fotos'.padEnd(16)} ${fotos} foto(s)`);
  console.log(`   ${'book_pdf'.padEnd(16)} ${l.book_pdf_filename || '⚠️  (sem PDF)'}`);
  if (faltando.length) {
    console.log(`   → FALTA preencher p/ o Portal: ${faltando.join(', ')}`);
  }
}

console.log('─'.repeat(72));

// Resumo de completude por campo (quantos books têm cada um preenchido).
console.log('\n📊 Completude por campo (preenchidos / total):');
for (const f of PORTAL_FIELDS) {
  const ok = data.filter((l) => !isEmpty(l[f])).length;
  const bar = ok === data.length ? '✅' : ok === 0 ? '❌' : '🟡';
  console.log(`   ${bar} ${f.padEnd(16)} ${ok}/${data.length}`);
}

// Saída JSON completa (para uso programático / preenchimento em lote).
console.log('\n💾 JSON completo abaixo:\n');
console.log(JSON.stringify(data, null, 2));
