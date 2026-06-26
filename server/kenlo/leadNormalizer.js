/**
 * Normaliza o payload bruto do Kenlo para uma linha de kenlo_leads e filtra
 * leads de teste. Porta as regras já validadas no frontend
 * (kenloLeadsService.ts: saveKenloLeads / shouldIgnoreLead / normalizePortal).
 */
import crypto from 'crypto';
import { portalNameFor } from './kenloConfig.js';

const extractPortalCode = (raw) => {
  const c = [
    raw?.portal, raw?.portalId, raw?.idMediaOrigin, raw?.id_media_origin,
    raw?.origem, raw?.source, raw?.sourceId,
  ];
  for (const v of c) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};

export function normalizeLead(raw, tenantId) {
  const ddd = raw.client?.ddd || '';
  const phoneRaw = raw.client?.phone || '';
  let fullPhone = phoneRaw;
  if (ddd && phoneRaw && !String(phoneRaw).startsWith(String(ddd))) {
    fullPhone = `${ddd}${String(phoneRaw).replace(/\D/g, '')}`;
  }
  const code = extractPortalCode(raw);
  const portal = code !== null ? portalNameFor(code)
    : (typeof raw.portal === 'string' && raw.portal.trim() ? raw.portal : null);

  return {
    tenant_id: tenantId,
    external_id: raw._id || raw.id || `temp-${raw.timestamp || ''}`,
    client_name: raw.client?.name || '',
    client_phone: fullPhone,
    client_email: raw.client?.email || '',
    lead_timestamp: raw.timestamp || new Date(0).toISOString(),
    portal,
    message: raw.message || null,
    interest_image: raw.interest?.image || null,
    interest_reference: raw.interest?.referenceLead || raw.interest?.reference || null,
    interest_type: raw.interest?.type || null,
    interest_is_sale: raw.interest?.isSale ?? null,
    interest_is_rent: raw.interest?.isRent ?? null,
    attended_by_name:
      raw.attendedBy?.name ||
      (Array.isArray(raw.attendedBy) && raw.attendedBy[0]?.name) ||
      null,
    raw_data: raw,
  };
}

export function isTestLead(raw) {
  const id = raw?._id || raw?.id || raw?.external_id;
  const name = raw?.client?.name || raw?.client_name;
  const email = raw?.client?.email || raw?.client_email;
  const phone = raw?.client?.phone || raw?.client_phone;
  const message = raw?.message || raw?.raw_data?.message;
  if (id === '67571a368b8373fff6d92ebc') return true;
  if (name === 'Olx Validador URL') return true;
  if (email === 'olx.validador.url@email.com') return true;
  if (typeof phone === 'string' && phone.replace(/\D/g, '').endsWith('999999999')) return true;
  if (typeof message === 'string' && message.toLowerCase().includes('lead de teste')) return true;
  return false;
}

export function tokenFingerprint(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 8);
}
