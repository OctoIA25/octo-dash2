/**
 * 🔎 DIAGNÓSTICO (somente leitura) das fotos do pipeline de marca d'água.
 *
 * Classifica cada foto persistida em imoveis_locais / condominios / lancamentos
 * pelo formato da URL e pela presença do `id` do pipeline:
 *
 *   estavel   → /api/v1/watermark/photos/{id}/{size}  (resolve marca em tempo de
 *               serviço; o liga/desliga já funciona — só precisa refresh)
 *   marcada   → .../{imageId}/wm_v{ver}_o{o}_s{s}_{size}.webp|.jpg  (CONGELADA com marca)
 *   limpa     → .../{imageId}/clean_{size}.webp|.jpg                (CONGELADA sem marca)
 *   crua      → bucket imoveis-fotos (upload de fallback, nunca teve marca)
 *   outra     → http(s) externa / legado / data url
 *
 * O caso PROBLEMÁTICO para o liga/desliga é `marcada SEM id`: o reprocessamento
 * pula (não tem id) e a marca fica presa. Felizmente o imageId está no caminho da
 * URL, então dá pra recuperar — é o que o backfill faz.
 *
 * Uso:  node scripts/watermark-diagnostico-fotos.mjs
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

const TABLES = ['imoveis_locais', 'condominios', 'lancamentos'];

/** Extrai a string da URL, desembrulhando { url: { url } } como o front faz. */
function getUrl(f) {
  let v = typeof f === 'string' ? f : f?.url;
  for (let i = 0; v && typeof v === 'object' && i < 5; i++) v = v.url ?? v.publicUrl;
  return typeof v === 'string' ? v : null;
}

/** imageId (=property_photos.id) embutido no caminho da CDN: .../{uuid}/arquivo.webp|.jpg */
function imageIdFromUrl(u) {
  const m = u && u.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+\.(?:webp|jpg)/i);
  return m ? m[1] : null;
}

function classify(f) {
  const u = getUrl(f) || '';
  const hasId = typeof f === 'object' && f !== null && !!f.id;
  if (/\/api\/v1\/watermark\/photos\//.test(u)) return { tipo: 'estavel', hasId };
  if (/\/wm_v\d+_/.test(u)) return { tipo: 'marcada', hasId };
  if (/\/clean_[a-z]+\.(?:webp|jpg)/i.test(u)) return { tipo: 'limpa', hasId };
  if (/\/imoveis-fotos\//.test(u)) return { tipo: 'crua', hasId };
  return { tipo: 'outra', hasId };
}

async function main() {
  const tally = {};
  const bump = (k) => (tally[k] = (tally[k] || 0) + 1);
  let totalFotos = 0;
  let recuperaveis = 0; // marcada sem id, mas com imageId na URL

  for (const table of TABLES) {
    let from = 0;
    const page = 500;
    while (true) {
      const { data: rows, error } = await supabase
        .from(table)
        .select('id, fotos')
        .not('fotos', 'is', null)
        .range(from, from + page - 1);
      if (error) { console.warn(`(pulando ${table}: ${error.message})`); break; }
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const fotos = Array.isArray(row.fotos) ? row.fotos : [];
        for (const f of fotos) {
          totalFotos++;
          const { tipo, hasId } = classify(f);
          bump(`${tipo}/${hasId ? 'com-id' : 'sem-id'}`);
          if (tipo === 'marcada' && !hasId && imageIdFromUrl(getUrl(f))) recuperaveis++;
        }
      }
      if (rows.length < page) break;
      from += page;
    }
  }

  console.log('\n📊 Fotos por classe (formato/​id):');
  for (const k of Object.keys(tally).sort()) console.log(`   ${k.padEnd(18)} ${tally[k]}`);
  console.log(`\n   total de fotos: ${totalFotos}`);

  const marcadaSemId = tally['marcada/sem-id'] || 0;
  const marcadaComId = tally['marcada/com-id'] || 0;
  console.log('\n🔧 Impacto no liga/desliga da marca:');
  console.log(`   • "marcada" COM id (reprocessamento normal resolve):   ${marcadaComId}`);
  console.log(`   • "marcada" SEM id (PRESA hoje):                        ${marcadaSemId}`);
  console.log(`     └─ recuperáveis pelo imageId na URL (backfill cura):  ${recuperaveis}`);
  if (marcadaSemId - recuperaveis > 0) {
    console.log(`     └─ sem imageId na URL (não recuperável automático):  ${marcadaSemId - recuperaveis}`);
  }
  console.log('\nNada foi alterado (somente leitura).');
}

main().catch((e) => { console.error(e); process.exit(1); });
