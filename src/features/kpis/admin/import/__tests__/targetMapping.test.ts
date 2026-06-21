import { describe, expect, it } from 'vitest';
import { suggestMapping, buildImportPlan, buildPreview, type ImportMapping } from '../targetMapping';
import { parseGenericTable } from '@/features/relatorios/import/generic/schemalessParser';
import { discoverMetadata } from '@/features/relatorios/import/generic/metadataDiscovery';

// Planilha de metas: coluna "KPI" + colunas de mês (ordem arbitrária, coluna extra ignorável).
const matrix = [
  ['KPI', 'Observação', 'Jan/2026', 'Fev/2026'],
  ['Total de Leads', 'meta da diretoria', '100', '120'],
  ['Vendas', '', '10', '15'],
];

describe('suggestMapping', () => {
  it('sugere a coluna de nome do KPI e as colunas de período', () => {
    const table = parseGenericTable(matrix, 'Metas');
    const meta = discoverMetadata(table);
    const mapping = suggestMapping(table, meta);

    expect(mapping.kpiNameColumn).toBe('KPI');
    expect(mapping.periodColumns.map((p) => p.column)).toEqual(['Jan/2026', 'Fev/2026']);
    expect(mapping.periodColumns[0]).toMatchObject({ periodType: 'month', periodStart: '2026-01-01' });
  });

  it('escolhe a coluna de KPI por MAIOR cardinalidade (não a coluna repetitiva)', () => {
    // "Indicador" tem 4 valores distintos (1 por KPI); "Equipe" é repetitiva
    // (2 distintos). A heurística deve preferir "Indicador", não "Equipe".
    const m = [
      ['Equipe', 'Indicador', 'Jan/2026'],
      ['Vendas', 'Total de Leads', '100'],
      ['Vendas', 'Conversão', '20'],
      ['Locação', 'Visitas', '50'],
      ['Locação', 'Propostas', '30'],
    ];
    const table = parseGenericTable(m, 'Metas');
    const meta = discoverMetadata(table);
    const mapping = suggestMapping(table, meta);

    expect(mapping.kpiNameColumn).toBe('Indicador');
    expect(mapping.periodColumns.map((p) => p.column)).toEqual(['Jan/2026']);
  });

  it('colunas de mês SEM ano (Jan..Dez) só viram período com defaultYear', () => {
    // Caso real: planilha com meses sem ano. Sem defaultYear → 0 períodos → 0 KPIs.
    const m = [
      ['KPI', 'Janeiro', 'Fevereiro', 'Março'],
      ['VGV', '100', '120', '90'],
    ];
    const table = parseGenericTable(m, 'Metas');
    const meta = discoverMetadata(table);

    expect(suggestMapping(table, meta).periodColumns).toHaveLength(0); // sem ano: nada
    const mapping = suggestMapping(table, meta, 2026);                 // com ano: reconhece
    expect(mapping.periodColumns.map((p) => p.periodStart)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);

    const plan = buildImportPlan(table, mapping);
    expect(plan.rows).toContainEqual({ kpiName: 'VGV', periodType: 'month', periodStart: '2026-02-01', value: 120 });
  });
});

describe('buildImportPlan', () => {
  it('gera linhas KPI×período e ignora a coluna não mapeada', () => {
    const table = parseGenericTable(matrix, 'Metas');
    const mapping: ImportMapping = {
      kpiNameColumn: 'KPI',
      periodColumns: [
        { column: 'Jan/2026', periodType: 'month', periodStart: '2026-01-01' },
        { column: 'Fev/2026', periodType: 'month', periodStart: '2026-02-01' },
      ],
      target: 'target',
    };
    const plan = buildImportPlan(table, mapping);

    expect(plan.rows).toHaveLength(4); // 2 KPIs × 2 meses
    expect(plan.rows).toContainEqual({ kpiName: 'Total de Leads', periodType: 'month', periodStart: '2026-01-01', value: 100 });
    expect(plan.rows).toContainEqual({ kpiName: 'Vendas', periodType: 'month', periodStart: '2026-02-01', value: 15 });
    expect(plan.ignoredColumns).toContain('Observação');
  });

  it('ignora célula vazia/não-numérica com aviso, sem quebrar', () => {
    const m2 = [['KPI', 'Mar/2026'], ['Total de Leads', ''], ['Vendas', 'abc']];
    const table = parseGenericTable(m2, 'Metas');
    const mapping: ImportMapping = {
      kpiNameColumn: 'KPI',
      periodColumns: [{ column: 'Mar/2026', periodType: 'month', periodStart: '2026-03-01' }],
      target: 'target',
    };
    const plan = buildImportPlan(table, mapping);
    expect(plan.rows).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('limita os warnings (não explode o payload) e resume o excedente', () => {
    // 200 linhas com a coluna de período toda vazia → muitos avisos; deve ser
    // limitado (cap 50) + 1 linha-resumo, em vez de 200 entradas.
    const rows = Array.from({ length: 200 }, (_, i) => [`KPI ${i}`, '']);
    const big = [['KPI', 'Mar/2026'], ...rows];
    const table = parseGenericTable(big, 'Metas');
    const mapping: ImportMapping = {
      kpiNameColumn: 'KPI',
      periodColumns: [{ column: 'Mar/2026', periodType: 'month', periodStart: '2026-03-01' }],
      target: 'target',
    };
    const plan = buildImportPlan(table, mapping);
    expect(plan.warnings.length).toBeLessThanOrEqual(51); // 50 + resumo
    expect(plan.warnings.some((w) => w.includes('e mais'))).toBe(true);
  });
});

describe('buildPreview', () => {
  it('congela a interpretação (colunas/tipos, períodos, coluna de KPI, ignoradas)', () => {
    const table = parseGenericTable(matrix, 'Metas');
    const meta = discoverMetadata(table);
    const mapping = suggestMapping(table, meta);
    const plan = buildImportPlan(table, mapping);
    const preview = buildPreview(table, meta, mapping, plan);

    expect(preview.sheetName).toBe('Metas');
    expect(preview.kpiNameColumn).toBe('KPI');
    expect(preview.detectedPeriods.map((p) => p.column)).toEqual(['Jan/2026', 'Fev/2026']);
    expect(preview.columns.find((c) => c.name === 'KPI')).toBeTruthy();
    expect(preview.ignoredColumns).toContain('Observação');
  });
});
