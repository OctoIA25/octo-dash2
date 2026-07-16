/**
 * Normaliza o payload da Contact2Sale (item de data[] do GET /integration/leads,
 * conforme docs-api-leads.c2sapp.com) para a linha canônica de kenlo_leads, e
 * define a política de merge do provider C2S.
 *
 * OWNERSHIP (diferente do Kenlo — decisões D1/D4): a C2S é o CRM PRINCIPAL do
 * tenant, então a origem vence também em stage, attended_by_name e arquivamento
 * (archived_at/archive_reason). Colunas locais do nosso CRM (temperature,
 * first_response_at, is_exclusive) continuam intocáveis por omissão.
 * attended_by_id NUNCA é escrito: o id de seller da C2S é hash da C2S, não uuid
 * de tenant_brokers (o Kanban casa kenlo_leads por attended_by_name).
 *
 * ARQUIVAMENTO: kenlo_leads NÃO tem coluna is_archived — o sinal canônico é
 * archived_at IS NOT NULL (migration 20260402; Kanban filtra .is('archived_at',
 * null)). Aqui: arquivado na C2S ⇒ archived_at ≈ updated_at da C2S (ela não
 * expõe data de arquivamento); ativo ⇒ archived_at null.
 */
import crypto from 'crypto';

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

// Convenção de kenlo_leads (paridade com o normalizer do Kenlo): DDD+número,
// sem DDI 55 — o trigger de conversa WhatsApp canonicaliza a partir disso.
function normalizePhone(customer) {
  let p = onlyDigits(customer?.phone || customer?.phone2 || customer?.phone_global || '');
  if (p.length > 11 && p.startsWith('55')) p = p.slice(2);
  return p;
}

// Extrai o código do imóvel: prefere prop_ref; fallback para description quando
// a C2S manda o código diretamente no campo (ex.: description="AP1146" com
// prop_ref=null) ou no padrão [CODIGO] (ex.: "[AP1146] Apartamento...").
function extractPropRef(product) {
  if (product?.prop_ref) return product.prop_ref;
  const desc = product?.description || '';
  const bracket = desc.match(/^\[([A-Z]{2}\d+)\]/);
  if (bracket) return bracket[1];
  const bare = desc.match(/^([A-Z]{2}\d+)$/);
  if (bare) return bare[1];
  return null;
}

// A mensagem do lead é a primeira fala do CLIENTE (messages inclui falas do
// corretor). Fallbacks: first_message (se a API incluir) e a description do
// interesse — validar formato real no piloto com token de produção.
function firstCustomerMessage(rawItem) {
  const msgs = Array.isArray(rawItem?.messages) ? rawItem.messages : [];
  const fromCustomer = msgs.find((m) => m?.sender_type === 'Customer' && m?.body);
  if (fromCustomer) return fromCustomer.body;
  const fm = rawItem?.attributes?.first_message;
  if (typeof fm === 'string' && fm) return fm;
  if (fm?.body) return fm.body;
  return rawItem?.attributes?.description || null;
}

// A C2S expõe o funil detalhado em `funnel_status.status` (New lead, In
// attendance, Scheduled visit, Done visit, Created offer) — mapeamos para os
// mesmos slugs INGLÊS que kenlo_leads.stage aceita (CHECK do banco) e que o
// Kanban traduz para suas colunas (KENLO_STAGE_TO_STATUS no leadsService.ts:
// new→Novos Leads, contacted→Interação, qualified→Visita Agendada,
// visit_scheduled→Visita Agendada, visit_done→Visita Realizada,
// negotiation→Negociação, proposal→Proposta Enviada, closed_won→Proposta
// Assinada, closed_lost→Arquivado). NÃO gravar slugs pt-BR nem 'visit' — o CHECK
// rejeita.
const FUNNEL_STATUS_TO_STAGE = {
  'new lead': 'new',
  'in attendance': 'contacted',
  'scheduled visit': 'visit_scheduled',
  'done visit': 'visit_done',
  'created offer': 'proposal',
};

// Estados MACRO/terminais do lead_status.alias (vencem o funil quando definitivos).
const LEAD_STATUS_TO_STAGE = {
  new: 'new',
  under_negotiation: 'negotiation',
  converted: 'closed_won',
  lost: 'closed_lost',
};

function mapStage(attrs) {
  const alias = (attrs?.lead_status?.alias || '').toLowerCase();
  // Terminais primeiro: fechado/arquivado são definitivos, independem do funil.
  if (alias === 'converted') return 'closed_won';
  if (alias === 'lost') return 'closed_lost';
  // Funil detalhado (o que posiciona nas colunas intermediárias do Kanban).
  const funnel = (attrs?.funnel_status?.status || '').toLowerCase();
  if (FUNNEL_STATUS_TO_STAGE[funnel]) return FUNNEL_STATUS_TO_STAGE[funnel];
  // Sem funil reconhecido: usa o macro-estado; por fim, presença de corretor.
  if (LEAD_STATUS_TO_STAGE[alias]) return LEAD_STATUS_TO_STAGE[alias];
  return attrs?.seller?.name ? 'contacted' : 'new';
}

export function normalizeC2sLead(rawItem, tenantId) {
  const a = rawItem?.attributes || {};
  const negotiation = a.product?.real_estate_detail?.negotiation_name || null;
  const isArchived = Boolean(a.archive_details?.archived);
  return {
    tenant_id: tenantId,
    external_id: rawItem.id, // id criptografado da C2S: opaco, estável — usar como veio
    client_name: a.customer?.name || '',
    client_phone: normalizePhone(a.customer),
    client_email: a.customer?.email || '',
    lead_timestamp: a.created_at || new Date(0).toISOString(),
    portal: a.lead_source?.name || a.channel?.name || null,
    message: firstCustomerMessage(rawItem),
    interest_image: a.product?.image || null,
    interest_reference: extractPropRef(a.product),
    interest_type: negotiation,
    interest_is_sale: negotiation ? /venda|compra/i.test(negotiation) : null,
    interest_is_rent: negotiation ? /loca|alug/i.test(negotiation) : null,
    attended_by_name: a.seller?.name || null,
    stage: mapStage(a),
    archived_at: isArchived ? (a.updated_at || null) : null,
    archive_reason: isArchived ? (a.archive_details?.archive_notes || null) : null,
    raw_data: rawItem,
  };
}

const C2S_BASE_OWNED = [
  'client_name', 'client_phone', 'client_email', 'lead_timestamp', 'portal',
  'message', 'interest_image', 'interest_reference', 'interest_type',
  'interest_is_sale', 'interest_is_rent', 'raw_data',
];

// Origem vence TAMBÉM nestes (D1/D4) — é a diferença central vs o merge Kenlo.
// archived_at fica FORA da lista: é timestamp derivado de updated_at e tem
// regra própria de transição no merge (senão cada toque na C2S o reescreveria).
const C2S_OWNED_FIELDS = [...C2S_BASE_OWNED, 'stage', 'attended_by_name', 'archive_reason'];

// Hash dos campos que a C2S possui (sem raw_data — volumoso e já achatado).
// O estado de arquivamento entra como boolean DERIVADO de archived_at (estável),
// nunca o timestamp em si. Gravado na coluna canônica kenlo_fingerprint
// (o conteúdo do hash é por-provider, por contrato do engine).
export function c2sFingerprint(row) {
  const subset = C2S_OWNED_FIELDS.filter((f) => f !== 'raw_data')
    .map((f) => `${f}=${row[f] ?? ''}`)
    .join('|');
  return crypto.createHash('sha256')
    .update(`${subset}|archived=${row.archived_at != null}`)
    .digest('hex').slice(0, 16);
}

/**
 * Patch para ATUALIZAR lead existente — origem vence com dirty-check.
 * Retorna null quando nada que a C2S possui mudou (zero UPDATE/trigger).
 */
export function mergeC2sLeadUpdate(incoming, existing) {
  const fp = c2sFingerprint(incoming);
  if (existing.kenlo_fingerprint === fp) return null;

  const patch = { kenlo_fingerprint: fp };
  for (const f of C2S_OWNED_FIELDS) patch[f] = incoming[f];

  // archived_at só na TRANSIÇÃO (detectada por nulidade — sinal canônico):
  // preserva o carimbo original enquanto o estado não muda; grava no
  // arquivamento; limpa no desarquivamento (lead "resgatado" na C2S).
  const incomingArchived = incoming.archived_at != null;
  const existingArchived = existing.archived_at != null;
  if (incomingArchived !== existingArchived) {
    patch.archived_at = incomingArchived ? incoming.archived_at : null;
  }
  return patch;
}
