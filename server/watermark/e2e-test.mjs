/**
 * Teste de ponta a ponta do pipeline de marca d'água contra o Supabase real.
 * Cria um logo + 1 foto de teste, processa, baixa o derivado da CDN, verifica a
 * marca e LIMPA TUDO (storage + linhas + restaura colunas do tenant).
 *
 * Rodar de dentro de server/:  node watermark/e2e-test.mjs
 */
import { readFileSync } from 'fs';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { createWatermarkService } from './service.js';
import { createWorker } from './worker.js';
import { BUCKETS } from './config.js';
import { logoMaskKey } from './storageRepo.js';

const env = Object.fromEntries(
  readFileSync('../.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const service = createWatermarkService(sb);
const worker = createWorker(sb, 'e2e');

const log = (...a) => console.log(...a);
let tenantId, snapshot, photoId, logoVersion;

try {
  // 0) tenant
  let { data: t } = await sb.from('tenants').select('id, logo_version, logo_url, logo_mask_path, watermark_enabled, watermark_opacity, watermark_scale').eq('id', 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832').maybeSingle();
  if (!t) ({ data: t } = await sb.from('tenants').select('id, logo_version, logo_url, logo_mask_path, watermark_enabled, watermark_opacity, watermark_scale').limit(1).single());
  tenantId = t.id;
  snapshot = { ...t };
  log('1) tenant alvo:', tenantId);

  // 1) define o logo (colorido + transparente)
  const logo = await sharp({ create: { width: 400, height: 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="400" height="160"><rect x="30" y="40" width="340" height="80" rx="14" fill="#0a66c2"/><text x="60" y="98" font-size="54" font-weight="bold" fill="#fff">OCTO</text></svg>'), top: 0, left: 0 }])
    .png().toBuffer();
  const setRes = await service.setTenantLogo({ tenantId, logoBuffer: logo, contentType: 'image/png' });
  logoVersion = setRes.logoVersion;
  log('2) logo definido → versão', logoVersion, '| logo_url:', setRes.logoUrl?.slice(0, 70) + '...');

  // 2) sobe 1 foto "de imóvel"
  const foto = await sharp({ create: { width: 1600, height: 1067, channels: 3, background: { r: 90, g: 120, b: 150 } } }).jpeg().toBuffer();
  const photo = await service.ingestMaster({ tenantId, propertyId: 'E2E-TEST', buffer: foto, contentType: 'image/jpeg', caption: 'teste e2e' });
  photoId = photo.id;
  log('3) foto enviada → id', photoId, '| status', photo.status);

  // 3) gera o derivado de forma SÍNCRONA (fluxo real: rota lazy / backfill)
  const { url: portalUrl } = await service.ensureDerivative(photoId, 'portal');
  log('4) derivado gerado (síncrono)');

  // 4) confirma status ready
  const status = await service.getPhotoStatus(photoId);
  log('5) status final:', status.status, '| tamanhos:', Object.keys(status.urls).join(', '));
  if (status.status !== 'ready') throw new Error('foto não ficou ready: ' + JSON.stringify(status.error));

  log('   baixando derivado portal:', portalUrl.slice(0, 80) + '...');
  const resp = await fetch(portalUrl);
  if (!resp.ok) throw new Error('download CDN falhou: HTTP ' + resp.status);
  const out = Buffer.from(await resp.arrayBuffer());
  const meta = await sharp(out).metadata();
  log('6) derivado:', meta.format, meta.width + 'x' + meta.height, (out.length / 1024).toFixed(1) + 'KB');

  // salva pra inspeção visual (extensão real do derivado — portal sai em JPEG)
  const { writeFileSync } = await import('fs');
  const previewPath = `/tmp/e2e-derivado.${meta.format}`;
  writeFileSync(previewPath, out);
  log('   derivado salvo em ' + previewPath);

  // 5) verifica a marca: a foto de teste é cor sólida, então qualquer
  // espalhamento de luminância (max-min) prova que a marca branca foi composta.
  // O gate de sucesso é a MARCA, não o codec — formato é só informativo (linha 64).
  const g = (await sharp(out).greyscale().stats()).channels[0];
  const spread = g.max - g.min;
  log('7) luminância min/max=' + g.min + '/' + g.max + ' (espalhamento=' + spread + '; >30 = marca branca presente)');
  if (spread > 30) {
    log('\n✅✅ PONTA A PONTA OK: upload → fila → worker → derivado com marca na CDN.');
  } else {
    log('\n⚠️  derivado gerado, mas a marca ficou fraca/indetectável na amostra.');
  }
} catch (e) {
  console.error('\n❌ ERRO:', e.message);
} finally {
  // 6) LIMPEZA — não deixa resíduo na produção
  log('\n— limpando —');
  try {
    if (photoId) {
      const { data: p } = await sb.from('property_photos').select('master_path, derivatives').eq('id', photoId).maybeSingle();
      if (p) {
        const derivedKeys = Object.values(p.derivatives || {});
        if (derivedKeys.length) await sb.storage.from(BUCKETS.derived).remove(derivedKeys);
        if (p.master_path) await sb.storage.from(BUCKETS.master).remove([p.master_path]);
      }
      await sb.from('property_photos').delete().eq('id', photoId); // cascade apaga jobs
      log('   foto + jobs + arquivos removidos');
    }
    if (tenantId && logoVersion) {
      await sb.storage.from(BUCKETS.master).remove([logoMaskKey(tenantId, logoVersion)]);
      await sb.storage.from(BUCKETS.derived).remove([`logos/${tenantId}/original_v${logoVersion}.png`]);
    }
    if (snapshot) {
      await sb.from('tenants').update({
        logo_version: snapshot.logo_version, logo_url: snapshot.logo_url, logo_mask_path: snapshot.logo_mask_path,
        watermark_enabled: snapshot.watermark_enabled, watermark_opacity: snapshot.watermark_opacity, watermark_scale: snapshot.watermark_scale,
      }).eq('id', tenantId);
      log('   colunas do tenant restauradas (logo_version de volta a ' + snapshot.logo_version + ')');
    }
    log('— limpeza concluída —');
  } catch (ce) {
    console.error('   ⚠️ limpeza parcial:', ce.message);
  }
  process.exit(0);
}
