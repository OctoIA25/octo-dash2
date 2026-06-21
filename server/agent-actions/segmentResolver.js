/**
 * 🔍 Resolução de segmentos do Agente Disparador.
 *
 * Traduz um SEGMENTO estruturado (saída do interpretador) numa lista de clientes,
 * reutilizando a MESMA tabela e as MESMAS colunas que `/api/v1/leads` já consulta
 * (kenlo_leads): client_name, client_phone, attended_by_name, archived_at,
 * updated_at, interest_type, etc. Não duplicamos a modelagem de busca — apenas
 * adicionamos os filtros que ainda não existiam como endpoint (período de
 * arquivamento, ausência de atendimento) e a lista explícita de clientes.
 *
 * Regras invioláveis:
 *  - SEMPRE escopado por tenant_id (o servidor usa service_role e ignora RLS;
 *    o tenant-scope manual é a ÚNICA proteção contra vazamento cross-tenant).
 *  - Escopo de corretor: se `brokerScope` for passado (role corretor), a busca é
 *    forçada a attended_by_name = brokerScope — o corretor só atinge seus leads.
 *
 * Determinístico e testável: recebe o client Supabase por parâmetro; nenhum
 * acoplamento com HTTP. `nowMs` é injetável para testar janelas temporais.
 */

const LEADS_TABLE = 'kenlo_leads';

// Mesma sanitização do api-server: remove caracteres que quebram o filtro
// PostgREST (.or/.ilike) e poderiam ser usados para injeção de filtro.
const sanitizeFilterValue = (value) => String(value ?? '').replace(/[,()*\\]/g, ' ').trim();

const DAY_MS = 24 * 60 * 60 * 1000;

// Colunas mínimas necessárias — evita trafegar raw_data (potencialmente grande).
const SELECT_COLUMNS =
  'id, external_id, client_name, client_phone, attended_by_name, ' +
  'archived_at, updated_at, lead_timestamp, interest_type, status';

/** Normaliza uma linha de kenlo_leads para o shape usado pelas ações. */
function mapRow(row) {
  return {
    id: row.id || row.external_id,
    name: row.client_name || '',
    phone: row.client_phone || '',
    assignedAgent: row.attended_by_name || null,
    archivedAt: row.archived_at || null,
    updatedAt: row.updated_at || null,
    source: 'crm',
  };
}

/** Aplica tenant-scope e escopo de corretor — comum a todos os segmentos. */
function baseQuery(supabase, { tenantId, brokerScope }) {
  let query = supabase.from(LEADS_TABLE).select(SELECT_COLUMNS).eq('tenant_id', tenantId);
  if (brokerScope) query = query.eq('attended_by_name', brokerScope);
  return query;
}

/**
 * Resolve o segmento → { ok, rows } ou { ok:false, error }.
 *
 * @param supabase client Supabase (service_role)
 * @param segment  { type, ...params } vindo do interpretador
 * @param ctx      { tenantId, brokerScope?, nowMs?, maxRows? }
 */
export async function resolveSegment(supabase, segment, ctx) {
  const { tenantId, brokerScope = null, nowMs = Date.now(), maxRows = 5000 } = ctx || {};
  if (!tenantId) return { ok: false, error: 'tenant_required' };
  if (!segment || typeof segment !== 'object' || !segment.type) {
    return { ok: false, error: 'invalid_segment' };
  }

  let query;
  switch (segment.type) {
    // "Envie uma mensagem para o cliente João Silva" / lista explícita de nomes.
    case 'explicit_list': {
      const names = Array.isArray(segment.names) ? segment.names.filter(Boolean) : [];
      if (names.length === 0) return { ok: false, error: 'empty_explicit_list' };
      // OR de ilike por nome — casa "joão silva" mesmo com acentuação/caixa.
      const ors = names
        .map((n) => `client_name.ilike.%${sanitizeFilterValue(n)}%`)
        .join(',');
      query = baseQuery(supabase, { tenantId, brokerScope }).or(ors);
      break;
    }

    // "Todos os clientes arquivados".
    case 'archived': {
      query = baseQuery(supabase, { tenantId, brokerScope }).not('archived_at', 'is', null);
      break;
    }

    // "Arquivados há mais de N dias" — archived_at <= now - N dias.
    case 'archived_period': {
      const days = Number(segment.days);
      if (!Number.isFinite(days) || days < 0) return { ok: false, error: 'invalid_days' };
      const thresholdIso = new Date(nowMs - days * DAY_MS).toISOString();
      query = baseQuery(supabase, { tenantId, brokerScope })
        .not('archived_at', 'is', null)
        .lte('archived_at', thresholdIso);
      break;
    }

    // "Clientes da corretora X" — força attended_by_name (ignora brokerScope só
    // se ele não estiver setado; se houver brokerScope, o corretor não pode
    // mirar outro corretor, então o filtro do scope prevalece e tende a vazio).
    case 'by_broker': {
      const broker = sanitizeFilterValue(segment.broker);
      if (!broker) return { ok: false, error: 'invalid_broker' };
      query = baseQuery(supabase, { tenantId, brokerScope }).ilike('attended_by_name', `%${broker}%`);
      break;
    }

    // "Sem atendimento nos últimos N dias" — updated_at <= now - N dias.
    // Usamos updated_at como proxy de "última interação" (é o que o domínio
    // atualiza a cada movimentação do lead). Inclui apenas leads ativos.
    case 'no_contact': {
      const days = Number(segment.days);
      if (!Number.isFinite(days) || days < 0) return { ok: false, error: 'invalid_days' };
      const thresholdIso = new Date(nowMs - days * DAY_MS).toISOString();
      query = baseQuery(supabase, { tenantId, brokerScope })
        .is('archived_at', null)
        .lte('updated_at', thresholdIso);
      break;
    }

    // "Interessados em apartamentos" — filtra por interest_type.
    case 'interest': {
      const interest = sanitizeFilterValue(segment.interest);
      if (!interest) return { ok: false, error: 'invalid_interest' };
      query = baseQuery(supabase, { tenantId, brokerScope }).ilike('interest_type', `%${interest}%`);
      break;
    }

    default:
      return { ok: false, error: `unsupported_segment:${segment.type}` };
  }

  // Limite de segurança: nunca materializa um segmento gigante sem teto.
  query = query.limit(maxRows);

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: 'query_failed', detail: error.message };
  }
  return { ok: true, rows: (data || []).map(mapRow) };
}

export const __test__ = { sanitizeFilterValue, mapRow, LEADS_TABLE, SELECT_COLUMNS };
