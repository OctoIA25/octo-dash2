/**
 * Migra as fotos de membro de `tenant_memberships.permissions.photo` (data-URI)
 * para o bucket público `membros-fotos`, deixando no banco só o link.
 *
 * POR QUE EXISTE
 * Fotos em data-URI inflavam `permissions`: 12 fotos, 6,2 MB, e toda listagem de
 * membros baixava tudo — sob carga estourava o statement timeout (57014).
 * Ver supabase/migrations/20260914_fotos_membros_no_storage.sql.
 *
 * COMO É SEGURO
 * - Lê da cópia de segurança `tenant_memberships_fotos_backup` (feita pela
 *   migration ANTES de qualquer troca) — é também a fonte do rollback.
 * - Envia, BAIXA DE VOLTA o link público e confere os bytes antes de trocar.
 * - A troca é `migrar_foto_membro()`: só acontece se a foto no banco ainda for a
 *   da cópia (md5). Membro editado no meio do caminho fica como está.
 * - Caminho determinístico (hash do conteúdo): rodar de novo não duplica arquivo.
 * - Dry-run por padrão; --apply grava. Não imprime foto nem dado pessoal.
 *
 * Uso:
 *   node scripts/migrar-fotos-membros-storage.mjs            # dry-run
 *   node scripts/migrar-fotos-membros-storage.mjs --apply
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const BUCKET = 'membros-fotos';
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const kb = (n) => `${Math.round(n / 1024)} kB`;

function decodificar(dataUri) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUri);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!EXT[mime]) return null;
  const bytes = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  return bytes.length ? { mime: mime === 'image/jpg' ? 'image/jpeg' : mime, ext: EXT[mime], bytes } : null;
}

async function conferirPublico(link, bytesEsperados) {
  const resp = await fetch(link);
  if (!resp.ok) return `HTTP ${resp.status}`;
  const baixado = Buffer.from(await resp.arrayBuffer());
  if (!baixado.equals(bytesEsperados)) return `bytes diferentes (${baixado.length} de ${bytesEsperados.length})`;
  return null;
}

const { data: copias, error } = await supabase
  .from('tenant_memberships_fotos_backup')
  .select('membership_id, tenant_id, photo, migrado_em')
  .is('migrado_em', null);
if (error) { console.error('leitura da cópia de segurança falhou:', error.message); process.exit(1); }

console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'} — ${copias.length} foto(s) a migrar\n`);
const total = { migradas: 0, jaEditadas: 0, invalidas: 0, falhas: 0 };

for (const copia of copias) {
  const rotulo = `membro ${copia.membership_id.slice(0, 8)}`;
  const img = decodificar(copia.photo);
  if (!img) { console.log(`⚠️  ${rotulo}: data-URI não reconhecido — pulado`); total.invalidas++; continue; }

  const hash = createHash('sha256').update(img.bytes).digest('hex').slice(0, 16);
  const path = `${copia.tenant_id}/membro-${copia.membership_id}-${hash}.${img.ext}`;
  const link = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  if (!APPLY) { console.log(`• ${rotulo}: ${img.mime}, ${kb(copia.photo.length)} → ${kb(img.bytes.length)} no bucket`); continue; }

  const { error: erroUpload } = await supabase.storage.from(BUCKET)
    .upload(path, img.bytes, { contentType: img.mime, upsert: true, cacheControl: '31536000' });
  if (erroUpload) { console.log(`❌ ${rotulo}: envio falhou — ${erroUpload.message}`); total.falhas++; continue; }

  const problema = await conferirPublico(link, img.bytes);
  if (problema) { console.log(`❌ ${rotulo}: link público não confere — ${problema}. Foto NÃO trocada.`); total.falhas++; continue; }

  const md5 = createHash('md5').update(copia.photo, 'utf8').digest('hex');
  const { data: trocou, error: erroTroca } = await supabase.rpc('migrar_foto_membro', {
    p_membership_id: copia.membership_id, p_url: link, p_md5: md5,
  });
  if (erroTroca) { console.log(`❌ ${rotulo}: troca falhou — ${erroTroca.message}`); total.falhas++; continue; }
  if (!trocou) { console.log(`↷ ${rotulo}: foto mudou desde a cópia — deixada como está`); total.jaEditadas++; continue; }

  console.log(`✅ ${rotulo}: ${kb(copia.photo.length)} → link (${kb(img.bytes.length)} no bucket)`);
  total.migradas++;
}

console.log('\nResumo:', total);
if (total.falhas) process.exit(2);
