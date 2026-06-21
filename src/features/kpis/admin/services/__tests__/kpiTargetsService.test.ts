import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { mapTargetRow, mapValueRow } from '../kpiTargetsService';

describe('mapTargetRow / mapValueRow', () => {
  it('mapeia meta', () => {
    const t = mapTargetRow({ id: 't', kpi_id: 'k', tenant_id: 'te', period_type: 'month', period_start: '2026-06-01', target_value: '100', source: 'import', batch_id: 'b' });
    expect(t).toEqual({ id: 't', kpiId: 'k', tenantId: 'te', periodType: 'month', periodStart: '2026-06-01', targetValue: 100, source: 'import', batchId: 'b' });
  });
  it('mapeia realizado', () => {
    const v = mapValueRow({ id: 'v', kpi_id: 'k', tenant_id: 'te', period_type: 'month', period_start: '2026-06-01', value: '42', source: 'manual', batch_id: null });
    expect(v.value).toBe(42);
    expect(v.batchId).toBeNull();
  });
});
