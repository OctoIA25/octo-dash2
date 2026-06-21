/**
 * Schema-less parser: le uma planilha para GenericTable SEM assumir dominio.
 *
 * Estrategia (estrutural, nao-semantica):
 *  1. Encontrar a linha de cabecalho = primeira linha "densa" cujos valores parecem
 *     rotulos (majoritariamente texto, poucas celulas vazias).
 *  2. Derivar nomes de coluna unicos a partir do cabecalho (colunas sem rotulo
 *     recebem nome posicional; duplicatas sao desambiguadas).
 *  3. Ler as linhas seguintes como dados, ignorando linhas totalmente vazias.
 *
 * Pura em relacao a I/O: recebe a matriz ja lida (any[][]) e devolve GenericTable.
 * A leitura do arquivo (FileReader + xlsx) fica no servico, para manter testabilidade.
 */

import type { CellValue, GenericColumn, GenericTable } from './types';

/** Teto de seguranca: planilhas maiores sao truncadas com aviso (truncated=true). */
export const MAX_ROWS = 5000;

function isBlank(value: unknown): boolean {
    return value === null || value === undefined || String(value).trim() === '';
}

function toCellValue(value: unknown): CellValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    const text = String(value).trim();
    return text === '' ? null : text;
}

/**
 * Escolhe a linha de cabecalho de forma estrutural (sem aliases de dominio):
 * prefere a primeira linha com maior numero de celulas preenchidas e
 * predominantemente textuais (rotulos costumam ser texto).
 */
export function findHeaderRow(rows: unknown[][]): number {
    let bestIndex = -1;
    let bestScore = 0;

    const limit = Math.min(rows.length, 20);
    for (let i = 0; i < limit; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const filled = row.filter((cell) => !isBlank(cell));
        if (filled.length < 1) continue; // cabecalho precisa de >= 1 coluna preenchida

        const textual = filled.filter((cell) => typeof cell === 'string' || Number.isNaN(Number(cell))).length;
        // Pontua densidade + predominancia textual; linhas de dados numericos pontuam menos.
        const score = filled.length + textual;

        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    return bestIndex;
}

/** Deriva nomes unicos de coluna a partir do cabecalho cru. */
export function deriveColumns(headerRow: unknown[]): GenericColumn[] {
    const used = new Map<string, number>();

    // IMPORTANTE: `Array.from({length})` materializa TODOS os índices (denso).
    // `headerRow.map` pula holes de arrays esparsos — e o `sheet_to_json` do XLSX
    // produz holes quando o cabeçalho tem células vazias intercaladas
    // (ex.: ["KPI", , , "Janeiro"]). Iterar o resultado esparso com `for..of`
    // devolveria `undefined` numa coluna e quebraria a leitura. Denso evita isso.
    return Array.from({ length: headerRow.length }, (_unused, index) => {
        const cell = headerRow[index];
        const label = isBlank(cell) ? `Coluna ${index + 1}` : String(cell).trim().replace(/\s+/g, ' ');

        const base = label;
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        const name = seen === 0 ? base : `${base} (${seen + 1})`;

        return { name, label, index };
    });
}

/** Le a matriz crua para GenericTable. */
export function parseGenericTable(data: unknown[][], sheetName = ''): GenericTable {
    const headerIndex = findHeaderRow(data);

    if (headerIndex === -1) {
        return { sheetName, columns: [], rows: [], totalRows: 0, truncated: false };
    }

    const columns = deriveColumns(data[headerIndex]);
    const rows: Array<Record<string, CellValue>> = [];
    let totalRows = 0;
    let truncated = false;

    for (let i = headerIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.every(isBlank)) continue; // pula linhas totalmente vazias

        totalRows++;
        if (rows.length >= MAX_ROWS) {
            truncated = true;
            continue; // continua contando totalRows para informar o tamanho real
        }

        const record: Record<string, CellValue> = {};
        for (const column of columns) {
            record[column.name] = toCellValue(row[column.index]);
        }
        rows.push(record);
    }

    return { sheetName, columns, rows, totalRows, truncated };
}
