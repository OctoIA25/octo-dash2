/**
 * 🩹 BACKFILL: cura fotos "marcadas presas" (a marca d'água continua aparecendo
 * mesmo com o liga/desliga DESLIGADO).
 *
 * Contexto: o reprocessamento gera o derivado LIMPO (clean_{size}.webp) e troca a
 * URL no JSONB `fotos`. Em casos raros o arquivo limpo é gerado mas a URL da foto
 * não é atualizada — a foto fica apontando para o derivado MARCADO (wm_v…).
 *
 * Este script NÃO gera imagem (não precisa de sharp): apenas reescreve a URL
 * marcada → a URL limpa do MESMO diretório, e SOMENTE se o arquivo limpo já existe
 * no storage (senão deixa como está, para nunca criar imagem quebrada). Também
 * preserva/repõe o `id` do pipeline (property_photos.id), extraindo-o do caminho
 * quando ausente — assim o reprocessamento futuro volta a alcançar a foto.
 *
 * Idempotente: rodar de novo não faz nada. Só toca fotos cuja URL contém wm_v…
 *
 * Uso (dry-run, padrão):   node scripts/watermark-backfill-fotos-presas.mjs
 *      aplicar de verdade:  node scripts/watermark-backfill-fotos-presas.mjs --apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'property-photos'; // BUCKETS.derived (server/watermark/config.js)
const TABLES = ['imoveis_locais', 'condominios', 'lancamentos'];

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('❌ Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

const getUrl = (f) => {
  let v = typeof f === 'string' ? f : f?.url;
  for (let i = 0; v && typeof v === 'object' && i < 5; i++) v = v.url ?? v.publicUrl;
  return typeof v === 'string' ? v : null;
};
const imageIdFromUrl = (u) => {
  const m = u && u.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+\.webp/i);
  return m ? m[1] : null;
};
const sizeFromUrl = (u) => { const m = u.match(/_([a-z]+)\.webp/i); return m ? m[1] : 'portal'; };
// Troca só o NOME do arquivo (wm_v…_{size}.webp → clean_{size}.webp), mantendo o
// mesmo prefixo público e diretório. Sem mexer em query string (URLs públicas).
const toCleanUrl = (u) => u.replace(/\/wm_v\d+(?:_o\d+)?(?:_s\d+)?_([a-z]+)\.webp/i, '/clean_$1.webp');

async function cleanExists(cleanUrl) {
  const rel = cleanUrl.split(`/${BUCKET}/`).pop().split('?')[0];
  const dir = rel.replace(/[^/]+\.webp$/, '');
  const name = rel.slice(dir.length);
  const { data, error } = await supabase.storage.from(BUCKET).list(dir, { search: name, limit: 1 });
  return !error && (data || []).some((x) => x.name === name);
}

async function main() {
  console.log(`Modo: ${APPLY ? '✍️  APLICAR' : '👀 DRY-RUN (use --apply para gravar)'}\n`);
  let fotosTocadas = 0, linhasAtualizadas = 0, puladasSemClean = 0;

  for (const table of TABLES) {
    const { data: rows, error } = await supabase
      .from(table).select('id, fotos').not('fotos', 'is', null);
    if (error) { console.log(`(pulando ${table}: ${error.message})`); continue; }

    for (const row of rows || []) {
      const fotos = Array.isArray(row.fotos) ? row.fotos : [];
      let changed = false;
      const novas = [];
      for (const f of fotos) {
        const u = getUrl(f) || '';
        if (!/\/wm_v\d+_/.test(u)) { novas.push(f); continue; } // não-marcada: mantém
        const cleanUrl = toCleanUrl(u);
        if (cleanUrl === u || !(await cleanExists(cleanUrl))) {
          puladasSemClean++;
          console.log(`  ⏭️  ${table}/${row.id}: clean ausente, mantendo  ${u.slice(-60)}`);
          novas.push(f);
          continue;
        }
        const id = (typeof f === 'object' && f?.id) || imageIdFromUrl(u) || undefined;
        const base = typeof f === 'object' && f !== null ? f : { url: u };
        novas.push({ ...base, url: cleanUrl, ...(id ? { id } : {}) });
        changed = true;
        fotosTocadas++;
        console.log(`  ✅ ${table}/${row.id}: wm_v→clean  id=${id || '?'}`);
      }
      if (changed) {
        linhasAtualizadas++;
        if (APPLY) {
          const { error: uErr } = await supabase.from(table).update({ fotos: novas }).eq('id', row.id);
          if (uErr) console.log(`  ❌ falha ao gravar ${table}/${row.id}: ${uErr.message}`);
        }
      }
    }
  }

  console.log(`\n📋 Resumo: ${fotosTocadas} foto(s) ${APPLY ? 'curadas' : 'a curar'} em ${linhasAtualizadas} linha(s).`);
  if (puladasSemClean) console.log(`   ${puladasSemClean} pulada(s) por não ter o arquivo limpo ainda.`);
  if (!APPLY) console.log('\nNada foi gravado. Rode com --apply para aplicar.');
}

main().catch((e) => { console.error(e); process.exit(1); });
