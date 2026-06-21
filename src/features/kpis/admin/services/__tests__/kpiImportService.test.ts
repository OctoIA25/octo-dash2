import { describe, expect, it, vi, beforeEach } from 'vitest';

// supabase: só o insert do batch (kpi_import_batches) é usado por persistImport.
const batchInsert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'batch-1' }, error: null }) }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: batchInsert }) },
}));

// Serviços consumidos por persistImport — espionados para asserir o fluxo.
const fetchKpisMock = vi.fn();
const createKpiMock = vi.fn((draft: { name: string }) => Promise.resolve({ id: 'new-' + draft.name }));
const upsertTargetMock = vi.fn((_input: unknown) => Promise.resolve());
const upsertValueMock = vi.fn((_input: unknown) => Promise.resolve());
vi.mock('../kpiAdminService', () => ({
  fetchKpis: () => fetchKpisMock(),
  createKpi: (draft: { name: string }) => createKpiMock(draft),
}));
vi.mock('../kpiTargetsService', () => ({
  upsertTarget: (input: unknown) => upsertTargetMock(input),
  upsertValue: (input: unknown) => upsertValueMock(input),
}));

import { resolvePlan, persistImport } from '../kpiImportService';
import type { ImportPlan, ImportPreview } from '@/features/kpis/admin/import/targetMapping';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';

beforeEach(() => {
  batchInsert.mockClear();
  fetchKpisMock.mockReset();
  createKpiMock.mockClear();
  upsertTargetMock.mockClear();
  upsertValueMock.mockClear();
});

const PREVIEW: ImportPreview = {
  sheetName: 'Metas', totalRows: 2, columns: [], detectedPeriods: [],
  kpiNameColumn: 'KPI', ignoredColumns: [], warnings: [],
};

function kpi(name: string): DashboardKpi {
  return {
    id: 'id-' + name, tenantId: 't', name, description: '', categoryId: 'geral',
    unit: 'count', source: 'planilha', metricKey: null, status: 'active',
    isVisible: true, isFeatured: false, displayOrder: 0, isSystem: false,
    config: {}, createdAt: '', updatedAt: '',
  };
}

const plan: ImportPlan = {
  rows: [
    { kpiName: 'Total de Leads', periodType: 'month', periodStart: '2026-01-01', value: 100 },
    { kpiName: 'KPI Novo', periodType: 'month', periodStart: '2026-01-01', value: 5 },
  ],
  ignoredColumns: ['Observação'], warnings: ['aviso x'],
};

describe('resolvePlan (dry-run)', () => {
  it('vincula a existente (case-insensitive) e marca o novo p/ criação', () => {
    const resolved = resolvePlan(plan, [kpi('total de leads')], 'target');
    expect(resolved.updates).toContainEqual({ kpiName: 'Total de Leads', periodStart: '2026-01-01', value: 100 });
    expect(resolved.creates).toContainEqual({ kpiName: 'KPI Novo' });
    expect(resolved.ignored).toContain('Observação');
  });
  it('não toca o banco (função pura) — retorna plano determinístico', () => {
    const a = resolvePlan(plan, [], 'target');
    const b = resolvePlan(plan, [], 'target');
    expect(a).toEqual(b);
    expect(a.creates).toHaveLength(2); // ambos novos
  });
});

describe('persistImport', () => {
  const base = {
    plan, mapping: { target: 'target' as const }, tenantId: 't',
    actor: { id: 'u1', name: 'Gestor' }, fileName: 'metas.xlsx', sheetName: 'Metas',
    preview: PREVIEW, existingKpis: [] as DashboardKpi[],
  };

  it('dryRun=true não grava nada (sem batch, sem create, sem upsert)', async () => {
    const r = await persistImport({ ...base, dryRun: true });
    expect(batchInsert).not.toHaveBeenCalled();
    expect(fetchKpisMock).not.toHaveBeenCalled();
    expect(createKpiMock).not.toHaveBeenCalled();
    expect(upsertTargetMock).not.toHaveBeenCalled();
    expect(r.creates.length).toBe(2);
  });

  it('RETRY-SAFE: não recria KPI que já existe no banco (relê estado atual)', async () => {
    // Plano quer criar "Total de Leads" e "KPI Novo"; o banco JÁ tem "total de leads"
    // (ex.: de um run anterior que falhou). Só "KPI Novo" deve ser criado.
    fetchKpisMock.mockResolvedValue([kpi('total de leads')]);
    await persistImport({ ...base, dryRun: false });

    expect(fetchKpisMock).toHaveBeenCalledTimes(1);
    const createdNames = createKpiMock.mock.calls.map((c) => c[0].name);
    expect(createdNames).toEqual(['KPI Novo']); // NÃO recria "Total de Leads"
    // upsert das 2 linhas (vinculadas: existente + recém-criada), com batch_id.
    expect(upsertTargetMock).toHaveBeenCalledTimes(2);
  });
});
