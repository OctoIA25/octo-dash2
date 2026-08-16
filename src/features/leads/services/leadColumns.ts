/**
 * Projeções de colunas para leituras de leads em leadsMetricsService.
 *
 * ⚠️ Cada constante é ACOPLADA AOS SEUS CONSUMIDORES (o código que lê os campos da linha). NÃO são
 * projeções canônicas da tabela e NÃO devem ser reusadas em outros caminhos de leitura — outros
 * caminhos no repo leem conjuntos de colunas diferentes (ex.: supabaseService projeta interest_type/
 * is_exclusive/lead_timestamp, que estes consumidores não usam; e não projeta first_response_at, que
 * o consumidor de kenlo_leads usa). Unificar as strings seria uma falsa-DRY que quebraria em runtime.
 *
 * NÃO adicione coluna "por via das dúvidas": cada uma abaixo é lida por um consumidor real. Campos
 * gordos (raw_data JSONB) ficam DE FORA de propósito — é o motivo destas constantes existirem.
 */

/**
 * Colunas de `kenlo_leads` lidas por `kenloLeadToCRMLead` (leadsMetricsService).
 *
 * São exatamente as 18 colunas distintas que o mapper consome. Manter em sincronia com o mapper —
 * o teste `leadColumns.test.ts` falha se divergirem.
 *
 * `classification` NÃO é "por via das dúvidas": consumidor real é `LeadsTable.tsx:489`
 * (`<ClassificacaoBadge tipo={lead.classification} />`), alimentado por `ProcessedLead.classification`,
 * que `crmLeadToProcessedLead` só consegue preencher se o mapper abaixo ler a coluna.
 */
export const KENLO_LEAD_COLUMNS_FOR_METRICS =
  'id, tenant_id, client_name, client_phone, client_email, portal, external_id, ' +
  'stage, temperature, interest_reference, interest_is_rent, interest_is_sale, ' +
  'attended_by_name, message, created_at, updated_at, first_response_at, classification';

/**
 * Colunas de `public.leads` (schema do CRM) lidas pelos consumidores de `fetchLeadsForMetrics`:
 * `crmLeadToProcessedLead`, `calculateFunnelMetrics`, `calculateLeadsMetrics` e o dedup/filtro do
 * próprio `fetchLeadsForMetrics`. São exatamente os campos consumidos em JS — os demais filtros
 * (`assigned_agent_id`, `archived_at`, `created_at` no WHERE/ORDER) funcionam sem estar no SELECT.
 *
 * Cada coluna existe em `public.leads` (verificado contra a projeção já em produção em
 * leadsService.ts e a migration 20260204_add_lead_type_to_leads). O teste falha se divergir dos
 * consumidores.
 *
 * `classification` (migration 20260815_add_lead_classification) NÃO é "por via das dúvidas": mesmo
 * consumidor real do bloco acima, `LeadsTable.tsx:489`, via `crmLeadToProcessedLead`.
 */
export const LEADS_COLUMNS_FOR_METRICS =
  'id, name, phone, source, source_lead_id, status, temperature, property_code, ' +
  'property_value, property_type, assigned_agent_id, assigned_agent_name, comments, ' +
  'visit_date, closing_date, final_sale_value, lead_type, created_at, classification';
