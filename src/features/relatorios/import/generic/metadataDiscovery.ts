/**
 * Metadata Discovery: infere tipo, estatisticas e semantica de cada coluna de uma
 * GenericTable usando HEURISTICA DETERMINISTICA (sem IA).
 *
 * Regra de inferencia de tipo (por maioria das celulas preenchidas):
 *  - boolean : valores em {true,false,sim,nao,yes,no,0,1} de forma consistente
 *  - currency: numericos com prefixo monetario (R$, $) ou rotulo de valor/preco
 *  - number  : maioria parseavel como numero
 *  - date    : maioria parseavel como data (BR, ISO ou serial Excel)
 *  - category: texto com baixa cardinalidade (<= CATEGORY_MAX_DISTINCT e razao baixa)
 *  - text    : demais
 *  - empty   : coluna sem dados
 *
 * Determinismo e pureza tornam o discovery barato e 100% testavel.
 */

import type {
    CellValue,
    ColumnMetadata,
    ColumnType,
    GenericTable,
    NumericStats,
} from './types';

const CATEGORY_MAX_DISTINCT = 20;
const CATEGORY_MAX_RATIO = 0.5; // distinct/filled abaixo disso favorece "category"
const SAMPLE_SIZE = 5;

const BOOLEAN_TRUE = new Set(['TRUE', 'SIM', 'YES', 'S', 'Y', '1', 'VERDADEIRO']);
const BOOLEAN_FALSE = new Set(['FALSE', 'NAO', 'NO', 'N', '0', 'FALSO']);

function isBlank(value: CellValue): boolean {
    return value === null || value === undefined || String(value).trim() === '';
}

function normalize(value: CellValue): string {
    return String(value ?? '').trim().toUpperCase();
}

/** Converte texto BR/EN para numero; retorna null se nao for numerico. */
export function parseNumeric(value: CellValue): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;

    const compact = value.replace(/[R$\s]/gi, '');
    if (compact === '' || !/[0-9]/.test(compact)) return null;

    const lastComma = compact.lastIndexOf(',');
    const lastDot = compact.lastIndexOf('.');
    let cleaned = compact;

    if (lastComma !== -1 && lastDot !== -1) {
        cleaned = lastComma > lastDot
            ? compact.replace(/\./g, '').replace(',', '.')
            : compact.replace(/,/g, '');
    } else if (lastComma !== -1) {
        cleaned = compact.replace(/\./g, '').replace(',', '.');
    } else if (lastDot !== -1) {
        const decimals = compact.length - lastDot - 1;
        cleaned = decimals > 2 ? compact.replace(/\./g, '') : compact;
    }

    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function looksLikeCurrency(value: CellValue): boolean {
    return typeof value === 'string' && /[R$]\s?\d|US?\$|\$\s?\d/i.test(value);
}

function looksLikeDate(value: CellValue): boolean {
    if (typeof value !== 'string') return false;
    const text = value.trim();
    return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text)
        || /^\d{4}-\d{2}-\d{2}([T\s].*)?$/.test(text);
}

function isBooleanToken(value: CellValue): boolean {
    const n = normalize(value);
    return BOOLEAN_TRUE.has(n) || BOOLEAN_FALSE.has(n);
}

function computeNumericStats(values: number[]): NumericStats | undefined {
    if (values.length === 0) return undefined;
    const sum = values.reduce((total, n) => total + n, 0);
    return {
        min: Math.min(...values),
        max: Math.max(...values),
        sum,
        avg: sum / values.length,
    };
}

function inferType(filled: CellValue[]): ColumnType {
    if (filled.length === 0) return 'empty';

    const ratio = (predicate: (v: CellValue) => boolean) =>
        filled.filter(predicate).length / filled.length;

    // Boolean exige consistencia alta (evita confundir 0/1 numericos genuinos).
    if (ratio(isBooleanToken) >= 0.9) return 'boolean';

    if (ratio(looksLikeCurrency) >= 0.5) return 'currency';

    if (ratio((v) => parseNumeric(v) !== null) >= 0.8) return 'number';

    if (ratio(looksLikeDate) >= 0.8) return 'date';

    // Categoria = cardinalidade baixa COM repeticao (ha valores que se repetem).
    // A razao distinct/filled so e exigida em colunas grandes, onde ruido e comum.
    const distinct = new Set(filled.map(normalize)).size;
    const hasRepetition = distinct < filled.length;
    const lowCardinality = distinct <= CATEGORY_MAX_DISTINCT;
    const ratioOk = filled.length < 10 || distinct / filled.length <= CATEGORY_MAX_RATIO;
    if (lowCardinality && hasRepetition && ratioOk) {
        return 'category';
    }

    return 'text';
}

function describeColumn(name: string, label: string, cells: CellValue[]): ColumnMetadata {
    const filled = cells.filter((c) => !isBlank(c));
    const type = inferType(filled);
    const distinctValues = Array.from(new Set(filled.map(normalize)));

    const numeric = (type === 'number' || type === 'currency')
        ? computeNumericStats(filled.map(parseNumeric).filter((n): n is number => n !== null))
        : undefined;

    const sample = type === 'category'
        ? filled.filter((c, i, arr) => arr.findIndex((x) => normalize(x) === normalize(c)) === i).slice(0, SAMPLE_SIZE)
        : filled.slice(0, SAMPLE_SIZE);

    return {
        name,
        label,
        type,
        filledCount: filled.length,
        emptyCount: cells.length - filled.length,
        distinctCount: distinctValues.length,
        numeric,
        sample,
    };
}

/** Descobre metadados de todas as colunas de uma GenericTable. */
export function discoverMetadata(table: GenericTable): ColumnMetadata[] {
    return table.columns.map((column) => {
        const cells = table.rows.map((row) => row[column.name] ?? null);
        return describeColumn(column.name, column.label, cells);
    });
}
