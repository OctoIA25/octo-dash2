/**
 * Backfill: leva as fotos JÁ existentes (URLs cruas, sem marca) dos imóveis e
 * condomínios para dentro do pipeline e troca a URL pela do derivado COM MARCA.
 *
 * Uso (de dentro de server/):
 *   node watermark/backfill.mjs --tenant <id> [--table imoveis_locais|condominios|both]
 *                               [--maxPhotos N] [--apply]
 *
 *   sem --apply  → DRY-RUN: gera os derivados e mostra antes/depois, mas NÃO
 *                  altera o JSONB `fotos` (seguro para inspecionar).
 *   com --apply  → grava as novas URLs no JSONB.
 *
 * Idempotente: fotos cuja URL já aponta para o bucket de derivados são puladas.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { createWatermarkService } from './service.js';
import { BUCKETS } from './config.js';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def;
};
const TENANT = getArg('tenant', null);
const TABLE = getArg('table', 'both');
const MAX_PHOTOS = Number(getArg('maxPhotos', Infinity));
const APPLY = !!getArg('apply', false);
// URL gravada no JSONB:
//   cdn      → URL direta da CDN do derivado (funciona sem o app; toggle NÃO surte
//              efeito porque não passa pelo endpoint). Bom para desbloquear antes do deploy.
//   endpoint → URL do app (/api/v1/watermark/photos/:id/portal): sobrevive a troca de
//              logo e ao TOGGLE da marca. Requer o app deployado. Precisa de --appUrl.
const URL_MODE = String(getArg('urlMode', 'cdn'));
const APP_URL = String(getArg('appUrl', '') || '').replace(/\/$/, '');
if (URL_MODE === 'endpoint' && !APP_URL) {
  console.error('❌ --urlMode endpoint requer --appUrl https://seu-dominio');
  process.exit(1);
}
const urlFor = (id, cdnUrl) => (URL_MODE === 'endpoint' ? `${APP_URL}/api/v1/watermark/photos/${id}/portal` : cdnUrl);

const env = Object.fromEntries(
  readFileSync('../.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const service = createWatermarkService(sb);

const ALL_TABLES = ['imoveis_locais', 'condominios', 'lancamentos'];
const tables = (TABLE === 'both' || TABLE === 'all') ? ALL_TABLES : [TABLE];
const propIdField = { imoveis_locais: 'codigo_imovel', condominios: 'id', lancamentos: 'id' };

// Uma foto "crua" = http(s) que NÃO está no bucket de derivados (já com marca).
const isRaw = (url) => typeof url === 'string' && /^https?:\/\//.test(url) && !url.includes(`/${BUCKETS.derived}/`);

let processed = 0, skipped = 0, failed = 0, recordsChanged = 0, photoCount = 0;

console.log(`\n🔧 Backfill ${APPLY ? '(APLICANDO)' : '(DRY-RUN — não grava JSONB)'} | tenant=${TENANT || 'TODOS'} | tabelas=${tables.join(',')} | maxPhotos=${MAX_PHOTOS}\n`);

for (const table of tables) {
  if (photoCount >= MAX_PHOTOS) break;
  let from = 0; const page = 200;
  while (photoCount < MAX_PHOTOS) {
    let q = sb.from(table).select(`id, ${propIdField[table]}, fotos`).not('fotos', 'is', null).range(from, from + page - 1);
    if (TENANT) q = q.eq('tenant_id', TENANT);
    const { data: rows, error } = await q;
    if (error) { console.error(`❌ ${table}:`, error.message); break; }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      if (photoCount >= MAX_PHOTOS) break;
      const fotos = Array.isArray(row.fotos) ? row.fotos : [];
      if (fotos.length === 0) continue;
      const tenantId = TENANT; // já filtrado; backfill roda por tenant
      const propertyId = String(row[propIdField[table]] ?? row.id);

      let changed = false;
      const novas = [];
      for (const f of fotos) {
        if (photoCount >= MAX_PHOTOS) { novas.push(f); continue; }
        const fotoObj = typeof f === 'string' ? { url: f } : { ...f };

        // Já está no pipeline (tem id)? Reaponta para a URL atual (regenera a variante).
        // Cobre re-execução após troca de logo / mudança de urlMode.
        if (fotoObj.id) {
          try {
            const { url: cdn } = await service.ensureDerivative(fotoObj.id, 'portal');
            const url = urlFor(fotoObj.id, cdn);
            if (fotoObj.url !== url) changed = true;
            novas.push({ ...fotoObj, url });
          } catch { novas.push(fotoObj); }
          continue;
        }
        if (!isRaw(fotoObj.url)) { novas.push(fotoObj); skipped++; continue; }

        photoCount++;
        try {
          const resp = await fetch(fotoObj.url);
          if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
          const buffer = Buffer.from(await resp.arrayBuffer());
          const contentType = resp.headers.get('content-type') || 'image/jpeg';

          const photo = await service.ingestMaster({ tenantId, propertyId, buffer, contentType });
          const { url: cdn } = await service.ensureDerivative(photo.id, 'portal'); // gera o arquivo
          const url = urlFor(photo.id, cdn);

          console.log(`  ✓ ${table}/${propertyId}: ${fotoObj.url.slice(-32)} → photos/${photo.id.slice(0, 8)}…`);
          novas.push({ ...fotoObj, url, id: photo.id });
          changed = true;
          processed++;
        } catch (e) {
          console.warn(`  ⚠️ falha (${propertyId}): ${e.message} — mantendo URL crua`);
          novas.push(fotoObj);
          failed++;
        }
      }

      if (changed) {
        recordsChanged++;
        if (APPLY) {
          const { error: uErr } = await sb.from(table).update({ fotos: novas }).eq('id', row.id);
          if (uErr) console.error(`  ❌ update ${table}/${row.id}: ${uErr.message}`);
        }
      }
    }

    if (rows.length < page) break;
    from += page;
  }
}

console.log(`\n📊 Resumo: ${processed} foto(s) processada(s), ${skipped} já com marca/puladas, ${failed} falha(s), ${recordsChanged} registro(s) ${APPLY ? 'atualizado(s)' : 'que seriam atualizados'}.`);
if (!APPLY) console.log('   (DRY-RUN: rode de novo com --apply para gravar as novas URLs no JSONB)');
process.exit(0);
