/**
 * 🩹 BACKFILL: fotos CRUAS (bucket `imoveis-fotos`) → pipeline de marca d'água.
 *
 * Contexto: quando o `POST /api/v1/watermark/photos` falha, o front cai no
 * upload cru (src/lib/watermarkUpload.ts → `rawUpload`) para não derrubar o save
 * do imóvel. Essa foto nunca recebe marca E fica invisível para o
 * liga/desliga e para o reprocessamento (não tem `id` do pipeline).
 * Foi o que aconteceu com o AP0685: 22 de 22 fotos cruas.
 *
 * O que este script faz, por foto crua:
 *   1. baixa o arquivo do bucket cru;
 *   2. `ingestMaster` (dedup por content_hash — rodar de novo não duplica);
 *   3. `ensureDerivative(portal)` — gera o derivado com a marca ATUAL;
 *   4. reescreve a URL para o ENDPOINT estável e grava o `id` no JSONB `fotos`.
 *
 * O arquivo cru NÃO é apagado: se algo der errado, a foto antiga continua lá.
 * Idempotente: depois da troca a URL não casa mais com o bucket cru → é pulada.
 *
 * Só `imoveis_locais`: é a única tabela com fotos cruas (conferido em
 * 11/set/2026: 38 fotos, todas do tenant Lotus Brokers) e é a tabela cujo
 * `codigo_imovel` é o `property_photos.property_id` que o opt-out por imóvel usa.
 *
 * Uso (dry-run, padrão):  node scripts/watermark-backfill-fotos-cruas.mjs
 *      aplicar:           node scripts/watermark-backfill-fotos-cruas.mjs --apply
 *      filtrar:           --codigo=AP0685   --tenant=<uuid>
 *      origem do app:     --base-url=https://…  (default: PUBLIC_BASE_URL do .env)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createWatermarkService } from '../server/watermark/service.js';

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=').slice(1).join('=');
const APPLY = process.argv.includes('--apply');
const CODIGO = arg('codigo');
const TENANT = arg('tenant');
const BASE_URL = (arg('base-url') || process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const RAW_BUCKET = 'imoveis-fotos';
const RAW_MARKER = `/object/public/${RAW_BUCKET}/`;

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('❌ Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }
if (APPLY && !BASE_URL) { console.error('❌ Sem PUBLIC_BASE_URL (ou --base-url=): a URL estável precisa da origem do app'); process.exit(1); }

const supabase = createClient(url, key, { auth: { persistSession: false } });
const wm = createWatermarkService(supabase);

const getUrl = (f) => {
  let v = typeof f === 'string' ? f : f?.url;
  for (let i = 0; v && typeof v === 'object' && i < 5; i++) v = v.url ?? v.publicUrl;
  return typeof v === 'string' ? v : null;
};

/** Caminho dentro do bucket cru, ou null se a URL não for do bucket cru. */
const rawPath = (u) => {
  const i = u?.indexOf(RAW_MARKER) ?? -1;
  return i < 0 ? null : decodeURIComponent(u.slice(i + RAW_MARKER.length).split('?')[0]);
};

/** Mesma URL que o front persiste hoje (src/lib/watermarkUpload.ts): endpoint, não CDN. */
const urlEstavel = (id) => `${BASE_URL}/api/v1/watermark/photos/${id}/portal.jpg`;

async function main() {
  let q = supabase
    .from('imoveis_locais')
    .select('id, tenant_id, codigo_imovel, fotos, updated_at')
    .not('fotos', 'is', null);
  if (CODIGO) q = q.eq('codigo_imovel', CODIGO);
  if (TENANT) q = q.eq('tenant_id', TENANT);
  const { data: rows, error } = await q;
  if (error) { console.error('❌ select imoveis_locais:', error.message); process.exit(1); }

  console.log(`${APPLY ? '🚀 APLICANDO' : '🔎 DRY-RUN'} — ${rows.length} imóveis com fotos${CODIGO ? ` (codigo=${CODIGO})` : ''}`);
  let cruas = 0, migradas = 0, falhas = 0;

  for (const row of rows) {
    const fotos = Array.isArray(row.fotos) ? row.fotos : [];
    const novas = [...fotos];
    let mudou = false;

    for (let i = 0; i < fotos.length; i++) {
      const foto = typeof fotos[i] === 'string' ? { url: fotos[i] } : { ...fotos[i] };
      const path = rawPath(getUrl(foto));
      if (!path) continue;
      cruas++;

      if (!APPLY) { console.log(`  [dry] ${row.codigo_imovel} #${i} ${path}`); continue; }

      try {
        const { data: blob, error: dErr } = await supabase.storage.from(RAW_BUCKET).download(path);
        if (dErr || !blob) throw new Error(`download: ${dErr?.message || 'vazio'}`);

        const photo = await wm.ingestMaster({
          tenantId: row.tenant_id,
          propertyId: row.codigo_imovel,
          buffer: Buffer.from(await blob.arrayBuffer()),
          contentType: blob.type || 'image/jpeg',
          position: i,
          caption: foto.legenda || '',
        });
        await wm.ensureDerivative(photo.id, 'portal'); // gera já, e falha aqui se a imagem for inválida

        novas[i] = { ...foto, url: urlEstavel(photo.id), id: photo.id };
        mudou = true;
        migradas++;
        console.log(`  ✅ ${row.codigo_imovel} #${i} → ${photo.id}`);
      } catch (e) {
        falhas++;
        console.warn(`  ⚠️  ${row.codigo_imovel} #${i} (${path}): ${e.message} — mantida crua`);
      }
    }

    if (mudou) {
      const { error: uErr } = await supabase.from('imoveis_locais').update({ fotos: novas }).eq('id', row.id);
      if (uErr) { falhas++; console.error(`  ❌ update ${row.codigo_imovel}: ${uErr.message}`); continue; }

      // Backfill de marca d'água não é "mexida do corretor" — a regra dos 3 meses
      // (20260817_imoveis_locais_touch_updated_at) não pode reiniciar por causa dele.
      // Precisa ser um SEGUNDO update: a escapatória do trigger só respeita o valor
      // enviado quando ele DIFERE do atual, e mandar o updated_at antigo junto com
      // as fotos é indistinguível de não mandar nada (NEW = OLD) — o trigger põe
      // NOW(). Depois do primeiro update o relógio já foi para NOW(), então agora o
      // valor antigo difere e vence. O log ignora updated_at, então não vira ruído.
      if (row.updated_at) {
        const { error: rErr } = await supabase
          .from('imoveis_locais').update({ updated_at: row.updated_at }).eq('id', row.id);
        if (rErr) console.warn(`  ⚠️  ${row.codigo_imovel}: updated_at não restaurado (${rErr.message})`);
      }
    }
  }

  console.log(`\n📊 cruas encontradas: ${cruas} | migradas: ${migradas} | falhas: ${falhas}`);
  if (!APPLY && cruas) console.log('   Rode com --apply para migrar.');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
