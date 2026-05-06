import * as XLSX from 'xlsx';
import { ExcelRow } from '../types';

type MonthKey =
    | 'janeiro'
    | 'fevereiro'
    | 'marco'
    | 'abril'
    | 'maio'
    | 'junho'
    | 'julho'
    | 'agosto'
    | 'setembro'
    | 'outubro'
    | 'novembro'
    | 'dezembro';

type ColumnMap = {
    corretor: number;
    nivel: number;
    equipe: number;
    valorVenda: number;
};

type WorksheetRows = {
    sheetName: string;
    rows: any[][];
};

export type ExcelColumnOption = {
    index: number;
    label: string;
};

export type ExcelParseOptions = {
    equipeColumn?: number;
    valorVendaColumn?: number;
};

const DEFAULT_COLUMNS: ColumnMap = {
    corretor: 11, // L
    nivel: 12, // M
    equipe: 16, // Q
    valorVenda: 21, // V
};

const MONTH_MAP: Record<string, MonthKey> = {
    JANEIRO: 'janeiro',
    FEVEREIRO: 'fevereiro',
    MARCO: 'marco',
    ABRIL: 'abril',
    MAIO: 'maio',
    JUNHO: 'junho',
    JULHO: 'julho',
    AGOSTO: 'agosto',
    SETEMBRO: 'setembro',
    OUTUBRO: 'outubro',
    NOVEMBRO: 'novembro',
    DEZEMBRO: 'dezembro',
};

const MONTH_KEYS: MonthKey[] = [
    'janeiro',
    'fevereiro',
    'marco',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
];

export class ExcelService {
    static async readExcelFile(file: File, options: ExcelParseOptions = {}): Promise<ExcelRow[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheets = this.getWorksheetRows(workbook);

                    for (const worksheet of worksheets) {
                        const rows = this.parseExcelData(worksheet.rows, options, worksheet.sheetName);
                        if (rows.length > 0) {
                            resolve(rows);
                            return;
                        }
                    }

                    resolve([]);
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }

    static async getColumnOptions(file: File): Promise<ExcelColumnOption[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = this.getWorksheetRows(workbook)[0];
                    const jsonData = worksheet?.rows ?? [];
                    const headerRow = this.findBestHeaderRow(jsonData);

                    resolve(headerRow.map((cell, index) => ({
                        index,
                        label: `${this.columnLetter(index)} - ${this.cleanText(cell) || 'Sem cabecalho'}`,
                    })));
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }

    private static getWorksheetRows(workbook: XLSX.WorkBook): WorksheetRows[] {
        const rankingSheets = workbook.SheetNames.filter((sheetName) => this.normalizeText(sheetName) === 'RANKING');
        const sheetNames = rankingSheets.length > 0 ? rankingSheets : workbook.SheetNames;

        return sheetNames.map((sheetName) => ({
            sheetName,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][],
        }));
    }

    private static parseExcelData(data: any[][], options: ExcelParseOptions, sheetName = ''): ExcelRow[] {
        if (this.normalizeText(sheetName) === 'RANKING') {
            const rankingRows = this.parseRankingData(data);
            if (rankingRows.length > 0) return rankingRows;
        }

        const monthlyTableRows = this.parseMonthlyColumnsData(data, options);
        if (monthlyTableRows.length > 0) return monthlyTableRows;

        const rankingRows = this.parseRankingData(data);
        if (rankingRows.length > 0) return rankingRows;

        const receivedReportRows = this.parseReceivedReportData(data, options);
        if (receivedReportRows.length > 0) return receivedReportRows;

        const resultRows: Record<string, ExcelRow> = {};
        let mesAtual: MonthKey | '' = '';
        let columns: ColumnMap = this.applyColumnOverrides({ ...DEFAULT_COLUMNS }, options);

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const detectedMonth = this.detectMonth(row);
            if (detectedMonth) {
                mesAtual = detectedMonth;
                continue;
            }

            const detectedColumns = this.detectColumns(row);
            if (detectedColumns) {
                columns = this.applyColumnOverrides(detectedColumns, options);
                continue;
            }

            const nomeCorretor = this.cleanText(row[columns.corretor]);

            if (
                !nomeCorretor ||
                this.isIgnoredName(nomeCorretor) ||
                !mesAtual
            ) continue;

            const resultKey = this.normalizeKey(nomeCorretor);

            if (!resultRows[resultKey]) {
                resultRows[resultKey] = {
                    corretor: nomeCorretor,
                    nivel: this.getCellText(row, columns.nivel),
                    equipe: this.getCellText(row, columns.equipe),
                    janeiro: 0,
                    fevereiro: 0,
                    marco: 0,
                    abril: 0,
                    maio: 0,
                    junho: 0,
                    julho: 0,
                    agosto: 0,
                    setembro: 0,
                    outubro: 0,
                    novembro: 0,
                    dezembro: 0,
                    total_mensal: 0,
                    valor_total: 0,
                };
            }

            const valorVenda = this.parseNumber(row[columns.valorVenda]);
            if (valorVenda <= 0) continue;

            if (!resultRows[resultKey].nivel) {
                resultRows[resultKey].nivel = this.getCellText(row, columns.nivel);
            }

            if (!resultRows[resultKey].equipe) {
                resultRows[resultKey].equipe = this.getCellText(row, columns.equipe);
            }

            const valorAtual = Number(resultRows[resultKey][mesAtual] || 0);
            (resultRows[resultKey] as Record<string, any>)[mesAtual] = valorAtual + valorVenda;

            resultRows[resultKey].valor_total = Number(resultRows[resultKey].valor_total) + valorVenda;
            resultRows[resultKey].total_mensal = Number(resultRows[resultKey].total_mensal) + 1;
        }

        return Object.values(resultRows);
    }

    private static parseRankingData(data: any[][]): ExcelRow[] {
        const rankingTable = this.detectRankingTable(data);
        if (!rankingTable) return [];

        const rows: ExcelRow[] = [];

        for (let i = rankingTable.dataStartIndex; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            if (this.isRankingEndSection(row)) break;

            const corretor = this.cleanText(row[rankingTable.corretorColumn]);
            if (!corretor || this.isIgnoredRankingName(corretor)) continue;

            const nivel = this.getCellText(row, rankingTable.nivelColumn);
            const equipe = this.getCellText(row, rankingTable.equipeColumn);
            if (this.isInvalidRankingLevel(nivel)) continue;

            const parsedRow: ExcelRow = {
                corretor,
                nivel,
                equipe,
                janeiro: 0,
                fevereiro: 0,
                marco: 0,
                abril: 0,
                maio: 0,
                junho: 0,
                julho: 0,
                agosto: 0,
                setembro: 0,
                outubro: 0,
                novembro: 0,
                dezembro: 0,
                total_mensal: 0,
                valor_total: 0,
            };

            for (const monthKey of MONTH_KEYS) {
                const monthValue = (rankingTable.monthColumns[monthKey] ?? [])
                    .reduce((total, columnIndex) => total + this.parseNumber(row[columnIndex]), 0);

                parsedRow[monthKey] = monthValue;

                if (monthValue > 0) {
                    parsedRow.total_mensal = Number(parsedRow.total_mensal) + 1;
                    parsedRow.valor_total = Number(parsedRow.valor_total) + monthValue;
                }
            }

            rows.push(parsedRow);
        }

        return rows;
    }

    private static detectRankingTable(data: any[][]): {
        dataStartIndex: number;
        corretorColumn: number;
        nivelColumn: number;
        equipeColumn: number;
        monthColumns: Record<MonthKey, number[]>;
    } | null {
        for (let headerIndex = 0; headerIndex < Math.min(data.length - 1, 10); headerIndex++) {
            const headerRow = data[headerIndex] ?? [];
            const monthRow = data[headerIndex + 1] ?? [];
            const normalizedHeaderCells = Array.from(
                { length: Math.max(headerRow.length, monthRow.length) },
                (_, index) => this.normalizeText(headerRow[index])
            );

            const corretorColumn = this.findColumn(normalizedHeaderCells, [
                (value) => value === 'CORRETORES' || value === 'CORRETOR',
            ]);
            const nivelColumn = this.findColumn(normalizedHeaderCells, [
                (value) => value === 'NIVEL',
            ]);
            const equipeColumn = this.findColumn(normalizedHeaderCells, [
                (value) => value === 'EQUIPE',
            ]);

            if (corretorColumn === -1 || nivelColumn === -1 || equipeColumn === -1) continue;

            const monthColumns = this.findRankingMonthColumns(headerRow, monthRow);
            const detectedMonthCount = MONTH_KEYS.filter((monthKey) => monthColumns[monthKey].length > 0).length;

            if (detectedMonthCount >= 3) {
                return {
                    dataStartIndex: headerIndex + 2,
                    corretorColumn,
                    nivelColumn,
                    equipeColumn,
                    monthColumns,
                };
            }
        }

        return null;
    }

    private static findRankingMonthColumns(headerRow: any[], monthRow: any[]): Record<MonthKey, number[]> {
        const maxLength = Math.max(headerRow.length, monthRow.length);
        const monthColumns = MONTH_KEYS.reduce((acc, monthKey) => {
            acc[monthKey] = [];
            return acc;
        }, {} as Record<MonthKey, number[]>);

        for (let columnIndex = 0; columnIndex < maxLength; columnIndex++) {
            const monthCell = this.normalizeText(monthRow[columnIndex]);
            const headerCell = this.normalizeText(headerRow[columnIndex]);
            const monthKey = this.detectMonthColumn(monthCell);

            if (monthKey && !this.isTotalColumnLabel(monthCell)) {
                monthColumns[monthKey].push(columnIndex);
            }

            if (headerCell === 'DEZEMBRO' && monthColumns.dezembro.length === 0) {
                monthColumns.dezembro.push(columnIndex);
            }
        }

        const dezembroTotalColumn = Array.from({ length: maxLength }, (_, index) => index)
            .find((index) => this.normalizeText(headerRow[index]) === 'DEZEMBRO' && !this.normalizeText(monthRow[index]));

        if (dezembroTotalColumn !== undefined) {
            monthColumns.dezembro = [dezembroTotalColumn];
        }

        return monthColumns;
    }

    private static isTotalColumnLabel(value: string): boolean {
        return value.includes('TOTAL') || value.includes('MEDIA') || value === 'MES';
    }

    private static parseReceivedReportData(data: any[][], options: ExcelParseOptions): ExcelRow[] {
        const header = this.detectReceivedReportHeader(data);
        if (!header) return [];

        const resultRows: Record<string, ExcelRow> = {};
        let mesAtual: MonthKey | '' = '';

        for (let i = header.headerIndex + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const detectedMonth = this.detectMonth(row);
            if (detectedMonth) {
                mesAtual = detectedMonth;
                continue;
            }

            const nomeCorretor = this.cleanText(row[header.corretorColumn]);
            if (!nomeCorretor || this.isIgnoredName(nomeCorretor)) continue;

            const receivedMonth = this.getMonthFromReceivedDate(row[header.receivedDateColumn]) || mesAtual;
            if (!receivedMonth) continue;

            const resultKey = this.normalizeKey(nomeCorretor);

            if (!resultRows[resultKey]) {
                resultRows[resultKey] = {
                    corretor: nomeCorretor,
                    nivel: this.getCellText(row, header.nivelColumn),
                    equipe: 'Lançamentos',
                    janeiro: 0,
                    fevereiro: 0,
                    marco: 0,
                    abril: 0,
                    maio: 0,
                    junho: 0,
                    julho: 0,
                    agosto: 0,
                    setembro: 0,
                    outubro: 0,
                    novembro: 0,
                    dezembro: 0,
                    total_mensal: 0,
                    valor_total: 0,
                };
            }

            const valorVenda = this.getReceivedReportValue(row, header, options);
            if (valorVenda <= 0) continue;

            if (!resultRows[resultKey].nivel) {
                resultRows[resultKey].nivel = this.getCellText(row, header.nivelColumn);
            }

            const valorAtual = Number(resultRows[resultKey][receivedMonth] || 0);
            (resultRows[resultKey] as Record<string, any>)[receivedMonth] = valorAtual + valorVenda;
            resultRows[resultKey].valor_total = Number(resultRows[resultKey].valor_total) + valorVenda;
        }

        return Object.values(resultRows).map((row) => ({
            ...row,
            total_mensal: MONTH_KEYS.filter((monthKey) => Number(row[monthKey] || 0) > 0).length,
        }));
    }

    private static getReceivedReportValue(
        row: any[],
        header: {
            valueColumn: number;
            directValueColumns: number[];
            teamLeaderColumn: number;
        },
        options: ExcelParseOptions
    ): number {
        if (options.valorVendaColumn !== undefined && options.valorVendaColumn !== DEFAULT_COLUMNS.valorVenda) {
            return this.parseNumber(row[options.valorVendaColumn]);
        }

        const directValue = header.directValueColumns.reduce((total, columnIndex) => {
            if (columnIndex < 0) return total;
            return total + this.parseNumber(row[columnIndex]);
        }, 0);

        if (directValue > 0) return directValue;

        const teamLeaderValue = this.parseNumber(row[header.teamLeaderColumn]);
        if (teamLeaderValue > 0) return teamLeaderValue;

        return this.parseNumber(row[header.valueColumn]);
    }

    private static detectReceivedReportHeader(data: any[][]): {
        headerIndex: number;
        corretorColumn: number;
        nivelColumn: number;
        valueColumn: number;
        directValueColumns: number[];
        teamLeaderColumn: number;
        receivedDateColumn: number;
    } | null {
        for (let headerIndex = 0; headerIndex < Math.min(data.length, 20); headerIndex++) {
            const row = data[headerIndex];
            if (!row || row.length === 0) continue;

            const normalizedCells = Array.from(
                { length: row.length },
                (_, index) => this.normalizeText(row[index])
            );

            const corretorColumn = this.findColumn(normalizedCells, [
                (value) => value === 'CORRETOR',
            ]);
            const valueColumn = this.findColumn(normalizedCells, [
                (value) => value.includes('FICA') && value.includes('CONTA') && value.includes('JAPI'),
            ]);
            const receivedDateColumn = this.findColumn(normalizedCells, [
                (value) => value.includes('DATA') && value.includes('RECEBIMENTO'),
            ]);

            if (corretorColumn !== -1 && valueColumn !== -1 && receivedDateColumn !== -1) {
                return {
                    headerIndex,
                    corretorColumn,
                    nivelColumn: this.findColumn(normalizedCells, [
                        (value) => value === 'TIPO',
                        (value) => value === 'NIVEL',
                    ], DEFAULT_COLUMNS.nivel),
                    valueColumn,
                    directValueColumns: [
                        this.findColumn(normalizedCells, [(value) => value === '0.2' || value === '0,2'], 13),
                        this.findColumn(normalizedCells, [(value) => value === '0.4' || value === '0,4'], 14),
                        this.findColumn(normalizedCells, [(value) => value === '0.45' || value === '0,45'], 15),
                        this.findColumn(normalizedCells, [(value) => value === '0.5' || value === '0,5'], 16),
                    ],
                    teamLeaderColumn: this.findColumn(normalizedCells, [
                        (value) => value.includes('TEAM') && value.includes('LEADER'),
                    ], 17),
                    receivedDateColumn,
                };
            }
        }

        return null;
    }

    private static parseMonthlyColumnsData(data: any[][], options: ExcelParseOptions): ExcelRow[] {
        const table = this.detectMonthlyColumnsTable(data, options);
        if (!table) return [];

        const resultRows: Record<string, ExcelRow> = {};

        for (let i = table.headerIndex + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const nomeCorretor = this.cleanText(row[table.columns.corretor]);
            if (!nomeCorretor || this.isIgnoredName(nomeCorretor)) continue;

            const resultKey = this.normalizeKey(nomeCorretor);
            if (!resultRows[resultKey]) {
                resultRows[resultKey] = {
                    corretor: nomeCorretor,
                    nivel: this.getCellText(row, table.columns.nivel),
                    equipe: this.getCellText(row, table.columns.equipe),
                    janeiro: 0,
                    fevereiro: 0,
                    marco: 0,
                    abril: 0,
                    maio: 0,
                    junho: 0,
                    julho: 0,
                    agosto: 0,
                    setembro: 0,
                    outubro: 0,
                    novembro: 0,
                    dezembro: 0,
                    total_mensal: 0,
                    valor_total: 0,
                };
            }

            if (!resultRows[resultKey].nivel) {
                resultRows[resultKey].nivel = this.getCellText(row, table.columns.nivel);
            }

            if (!resultRows[resultKey].equipe) {
                resultRows[resultKey].equipe = this.getCellText(row, table.columns.equipe);
            }

            for (const [monthKey, columnIndex] of Object.entries(table.monthColumns) as Array<[MonthKey, number]>) {
                const monthValue = this.parseNumber(row[columnIndex]);
                const currentValue = Number(resultRows[resultKey][monthKey] || 0);
                (resultRows[resultKey] as Record<string, any>)[monthKey] = currentValue + monthValue;

                if (monthValue > 0) {
                    resultRows[resultKey].valor_total = Number(resultRows[resultKey].valor_total) + monthValue;
                }
            }
        }

        return Object.values(resultRows).map((row) => ({
            ...row,
            total_mensal: MONTH_KEYS.filter((monthKey) => Number(row[monthKey] || 0) > 0).length,
        }));
    }

    private static detectMonthlyColumnsTable(data: any[][], options: ExcelParseOptions): {
        headerIndex: number;
        columns: ColumnMap;
        monthColumns: Partial<Record<MonthKey, number>>;
    } | null {
        for (let headerIndex = 0; headerIndex < data.length; headerIndex++) {
            const row = data[headerIndex];
            if (!row || row.length === 0) continue;

            const normalizedCells = Array.from(
                { length: row.length },
                (_, index) => this.normalizeText(row[index])
            );

            const columns = this.detectColumns(row);
            if (!columns) continue;

            const monthColumns: Partial<Record<MonthKey, number>> = {};
            normalizedCells.forEach((value, index) => {
                const monthKey = this.detectMonthColumn(value);
                if (monthKey && monthColumns[monthKey] === undefined) {
                    monthColumns[monthKey] = index;
                }
            });

            if (Object.keys(monthColumns).length >= 2) {
                return {
                    headerIndex,
                    columns: this.applyColumnOverrides(columns, options),
                    monthColumns,
                };
            }
        }

        return null;
    }

    private static detectMonth(row: any[]): MonthKey | '' {
        for (const cell of row.slice(0, 6)) {
            const value = this.normalizeText(cell);
            if (!value) continue;

            for (const [monthLabel, monthKey] of Object.entries(MONTH_MAP)) {
                const monthRegex = new RegExp(`(^|[^A-Z])${monthLabel}([^A-Z]|$)`);
                if (value === monthLabel || monthRegex.test(value)) {
                    return monthKey;
                }
            }
        }

        return '';
    }

    private static detectMonthColumn(value: string): MonthKey | '' {
        if (!value) return '';

        const aliases: Record<MonthKey, string[]> = {
            janeiro: ['JAN', 'JANEIRO'],
            fevereiro: ['FEV', 'FEVEREIRO'],
            marco: ['MAR', 'MARCO', 'MARÇO'],
            abril: ['ABR', 'ABRIL'],
            maio: ['MAI', 'MAIO'],
            junho: ['JUN', 'JUNHO'],
            julho: ['JUL', 'JULHO'],
            agosto: ['AGO', 'AGOSTO'],
            setembro: ['SET', 'SETEMBRO'],
            outubro: ['OUT', 'OUTUBRO'],
            novembro: ['NOV', 'NOVEMBRO'],
            dezembro: ['DEZ', 'DEZEMBRO'],
        };

        for (const [monthKey, monthAliases] of Object.entries(aliases) as Array<[MonthKey, string[]]>) {
            if (monthAliases.some((alias) => value === alias || value.startsWith(`${alias} `))) {
                return monthKey;
            }
        }

        return '';
    }

    private static detectColumns(row: any[]): ColumnMap | null {
        const normalizedCells = Array.from(
            { length: row.length },
            (_, index) => this.normalizeText(row[index])
        );
        const corretor = this.findColumn(normalizedCells, [
            (value) => value === 'CORRETOR',
            (value) => value.includes('NOME') && value.includes('CORRETOR'),
            (value) => value.includes('CONSULTOR'),
            (value) => value.includes('VENDEDOR'),
        ]);

        if (corretor === -1) return null;

        return {
            corretor,
            nivel: this.findColumnByScore(normalizedCells, this.scoreNivelColumn, DEFAULT_COLUMNS.nivel),
            equipe: this.findColumnByScore(normalizedCells, this.scoreEquipeColumn, DEFAULT_COLUMNS.equipe),
            valorVenda: this.findColumnByScore(normalizedCells, this.scoreValorColumn, DEFAULT_COLUMNS.valorVenda),
        };
    }

    private static applyColumnOverrides(columns: ColumnMap, options: ExcelParseOptions): ColumnMap {
        return {
            ...columns,
            equipe: options.equipeColumn ?? columns.equipe,
            valorVenda: options.valorVendaColumn ?? columns.valorVenda,
        };
    }

    private static findBestHeaderRow(data: any[][]): any[] {
        let bestRow: any[] = [];
        let bestScore = 0;

        for (const row of data) {
            if (!row || row.length === 0) continue;

            const normalizedCells = Array.from(
                { length: row.length },
                (_, index) => this.normalizeText(row[index])
            );

            const score = normalizedCells.reduce((total, value) => {
                if (!value) return total;
                if (value.includes('CORRETOR') || value.includes('VENDEDOR') || value.includes('CONSULTOR')) return total + 4;
                if (value.includes('EQUIPE') || value.includes('TIME')) return total + 3;
                if (this.scoreValorColumn(value) > 0) return total + 2;
                if (value.includes('NIVEL')) return total + 1;
                return total;
            }, 0);

            if (score > bestScore) {
                bestRow = row;
                bestScore = score;
            }
        }

        return bestRow.length > 0 ? bestRow : data.find(row => row?.length > 0) ?? [];
    }

    private static findColumn(
        values: string[],
        predicates: Array<(value: string) => boolean>,
        fallback = -1
    ): number {
        const index = values.findIndex((value) => {
            if (!value) return false;
            return predicates.some((predicate) => predicate(value));
        });
        return index === -1 ? fallback : index;
    }

    private static findColumnByScore(
        values: string[],
        scoreColumn: (value: string) => number,
        fallback = -1
    ): number {
        let bestIndex = -1;
        let bestScore = 0;

        values.forEach((value, index) => {
            if (!value) return;

            const score = scoreColumn(value);
            if (score > bestScore) {
                bestIndex = index;
                bestScore = score;
            }
        });

        return bestIndex === -1 ? fallback : bestIndex;
    }

    private static scoreNivelColumn(value: string): number {
        if (value === 'NIVEL') return 100;
        if (value.includes('NIVEL')) return 80;
        return 0;
    }

    private static scoreEquipeColumn(value: string): number {
        if (value === 'EQUIPE') return 100;
        if (value === 'TIME') return 95;
        if (value.includes('NOME') && value.includes('EQUIPE')) return 90;
        if (value.includes('EQUIPE') && value.includes('CORRETOR')) return 85;
        if (value.startsWith('EQUIPE ')) return 80;
        return 0;
    }

    private static scoreValorColumn(value: string): number {
        if (value.includes('COMISSAO') && value.includes('CORRETOR')) return 130;
        if (value.includes('COMISSAO')) return 120;
        if (value.includes('VALOR') && value.includes('CORRETOR')) return 115;
        if (value === 'VALOR' || value === 'VALOR R$') return 110;
        if (value.includes('VALOR') && value.includes('RECEBIDO')) return 105;
        if (value.includes('VALOR') && value.includes('VENDIDO')) return 95;
        if (value.includes('VALOR') && value.includes('VENDA')) return 90;
        if (value === 'VGV' || value.includes('VGV')) return 40;
        if (value.includes('VALOR') && value.includes('IMOVEL')) return 30;
        if (value.includes('VALOR') && value.includes('TOTAL')) return 20;
        return 0;
    }

    private static parseNumber(value: any): number {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return value;

        const compact = String(value).replace(/[R$\s]/g, '');
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
            const decimalDigits = compact.length - lastDot - 1;
            cleaned = decimalDigits > 2 ? compact.replace(/\./g, '') : compact;
        }

        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    }

    private static isValidReceivedDate(value: any): boolean {
        if (typeof value === 'number') return value > 0;
        if (value instanceof Date) return !isNaN(value.getTime());

        const text = this.cleanText(value);
        if (!text) return false;

        return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text);
    }

    private static getMonthFromReceivedDate(value: any): MonthKey | '' {
        if (!this.isValidReceivedDate(value)) return '';

        if (typeof value === 'number') {
            const parsedDate = XLSX.SSF.parse_date_code(value);
            return parsedDate?.m ? MONTH_KEYS[parsedDate.m - 1] : '';
        }

        if (value instanceof Date && !isNaN(value.getTime())) {
            return MONTH_KEYS[value.getMonth()];
        }

        const text = this.cleanText(value);
        const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (brDate) return MONTH_KEYS[Number(brDate[2]) - 1] || '';

        const isoDate = text.match(/^\d{4}-(\d{2})-\d{2}/);
        if (isoDate) return MONTH_KEYS[Number(isoDate[1]) - 1] || '';

        return '';
    }

    private static cleanText(value: any): string {
        return String(value ?? '').trim().replace(/\s+/g, ' ');
    }

    private static columnLetter(index: number): string {
        let letter = '';
        let value = index + 1;

        while (value > 0) {
            const remainder = (value - 1) % 26;
            letter = String.fromCharCode(65 + remainder) + letter;
            value = Math.floor((value - 1) / 26);
        }

        return letter;
    }

    private static getCellText(row: any[], index: number): string {
        if (index < 0) return '';
        return this.cleanText(row[index]);
    }

    private static normalizeText(value: any): string {
        return this.cleanText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    private static normalizeKey(value: string): string {
        return this.normalizeText(value);
    }

    private static isIgnoredName(value: string): boolean {
        const normalized = this.normalizeText(value);
        return (
            normalized === 'CORRETOR' ||
            normalized === 'NOME DO CORRETOR' ||
            normalized.includes('TOTAL') ||
            normalized.includes('SUBTOTAL')
        );
    }

    private static isIgnoredRankingName(value: string): boolean {
        const normalized = this.normalizeText(value);
        return (
            this.isIgnoredName(value) ||
            normalized === 'CORRETORES' ||
            normalized === 'SAIDA' ||
            normalized.includes('QUEM SAIU') ||
            normalized.includes('TOTAL VGC')
        );
    }

    private static isRankingEndSection(row: any[]): boolean {
        return row.some((cell) => {
            const normalized = this.normalizeText(cell);
            return (
                normalized === 'SAIDA' ||
                normalized === 'SAIDAS' ||
                normalized.includes('QUEM SAIU') ||
                normalized.includes('CORRETORES QUE SAIRAM') ||
                normalized.includes('DESLIGADOS') ||
                normalized.includes('INATIVOS')
            );
        });
    }

    private static isInvalidRankingLevel(value: string): boolean {
        const cleaned = this.cleanText(value);
        if (!cleaned) return false;

        return /^-?\d+(?:[.,]\d+)?%?$/.test(cleaned);
    }
}
