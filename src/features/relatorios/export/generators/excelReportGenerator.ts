/**
 * Gerador de Excel (.xlsx) ESTILIZADO via ExcelJS.
 *
 * Consome o mesmo `ReportModel` do PDF. Cada seção vira uma aba com banda de
 * título da marca, cabeçalho colorido, zebra, bordas, números formatados
 * (moeda/percentual), largura automática e cabeçalho congelado.
 */

import type {
  ReportModel,
  ExportSelection,
  ReportSection,
  ChartSection,
} from '../types';
import { selectedSections } from '../types';
import { buildReportFilename } from '../filename';

type Cell = string | number;
interface Block {
  columns: string[];
  rows: Cell[][];
}

const BRAND = 'FF2563EB';
const BRAND_SOFT = 'FFEFF4FE';
const ZEBRA = 'FFF7F9FC';
const INK = 'FF111827';
const WHITE = 'FFFFFFFF';
const BORDER = 'FFE2E8F0';

export async function generateXlsx(model: ReportModel, selection: ExportSelection): Promise<void> {
  const sections = selectedSections(model, selection);
  if (sections.length === 0) return;

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OctoDash';
  const usedNames = new Set<string>();

  for (const section of sections) {
    const block = sectionToBlock(section);
    if (!block || block.columns.length === 0) continue;
    const sheet = workbook.addWorksheet(uniqueSheetName(section.title, usedNames), {
      views: [{ state: 'frozen', ySplit: 3 }],
    });
    renderBlock(sheet, model.title, section.title, block);
  }

  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet('Relatório').getCell('A1').value = 'Sem dados tabulares para exportar.';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, buildReportFilename(model, 'xlsx'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderização de uma aba
// ─────────────────────────────────────────────────────────────────────────────

function renderBlock(
  sheet: import('exceljs').Worksheet,
  reportTitle: string,
  sectionTitle: string,
  block: Block,
): void {
  const colCount = block.columns.length;
  const lastCol = columnLetter(colCount);

  // Banda 1: título do relatório (marca).
  sheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = reportTitle;
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 26;

  // Banda 2: título da seção.
  sheet.mergeCells(`A2:${lastCol}2`);
  const sub = sheet.getCell('A2');
  sub.value = sectionTitle;
  sub.font = { bold: true, size: 11, color: { argb: INK } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 20;

  // Linha 3: cabeçalho das colunas.
  const header = sheet.getRow(3);
  block.columns.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
    cell.border = thinBorder();
  });
  header.height = 18;

  // Dados.
  const widths = block.columns.map((c) => c.length + 2);
  block.rows.forEach((row, r) => {
    const excelRow = sheet.getRow(4 + r);
    row.forEach((raw, c) => {
      const cell = excelRow.getCell(c + 1);
      const parsed = parseCell(raw);
      cell.value = parsed.value;
      if (parsed.numFmt) cell.numFmt = parsed.numFmt;
      cell.font = { size: 9.5, color: { argb: INK } };
      cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'left' : parsed.numeric ? 'right' : 'left' };
      cell.border = thinBorder();
      if (r % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
      widths[c] = Math.min(48, Math.max(widths[c], String(parsed.display ?? raw).length + 2));
    });
  });

  sheet.columns.forEach((col, i) => {
    col.width = widths[i] ?? 12;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Seção -> bloco tabular
// ─────────────────────────────────────────────────────────────────────────────

function sectionToBlock(section: ReportSection): Block | null {
  switch (section.kind) {
    case 'metrics':
      return {
        columns: ['Indicador', 'Valor', 'Detalhe'],
        rows: section.items.map((i) => [i.label, i.value, i.hint ?? '']),
      };
    case 'table':
      return { columns: section.columns, rows: section.rows };
    case 'text':
      return { columns: [section.title], rows: section.paragraphs.map((p) => [p]) };
    case 'chart':
      return chartToBlock(section);
  }
}

function chartToBlock(section: ChartSection): Block {
  if (section.chartType === 'doughnut') {
    const values = section.series[0]?.data ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;
    return {
      columns: ['Categoria', 'Valor', '%'],
      rows: section.labels.map((label, i) => [label, values[i] ?? 0, `${Math.round(((values[i] ?? 0) / total) * 100)}%`]),
    };
  }
  return {
    columns: ['Categoria', ...section.series.map((s, i) => s.name || `Série ${i + 1}`)],
    rows: section.labels.map((label, i) => [label, ...section.series.map((s) => s.data[i] ?? 0)]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedCell {
  value: Cell;
  numFmt?: string;
  numeric: boolean;
  display: string;
}

/** Converte strings de exibição (moeda/percentual/número) em números formatados. */
function parseCell(raw: Cell): ParsedCell {
  if (typeof raw === 'number') {
    return { value: raw, numeric: true, display: String(raw), numFmt: Number.isInteger(raw) ? '#,##0' : '#,##0.00' };
  }
  const text = String(raw ?? '').trim();

  const currency = text.match(/^R\$\s*([\d.]+(?:,\d+)?)$/);
  if (currency) {
    const n = brToNumber(currency[1]);
    if (n !== null) return { value: n, numeric: true, display: text, numFmt: '"R$"\\ #,##0' };
  }

  const percent = text.match(/^([\d.]+(?:,\d+)?)\s*%$/);
  if (percent) {
    const n = brToNumber(percent[1]);
    if (n !== null) return { value: n, numeric: true, display: text, numFmt: '0"%"' };
  }

  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(text) || /^-?\d+$/.test(text)) {
    const n = brToNumber(text);
    if (n !== null) return { value: n, numeric: true, display: text, numFmt: Number.isInteger(n) ? '#,##0' : '#,##0.00' };
  }

  return { value: text, numeric: false, display: text };
}

/** "1.234,56" (pt-BR) -> 1234.56 */
function brToNumber(text: string): number | null {
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function thinBorder() {
  const side = { style: 'thin' as const, color: { argb: BORDER } };
  return { top: side, bottom: side, left: side, right: side };
}

function columnLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || 'A';
}

function uniqueSheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/?*[\]:]/g, '').slice(0, 28).trim() || 'Aba';
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base.slice(0, 25)} ${i++}`;
  }
  used.add(name.toLowerCase());
  return name;
}

function downloadBlob(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
