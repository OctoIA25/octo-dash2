/**
 * Tipos do pipeline GENERICO de importacao de planilhas.
 *
 * Fluxo:
 *   Excel -> SchemalessParser -> GenericTable -> MetadataDiscovery -> GenericReport
 *
 * Diferente do fluxo imobiliario (corretor/meses), aqui NENHUM dominio e assumido:
 * a planilha e representada como colunas + linhas cruas, e a estrutura/semantica e
 * DESCOBERTA depois. Isso aceita planilhas de qualquer topico.
 */

/** Valor cru de uma celula apos leitura (sem coercao de dominio). */
export type CellValue = string | number | boolean | null;

/** Tipo inferido de uma coluna pela heuristica de discovery. */
export type ColumnType =
    | 'number'
    | 'currency'
    | 'date'
    | 'boolean'
    | 'category' // texto com poucos valores distintos (ex.: status, equipe)
    | 'text'
    | 'empty';

/** Representacao generica de uma planilha — serializa direto para JSONB. */
export interface GenericTable {
    /** Nome da aba de origem. */
    sheetName: string;
    /** Cabecalhos na ordem original; nomes normalizados para unicidade. */
    columns: GenericColumn[];
    /** Linhas de dados: cada linha mapeia nome-da-coluna -> valor. */
    rows: Array<Record<string, CellValue>>;
    /** Total de linhas de dados lidas (pode exceder rows.length se houve truncamento). */
    totalRows: number;
    /** True quando a leitura foi truncada por exceder o limite de linhas. */
    truncated: boolean;
}

export interface GenericColumn {
    /** Nome unico usado como chave em rows (derivado do cabecalho). */
    name: string;
    /** Cabecalho original exibido ao usuario. */
    label: string;
    /** Posicao original na planilha. */
    index: number;
}

/** Metadados descobertos para uma coluna (heuristica deterministica). */
export interface ColumnMetadata {
    name: string;
    label: string;
    type: ColumnType;
    /** Total de celulas nao-vazias. */
    filledCount: number;
    /** Total de celulas vazias/nulas. */
    emptyCount: number;
    /** Quantidade de valores distintos (limitado para colunas grandes). */
    distinctCount: number;
    /** Estatisticas numericas (presentes apenas para number/currency). */
    numeric?: NumericStats;
    /** Amostra de valores distintos (para category) ou exemplos (demais tipos). */
    sample: CellValue[];
}

export interface NumericStats {
    min: number;
    max: number;
    sum: number;
    avg: number;
}

/** Resultado final do pipeline: tabela + metadados + insights opcionais. */
export interface GenericReport {
    table: GenericTable;
    metadata: ColumnMetadata[];
    /** Insights gerados pela camada de analytics (vazio quando IA desligada). */
    insights: AnalyticsInsight[];
}

export interface AnalyticsInsight {
    /** Identificador da fonte do insight (ex.: 'heuristic', 'llm'). */
    source: string;
    title: string;
    detail: string;
}
