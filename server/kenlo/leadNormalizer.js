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

// Etapa do funil derivada do payload Kenlo. Mapeamento por EVIDÊNCIA (amostra real
// de 3.513 leads): status=1 → 0% com corretor (lead novo); status=2/5 → ~80% com
// corretor (já atendido). O Kenlo não expõe etapas avançadas (visita/proposta) neste
// feed de leads — por isso só mapeamos 'new' (Novos Leads) e 'contacted' (Interação).
// Slugs casam com KENLO_STAGE_TO_STATUS no front (leadsService.ts).
const KENLO_STATUS_TO_STAGE = { 1: 'new', 2: 'contacted', 5: 'contacted' };

function mapStage(raw) {
  const known = KENLO_STATUS_TO_STAGE[raw?.status];
  if (known) return known;
  // status desconhecido: usa a presença de corretor como sinal de "foi atendido".
  const temCorretor = raw?.attendedBy?.name || (Array.isArray(raw?.attendedBy) && raw.attendedBy[0]?.name);
  return temCorretor ? 'contacted' : 'new';
}

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
    stage: mapStage(raw),
    raw_data: raw,
  };
}

// Colunas que o Kenlo é DONO: a sincronização pode atualizá-las livremente em
// leads existentes. `stage` e `attended_by_*` ficam de fora porque o CRM também
// as escreve (kanban / atribuição manual) — têm regra de conflito própria no merge.
const KENLO_OWNED_FIELDS = [
  'client_name', 'client_phone', 'client_email', 'lead_timestamp', 'portal',
  'message', 'interest_image', 'interest_reference', 'interest_type',
  'interest_is_sale', 'interest_is_rent', 'raw_data',
];

// Hash do subconjunto que vem do Kenlo (inclui stage/attended_by_name porque são
// sinais de mudança no Kenlo, mesmo que o merge decida não sobrescrevê-los).
// raw_data fica de fora: é volumoso e seus campos relevantes já estão achatados
// nas outras colunas, então hashear o achatado é suficiente e barato.
export function kenloFingerprint(row) {
  const subset = [...KENLO_OWNED_FIELDS.filter((f) => f !== 'raw_data'), 'stage', 'attended_by_name']
    .map((f) => `${f}=${row[f] ?? ''}`)
    .join('|');
  return crypto.createHash('sha256').update(subset).digest('hex').slice(0, 16);
}

/**
 * Calcula o patch para ATUALIZAR um lead já existente, mesclando o payload do
 * Kenlo (`incoming`, já normalizado) com a linha atual do banco (`existing`).
 * Retorna `null` quando nada relevante do Kenlo mudou (evita UPDATE/trigger inúteis).
 *
 * Regras (decididas com o produto):
 *  - Campos KENLO_OWNED: sempre do Kenlo.
 *  - stage: CRM vence — nunca sobrescreve lead existente (corretor manda no kanban).
 *  - attended_by_*: preenche só se o CRM estiver vazio (não rouba atribuição manual).
 *  - Colunas locais (archived_at, first_response_at, temperature, is_exclusive):
 *    nunca entram no patch — preservadas por omissão.
 */
export function mergeLeadUpdate(incoming, existing) {
  const fp = kenloFingerprint(incoming);
  if (existing.kenlo_fingerprint === fp) return null; // nada mudou no Kenlo

  const patch = { kenlo_fingerprint: fp };
  for (const f of KENLO_OWNED_FIELDS) patch[f] = incoming[f];

  // attended_by: preenche apenas quando o CRM ainda não tem corretor.
  if (!existing.attended_by_name && !existing.attended_by_id && incoming.attended_by_name) {
    patch.attended_by_name = incoming.attended_by_name;
    if (incoming.attended_by_id != null) patch.attended_by_id = incoming.attended_by_id;
  }
  return patch;
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
