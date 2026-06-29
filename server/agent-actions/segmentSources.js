/**
 * Descritores de FONTE de leads para o resolver de segmentos. Cada fonte declara
 * sua tabela, colunas-chave e o mapeamento de linha — o resolver fica agnóstico
 * à tabela física. KENLO mantém o comportamento legado; LEADS é a fonte do CRM.
 */

export const KENLO_SOURCE = {
  key: 'kenlo',
  table: 'kenlo_leads',
  // kenlo_leads NÃO tem coluna `status` (o análogo é `stage`, não lido aqui).
  // Incluí-la no SELECT quebrava o resolver com "column kenlo_leads.status does
  // not exist". O LEADS_SOURCE mantém `status` porque a tabela `leads` o tem.
  select:
    'id, external_id, client_name, client_phone, attended_by_name, ' +
    'archived_at, updated_at, lead_timestamp, interest_type',
  cols: {
    name: 'client_name',
    phone: 'client_phone',
    agent: 'attended_by_name',
    archivedAt: 'archived_at',
    activity: 'updated_at',
    interest: 'interest_type',
  },
  leadTypeFilter: null, // kenlo é sempre Interessado — nenhum filtro de tipo adicional
  mapRow: (r) => ({
    id: r.id || r.external_id,
    name: r.client_name || '',
    phone: r.client_phone || '',
    assignedAgent: r.attended_by_name || null,
    archivedAt: r.archived_at || null,
    updatedAt: r.updated_at || null,
    source: 'kenlo',
    sourceLeadId: r.id,
  }),
};

export const LEADS_SOURCE = {
  key: 'crm',
  table: 'leads',
  select:
    'id, source_lead_id, name, phone, assigned_agent_name, ' +
    'archived_at, updated_at, first_response_at, property_type, tags, lead_type, status',
  cols: {
    name: 'name',
    phone: 'phone',
    agent: 'assigned_agent_name',
    archivedAt: 'archived_at',
    activity: 'updated_at',
    interest: 'property_type',
  },
  // Contato elegível para campanha independe do tipo: o público deve incluir
  // Interessados (1), Proprietários (2) e leads sem tipo (NULL). Filtrar por
  // lead_type=1 cortava silenciosamente Proprietários e os NULL (que o resto do
  // CRM trata como Interessado), deixando o público incompleto.
  leadTypeFilter: null,
  mapRow: (r) => ({
    id: r.id,
    name: r.name || '',
    phone: r.phone || '',
    assignedAgent: r.assigned_agent_name || null,
    archivedAt: r.archived_at || null,
    updatedAt: r.updated_at || null,
    source: 'crm',
    sourceLeadId: r.source_lead_id,
  }),
};
