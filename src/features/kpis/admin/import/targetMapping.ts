/**
 * Mapeador de planilha → metas de KPI. PURO e CONFIGURÁVEL (sem índices fixos).
 *
 * O wizard usa `suggestMapping` para propor (gestor confirma/ajusta no passo 4)
 * e `buildImportPlan` para o dry-run (passo 5): produz exatamente as linhas que
 * seriam gravadas, sem tocar o banco. O nome do KPI é resolvido por TEXTO; a
 * vinculação a um KPI existente / criação acontece na persistência (Task 8).
 */
import type { GenericTable, ColumnMetadata, ColumnType } from '@/features/relatorios/import/generic/types';
import { parseNumeric } from '@/features/relatorios/import/generic/metadataDiscovery';
import { parsePeriodHeader } from './excelSerial';
import type { KpiPeriodType } from '@/features/kpis/domain/periods';

export interface ImportMapping {
  /** Coluna cujo valor é o NOME do KPI (uma linha por KPI). */
  kpiNameColumn: string;
  /** Colunas que representam períodos (cada uma vira metas daquele período). */
  periodColumns: Array<{ column: string; periodType: KpiPeriodType; periodStart: string }>;
  /** A planilha traz META ('target') ou REALIZADO ('value'). */
  target: 'target' | 'value';
}

export interface ImportPlanRow {
  kpiName: string;
  periodType: KpiPeriodType;
  periodStart: string;
  value: number;
}

export interface ImportPlan {
  rows: ImportPlanRow[];
  ignoredColumns: string[];
  warnings: string[];
}

/**
 * Teto de warnings. Como o preview (com os warnings) é persistido em JSONB no
 * batch, um número ilimitado (ex.: planilha de 5000 linhas com uma coluna toda
 * vazia) inflaria o payload. Acima do teto, agregamos numa linha-resumo.
 */
const MAX_WARNINGS = 50;

export interface ImportPreview {
  sheetName: string;
  totalRows: number;
  columns: Array<{ name: string; label: string; type: ColumnType }>;
  detectedPeriods: Array<{ column: string; periodType: KpiPeriodType; periodStart: string }>;
  kpiNameColumn: string;
  ignoredColumns: string[];
  warnings: string[];
}

/**
 * Heurística de sugestão — apenas propõe; o gestor confirma.
 *
 * `defaultYear` é repassado ao `parsePeriodHeader` para reconhecer colunas de mês
 * SEM ano ("Janeiro", "Jan") — caso muito comum. Sem ele, essas colunas não viram
 * período e o plano sai vazio (0 KPIs). A UI passa o ano corrente.
 */
export function suggestMapping(
  table: GenericTable,
  metadata: ColumnMetadata[],
  defaultYear?: number,
): ImportMapping {
  const periodColumns: ImportMapping['periodColumns'] = [];
  for (const col of table.columns) {
    const parsed = parsePeriodHeader(col.label, defaultYear);
    if (parsed) periodColumns.push({ column: col.name, periodType: parsed.type, periodStart: parsed.periodStart });
  }
  const periodNames = new Set(periodColumns.map((p) => p.column));

  // Nome do KPI: dentre as colunas textuais que NÃO são período, a de MAIOR
  // cardinalidade. Sinal: a coluna de nomes de KPI tem ~1 valor distinto por
  // linha (alta cardinalidade), enquanto colunas de notas/observação tendem a
  // ser esparsas ou repetitivas (baixa). O gestor confirma/ajusta no passo 4.
  const candidates = metadata
    .filter((m) => !periodNames.has(m.name))
    .filter((m) => m.type === 'category' || m.type === 'text')
    .sort((a, b) => b.distinctCount - a.distinctCount);
  const kpiNameColumn = candidates[0]?.name ?? table.columns[0]?.name ?? '';

  return { kpiNameColumn, periodColumns, target: 'target' };
}

/** Aplica o mapeamento → linhas (KPI × período × valor). Dry-run friendly. */
export function buildImportPlan(table: GenericTable, mapping: ImportMapping): ImportPlan {
  const rows: ImportPlanRow[] = [];
  const warnings: string[] = [];
  const mappedNames = new Set<string>([mapping.kpiNameColumn, ...mapping.periodColumns.map((p) => p.column)]);
  const ignoredColumns = table.columns.map((c) => c.name).filter((n) => !mappedNames.has(n));

  let suppressed = 0;
  for (const row of table.rows) {
    const kpiName = String(row[mapping.kpiNameColumn] ?? '').trim();
    if (!kpiName) continue; // linha sem KPI não gera metas
    for (const pc of mapping.periodColumns) {
      const parsed = parseNumeric(row[pc.column]);
      if (parsed == null) {
        // Coleta avisos até o teto; o excedente vira um resumo (evita payload gigante).
        if (warnings.length < MAX_WARNINGS) {
          warnings.push(`"${kpiName}" / ${pc.column}: valor vazio ou não-numérico ignorado.`);
        } else {
          suppressed += 1;
        }
        continue;
      }
      rows.push({ kpiName, periodType: pc.periodType, periodStart: pc.periodStart, value: parsed });
    }
  }
  if (suppressed > 0) {
    warnings.push(`… e mais ${suppressed} célula(s) vazia(s)/não-numérica(s) ignorada(s).`);
  }
  return { rows, ignoredColumns, warnings };
}

/**
 * Congela a INTERPRETAÇÃO mostrada no Preview para auditoria (persistida no
 * batch). Puro e serializável: descreve "o que o sistema entendeu" da planilha.
 */
export function buildPreview(
  table: GenericTable,
  metadata: ColumnMetadata[],
  mapping: ImportMapping,
  plan: ImportPlan,
): ImportPreview {
  return {
    sheetName: table.sheetName,
    totalRows: table.totalRows,
    columns: metadata.map((m) => ({ name: m.name, label: m.label, type: m.type })),
    detectedPeriods: mapping.periodColumns,
    kpiNameColumn: mapping.kpiNameColumn,
    ignoredColumns: plan.ignoredColumns,
    warnings: plan.warnings,
  };
}
