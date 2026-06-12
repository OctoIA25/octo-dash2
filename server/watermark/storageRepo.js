/**
 * 🗄️ Camada de acesso ao Supabase Storage — chaves versionadas + idempotência.
 *
 * Esquema de chaves (o coração da invalidação em massa):
 *   master   tenants/{tenantId}/properties/{propertyId}/{imageId}/original.bin   (IMUTÁVEL)
 *   derivado tenants/{tenantId}/properties/{propertyId}/{imageId}/wm_v{ver}_{size}.webp
 *   máscara  logos/{tenantId}/mask_v{ver}.png
 *
 * Como `ver` (logo_version) entra na chave do derivado, trocar o logo muda a
 * chave que o CRM pede — os derivados antigos viram órfãos (limpos por lifecycle)
 * e os novos são gerados sob demanda/em lote. Nenhum arquivo é "editado".
 */
import { BUCKETS } from './config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Defesa em profundidade contra path traversal/colisão cross-tenant: tenantId e
// imageId DEVEM ser UUID; propertyId (livre) é restrito a um allowlist seguro.
function safeSegments({ tenantId, propertyId, imageId }) {
  if (!UUID.test(String(tenantId))) throw new Error('tenantId inválido (esperado UUID)');
  if (!UUID.test(String(imageId))) throw new Error('imageId inválido (esperado UUID)');
  const prop = propertyId == null || propertyId === '' ? 'unassigned' : String(propertyId);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(prop)) throw new Error('propertyId inválido');
  return { tenantId, prop, imageId };
}

export function masterKey(ref) {
  const { tenantId, prop, imageId } = safeSegments(ref);
  return `tenants/${tenantId}/properties/${prop}/${imageId}/original.bin`;
}

// Código curto da posição na chave do derivado. 'center' (default histórico)
// fica SEM sufixo de propósito: as chaves existentes continuam válidas e nada
// é regenerado em massa ao fazer deploy desta feature.
const POSITION_CODES = { 'top-left': 'tl', 'top-right': 'tr', 'bottom-left': 'bl', 'bottom-right': 'br' };

export function derivedKey(ref, logoVersion, size, opacity = 0.35, scale = 0.3, position = 'center') {
  const { tenantId, prop, imageId } = safeSegments(ref);
  // opacidade/escala/posição entram na chave: mudar qualquer parâmetro da marca gera
  // uma chave NOVA → regenera o derivado e troca a URL (evita servir o arquivo cacheado).
  const o = Math.round(Math.min(1, Math.max(0, opacity)) * 100);
  const s = Math.round(Math.min(1, Math.max(0, scale)) * 100);
  const p = POSITION_CODES[position] ? `_p${POSITION_CODES[position]}` : '';
  return `tenants/${tenantId}/properties/${prop}/${imageId}/wm_v${logoVersion}_o${o}_s${s}${p}_${size}.webp`;
}

/** Derivado SEM marca (apenas redimensionado) — servido quando a marca está desligada. */
export function cleanKey(ref, size) {
  const { tenantId, prop, imageId } = safeSegments(ref);
  return `tenants/${tenantId}/properties/${prop}/${imageId}/clean_${size}.webp`;
}

export function logoMaskKey(tenantId, logoVersion) {
  return `logos/${tenantId}/mask_v${logoVersion}.png`;
}

export function createStorageRepo(supabase) {
  /** Idempotência: o derivado já existe? Então NÃO reprocessa. */
  async function derivedExists(key) {
    const idx = key.lastIndexOf('/');
    const dir = key.slice(0, idx);
    const name = key.slice(idx + 1);
    const { data, error } = await supabase.storage.from(BUCKETS.derived).list(dir, {
      search: name,
      limit: 1,
    });
    if (error) return false;
    return (data || []).some((f) => f.name === name);
  }

  async function putMaster(key, buffer, contentType) {
    const { error } = await supabase.storage
      .from(BUCKETS.master)
      .upload(key, buffer, { contentType, upsert: true });
    if (error) throw new Error(`putMaster: ${error.message}`);
    return key;
  }

  async function getMaster(key) {
    const { data, error } = await supabase.storage.from(BUCKETS.master).download(key);
    if (error) throw new Error(`getMaster: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async function putDerivative(key, buffer) {
    const { error } = await supabase.storage
      .from(BUCKETS.derived)
      .upload(key, buffer, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
    if (error) throw new Error(`putDerivative: ${error.message}`);
    return key;
  }

  /** URL pública (servida pela CDN do Supabase) de um derivado. */
  function publicUrl(key) {
    return supabase.storage.from(BUCKETS.derived).getPublicUrl(key).data.publicUrl;
  }

  async function putLogoMask(tenantId, logoVersion, buffer) {
    const key = logoMaskKey(tenantId, logoVersion);
    const { error } = await supabase.storage
      .from(BUCKETS.master)
      .upload(key, buffer, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`putLogoMask: ${error.message}`);
    return key;
  }

  /** Logo ORIGINAL (colorido) no bucket público — só para preview na UI. */
  async function putLogoOriginal(tenantId, logoVersion, buffer, contentType) {
    const key = `logos/${tenantId}/original_v${logoVersion}.png`;
    const { error } = await supabase.storage
      .from(BUCKETS.derived)
      .upload(key, buffer, { contentType: contentType || 'image/png', upsert: true });
    if (error) throw new Error(`putLogoOriginal: ${error.message}`);
    return key;
  }

  async function getLogoMask(maskPath) {
    const { data, error } = await supabase.storage.from(BUCKETS.master).download(maskPath);
    if (error) throw new Error(`getLogoMask: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  return {
    derivedExists,
    putMaster,
    getMaster,
    putDerivative,
    publicUrl,
    putLogoMask,
    putLogoOriginal,
    getLogoMask,
  };
}
