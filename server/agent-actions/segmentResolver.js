/**
 * 🔍 Resolução de segmentos do Agente Disparador.
 *
 * Traduz um SEGMENTO estruturado (saída do interpretador) numa lista de clientes.
 * O resolver é agnóstico à tabela física: o descritor de FONTE (segmentSources.js)
 * declara tabela, colunas-chave e mapeamento de linha. KENLO é o default (back-compat).
 *
 * Regras invioláveis:
 *  - SEMPRE escopado por tenant_id (o servidor usa service_role e ignora RLS;
 *    o tenant-scope manual é a ÚNICA proteção contra vazamento cross-tenant).
 *  - Escopo de corretor: se `brokerScope` for passado (role corretor), a busca é
 *    forçada a <source.cols.agent> = brokerScope — o corretor só atinge seus leads.
 *
 * Determinístico e testável: recebe o client Supabase por parâmetro; nenhum
 * acoplamento com HTTP. `nowMs` é injetável para testar janelas temporais.
 */

export { KENLO_SOURCE, LEADS_SOURCE } from './segmentSources.js';
import { KENLO_SOURCE } from './segmentSources.js';

// Mesma sanitização do api-server: remove caracteres que quebram o filtro
// PostgREST (.or/.ilike) e poderiam ser usados para injeção de filtro.
const sanitizeFilterValue = (value) => String(value ?? '').replace(/[,()*\\]/g, ' ').trim();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aplica tenant-scope, escopo de corretor e seleção de colunas — comum a todos os segmentos. */
function baseQuery(supabase, { tenantId, brokerScope }, source) {
  let query = supabase.from(source.table).select(source.select).eq('tenant_id', tenantId);
  if (brokerScope) query = query.eq(source.cols.agent, brokerScope);
  return query;
}

/**
 * Resolve o segmento para uma fonte específica → { ok, rows } ou { ok:false, error }.
 *
 * @param supabase  client Supabase (service_role)
 * @param segment   { type, ...params } vindo do interpretador
 * @param ctx       { tenantId, brokerScope?, nowMs?, maxRows? }
 * @param source    descritor de fonte (KENLO_SOURCE | LEADS_SOURCE | outro)
 */
export async function resolveSegmentForSource(supabase, segment, ctx, source) {
  const { tenantId, brokerScope = null, nowMs = Date.now(), maxRows = 5000 } = ctx || {};
  if (!tenantId) return { ok: false, error: 'tenant_required' };
  if (!segment || typeof segment !== 'object' || !segment.type) {
    return { ok: false, error: 'invalid_segment' };
  }

  let query;
  switch (segment.type) {
    // "Envie uma mensagem para o cliente João Silva" / lista explícita de nomes.
    // explicit_list NÃO aplica leadTypeFilter — buscamos pelo nome independente do tipo.
    case 'explicit_list': {
      const names = Array.isArray(segment.names) ? segment.names.filter(Boolean) : [];
      if (names.length === 0) return { ok: false, error: 'empty_explicit_list' };
      // OR de ilike por nome — casa "joão silva" mesmo com acentuação/caixa.
      const ors = names
        .map((n) => `${source.cols.name}.ilike.%${sanitizeFilterValue(n)}%`)
        .join(',');
      query = baseQuery(supabase, { tenantId, brokerScope }, source).or(ors);
      break;
    }

    // "Todos os clientes arquivados".
    case 'archived': {
      query = baseQuery(supabase, { tenantId, brokerScope }, source)
        .not(source.cols.archivedAt, 'is', null);
      break;
    }

    // "Arquivados há mais de N dias" — archivedAt <= now - N dias.
    case 'archived_period': {
      const days = Number(segment.days);
      if (!Number.isFinite(days) || days < 0) return { ok: false, error: 'invalid_days' };
      const thresholdIso = new Date(nowMs - days * DAY_MS).toISOString();
      query = baseQuery(supabase, { tenantId, brokerScope }, source)
        .not(source.cols.archivedAt, 'is', null)
        .lte(source.cols.archivedAt, thresholdIso);
      break;
    }

    // "Clientes da corretora X" — força cols.agent (ignora brokerScope só
    // se ele não estiver setado; se houver brokerScope, o corretor não pode
    // mirar outro corretor, então o filtro do scope prevalece e tende a vazio).
    case 'by_broker': {
      const broker = sanitizeFilterValue(segment.broker);
      if (!broker) return { ok: false, error: 'invalid_broker' };
      query = baseQuery(supabase, { tenantId, brokerScope }, source)
        .ilike(source.cols.agent, `%${broker}%`);
      break;
    }

    // "Sem atendimento nos últimos N dias" — activity <= now - N dias.
    // Usamos cols.activity como proxy de "última interação". Inclui apenas leads ativos.
    case 'no_contact': {
      const days = Number(segment.days);
      if (!Number.isFinite(days) || days < 0) return { ok: false, error: 'invalid_days' };
      const thresholdIso = new Date(nowMs - days * DAY_MS).toISOString();
      query = baseQuery(supabase, { tenantId, brokerScope }, source)
        .is(source.cols.archivedAt, null)
        .lte(source.cols.activity, thresholdIso);
      break;
    }

    // "Interessados em apartamentos" — filtra por cols.interest.
    case 'interest': {
      const interest = sanitizeFilterValue(segment.interest);
      if (!interest) return { ok: false, error: 'invalid_interest' };
      query = baseQuery(supabase, { tenantId, brokerScope }, source)
        .ilike(source.cols.interest, `%${interest}%`);
      break;
    }

    default:
      return { ok: false, error: `unsupported_segment:${segment.type}` };
  }

  // Filtro de tipo da fonte (ex.: leads CRM => lead_type=1 p/ paridade com kenlo).
  // explicit_list é a exceção: busca por nome independe do tipo de lead.
  if (segment.type !== 'explicit_list' && source.leadTypeFilter !== null) {
    query = query.eq('lead_type', source.leadTypeFilter);
  }

  // Limite de segurança: nunca materializa um segmento gigante sem teto.
  query = query.limit(maxRows);

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: 'query_failed', detail: error.message };
  }
  return { ok: true, rows: (data || []).map(source.mapRow) };
}

/**
 * Resolve o segmento usando kenlo_leads como fonte — API pública back-compat.
 *
 * @param supabase client Supabase (service_role)
 * @param segment  { type, ...params } vindo do interpretador
 * @param ctx      { tenantId, brokerScope?, nowMs?, maxRows? }
 */
export async function resolveSegment(supabase, segment, ctx) {
  return resolveSegmentForSource(supabase, segment, ctx, KENLO_SOURCE);
}

export const __test__ = {
  sanitizeFilterValue,
  LEADS_TABLE: KENLO_SOURCE.table,
  SELECT_COLUMNS: KENLO_SOURCE.select,
};
