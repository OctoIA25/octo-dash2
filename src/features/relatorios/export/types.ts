/**
 * Modelo de relatório exportável.
 *
 * Camada intermediária que desacopla os DADOS (memos da página) da RENDERIZAÇÃO
 * (PDF, Excel, UI do modal). Todos os consumidores — `ExportReportDialog`,
 * `pdfReportGenerator` e `excelReportGenerator` — leem a mesma estrutura.
 *
 * Os gráficos são descritos como DADOS (labels + séries), não como imagens: o
 * PDF os redesenha em vetor nativo e o Excel os transforma em tabela. Nada de
 * captura de tela — o resultado é nítido e consistente com o design do relatório.
 */

export type ReportSectionKind = 'metrics' | 'table' | 'chart' | 'text';

export type ChartType = 'bar' | 'stackedBar' | 'horizontalBar' | 'doughnut';

export type ValueFormat = 'number' | 'currency' | 'percent';

/** Tabela genérica usada por seções de tabela. */
export interface ReportTableData {
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface ChartSeries {
  name: string;
  data: number[];
  /** Cor CSS (rgba/hex). Opcional — cai na paleta padrão quando ausente. */
  color?: string;
}

interface ReportSectionBase {
  id: string;
  title: string;
  group: string;
  kind: ReportSectionKind;
}

/** Conjunto de indicadores (KPIs) — desenhados como cards no PDF. */
export interface MetricsSection extends ReportSectionBase {
  kind: 'metrics';
  items: Array<{ label: string; value: string | number; hint?: string }>;
}

/** Tabela tabular com cabeçalho e linhas. */
export interface TableSection extends ReportSectionBase, ReportTableData {
  kind: 'table';
}

/** Gráfico descrito por dados — redesenhado em vetor no PDF. */
export interface ChartSection extends ReportSectionBase {
  kind: 'chart';
  chartType: ChartType;
  labels: string[];
  series: ChartSeries[];
  /** Cores por fatia (doughnut). */
  sliceColors?: string[];
  valueFormat?: ValueFormat;
}

/** Bloco de observações / texto livre. */
export interface TextSection extends ReportSectionBase {
  kind: 'text';
  paragraphs: string[];
}

export type ReportSection =
  | MetricsSection
  | TableSection
  | ChartSection
  | TextSection;

export interface ReportGroup {
  id: string;
  title: string;
}

export interface ReportModel {
  title: string;
  subtitle?: string;
  meta: Array<{ label: string; value: string }>;
  groups: ReportGroup[];
  sections: ReportSection[];
}

export type ExportFormat = 'pdf' | 'xlsx';

export type ExportSelection = Record<string, boolean>;

/** Retorna apenas as seções marcadas, preservando a ordem do modelo. */
export function selectedSections(
  model: ReportModel,
  selection: ExportSelection,
): ReportSection[] {
  return model.sections.filter((section) => selection[section.id]);
}
