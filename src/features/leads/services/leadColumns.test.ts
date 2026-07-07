import { describe, it, expect } from 'vitest';
import { KENLO_LEAD_COLUMNS_FOR_METRICS, LEADS_COLUMNS_FOR_METRICS } from './leadColumns';

/**
 * Guarda anti-regressão do Slice 1 (projeção de kenlo_leads).
 *
 * Risco protegido: como a leitura deixou de ser `select('*')`, se a projeção divergir das colunas
 * que `kenloLeadToCRMLead` lê, o campo faltante volta como `undefined` SILENCIOSAMENTE (sem erro).
 *
 * A lista abaixo é a fonte da verdade explícita: exatamente as 17 colunas que o mapper consome
 * (verificadas 1:1 contra kenloLeadToCRMLead). Se o mapper passar a ler uma coluna nova, este teste
 * quebra até que a coluna seja adicionada aqui E na constante — forçando os dois a andarem juntos.
 */
const EXPECTED_KENLO_COLUMNS = [
  'id',
  'tenant_id',
  'client_name',
  'client_phone',
  'client_email',
  'portal',
  'external_id',
  'stage',
  'temperature',
  'interest_reference',
  'interest_is_rent',
  'interest_is_sale',
  'attended_by_name',
  'message',
  'created_at',
  'updated_at',
  'first_response_at',
];

const parseColumns = (projection: string): string[] =>
  projection.split(',').map((c) => c.trim()).filter(Boolean);

describe('KENLO_LEAD_COLUMNS_FOR_METRICS', () => {
  it('projeta exatamente as 17 colunas que kenloLeadToCRMLead lê', () => {
    const projected = parseColumns(KENLO_LEAD_COLUMNS_FOR_METRICS);
    expect(projected.sort()).toEqual([...EXPECTED_KENLO_COLUMNS].sort());
  });

  it('não trafega colunas gordas não lidas (raw_data fica de fora — motivo do Slice 1)', () => {
    expect(parseColumns(KENLO_LEAD_COLUMNS_FOR_METRICS)).not.toContain('raw_data');
  });

  it('não contém `assigned_at` (o mapper reusa created_at; a coluna não existe na tabela)', () => {
    expect(parseColumns(KENLO_LEAD_COLUMNS_FOR_METRICS)).not.toContain('assigned_at');
  });

  it('não tem colunas duplicadas', () => {
    const projected = parseColumns(KENLO_LEAD_COLUMNS_FOR_METRICS);
    expect(projected.length).toBe(new Set(projected).size);
  });
});

/**
 * Guarda anti-regressão do Slice 2 (projeção de public.leads).
 *
 * A lista abaixo é exatamente o que os consumidores de fetchLeadsForMetrics leem em JS
 * (crmLeadToProcessedLead + calculateFunnelMetrics + calculateLeadsMetrics + dedup por
 * source_lead_id). Campos usados só em WHERE/ORDER (archived_at) ficam fora — o filtro funciona
 * sem SELECT. Se um consumidor passar a ler um campo novo, este teste quebra até incluí-lo.
 */
const EXPECTED_LEADS_COLUMNS = [
  'id',
  'name',
  'phone',
  'source',
  'source_lead_id',
  'status',
  'temperature',
  'property_code',
  'property_value',
  'property_type',
  'assigned_agent_id',
  'assigned_agent_name',
  'comments',
  'visit_date',
  'closing_date',
  'final_sale_value',
  'lead_type',
  'created_at',
];

describe('LEADS_COLUMNS_FOR_METRICS', () => {
  it('projeta exatamente os campos que os consumidores de fetchLeadsForMetrics leem', () => {
    const projected = parseColumns(LEADS_COLUMNS_FOR_METRICS);
    expect(projected.sort()).toEqual([...EXPECTED_LEADS_COLUMNS].sort());
  });

  it('não trafega campos não lidos pelas métricas (email/tags/custom_fields/raw ficam fora)', () => {
    const projected = parseColumns(LEADS_COLUMNS_FOR_METRICS);
    for (const col of ['email', 'tags', 'custom_fields', 'raw_data']) {
      expect(projected).not.toContain(col);
    }
  });

  it('não tem colunas duplicadas', () => {
    const projected = parseColumns(LEADS_COLUMNS_FOR_METRICS);
    expect(projected.length).toBe(new Set(projected).size);
  });
});
