/**
 * Gerador de PDF profissional a partir de um `ReportModel`.
 *
 * 100% nativo: títulos, KPIs, tabelas, textos E gráficos são desenhados como
 * conteúdo vetorial do jsPDF (nítido, selecionável, paginável). Nenhuma captura
 * de tela — o documento tem identidade própria e não parece um print. Lib pura,
 * sem dependência de React.
 */

import type {
  ReportModel,
  ReportSection,
  ExportSelection,
  MetricsSection,
  TableSection,
  TextSection,
  ChartSection,
} from '../types';
import { selectedSections } from '../types';
import { buildReportFilename } from '../filename';
import { drawChart, chartBlockHeight, type Box } from './drawCharts';

const COLOR = {
  primary: [37, 99, 235] as [number, number, number],
  ink: [17, 24, 39] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  zebra: [247, 249, 252] as [number, number, number],
  cardBg: [243, 247, 253] as [number, number, number],
};

const PAGE = { marginX: 14, marginTop: 22, marginBottom: 16 };

type Doc = import('jspdf').jsPDF;

interface Layout {
  pdf: Doc;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  cursorY: number;
  model: ReportModel;
  generatedAt: string;
}

export async function generatePdf(model: ReportModel, selection: ExportSelection): Promise<void> {
  const sections = selectedSections(model, selection);
  if (sections.length === 0) return;

  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const layout: Layout = {
    pdf,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - PAGE.marginX * 2,
    cursorY: PAGE.marginTop,
    model,
    generatedAt: formatGeneratedAt(),
  };

  drawCover(layout);

  let currentGroup: string | null = null;
  for (const section of sections) {
    if (section.group !== currentGroup) {
      drawGroupHeader(layout, groupTitle(model, section.group));
      currentGroup = section.group;
    }
    drawSection(layout, section);
  }

  paintRunningHeaderFooter(layout);
  pdf.save(buildReportFilename(model, 'pdf'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Capa / cabeçalhos
// ─────────────────────────────────────────────────────────────────────────────

function drawCover(l: Layout): void {
  const { pdf } = l;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(...COLOR.ink);
  pdf.text(l.model.title, PAGE.marginX, l.cursorY);
  l.cursorY += 8;

  if (l.model.subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...COLOR.muted);
    pdf.text(l.model.subtitle, PAGE.marginX, l.cursorY);
    l.cursorY += 6;
  }

  if (l.model.meta.length > 0) {
    pdf.setFontSize(9);
    const parts = l.model.meta.map((m) => `${m.label}: ${m.value}`);
    const lines = pdf.splitTextToSize(parts.join('   •   '), l.contentWidth);
    pdf.setTextColor(...COLOR.muted);
    pdf.text(lines, PAGE.marginX, l.cursorY);
    l.cursorY += lines.length * 4.5;
  }

  l.cursorY += 2;
  drawDivider(l);
  l.cursorY += 4;
}

function drawDivider(l: Layout): void {
  l.pdf.setDrawColor(...COLOR.line);
  l.pdf.setLineWidth(0.3);
  l.pdf.line(PAGE.marginX, l.cursorY, l.pageWidth - PAGE.marginX, l.cursorY);
}

function drawGroupHeader(l: Layout, title: string): void {
  ensureSpace(l, 16);
  const { pdf } = l;
  pdf.setFillColor(...COLOR.primary);
  pdf.rect(PAGE.marginX, l.cursorY, 3, 6, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(...COLOR.ink);
  pdf.text(title, PAGE.marginX + 5, l.cursorY + 5);
  l.cursorY += 11;
}

function drawSectionTitle(l: Layout, title: string): void {
  l.pdf.setFont('helvetica', 'bold');
  l.pdf.setFontSize(11);
  l.pdf.setTextColor(...COLOR.ink);
  l.pdf.text(title, PAGE.marginX, l.cursorY);
  l.cursorY += 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seções
// ─────────────────────────────────────────────────────────────────────────────

function drawSection(l: Layout, section: ReportSection): void {
  switch (section.kind) {
    case 'metrics':
      drawMetrics(l, section);
      break;
    case 'table':
      drawTable(l, section.title, section);
      break;
    case 'text':
      drawText(l, section);
      break;
    case 'chart':
      drawChartSection(l, section);
      break;
  }
  l.cursorY += 5;
}

function drawMetrics(l: Layout, section: MetricsSection): void {
  const perRow = 3;
  const gap = 4;
  const cardH = 18;
  const rows = Math.ceil(section.items.length / perRow);
  ensureSpace(l, 8 + rows * (cardH + gap));
  drawSectionTitle(l, section.title);

  const cardW = (l.contentWidth - gap * (perRow - 1)) / perRow;
  section.items.forEach((item, idx) => {
    const col = idx % perRow;
    const x = PAGE.marginX + col * (cardW + gap);
    const y = l.cursorY;

    l.pdf.setFillColor(...COLOR.cardBg);
    l.pdf.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    l.pdf.setFont('helvetica', 'normal');
    l.pdf.setFontSize(8);
    l.pdf.setTextColor(...COLOR.muted);
    l.pdf.text(truncate(l, item.label, cardW - 6), x + 4, y + 6);
    l.pdf.setFont('helvetica', 'bold');
    l.pdf.setFontSize(14);
    l.pdf.setTextColor(...COLOR.primary);
    l.pdf.text(String(item.value), x + 4, y + 13);
    if (item.hint) {
      l.pdf.setFont('helvetica', 'normal');
      l.pdf.setFontSize(7);
      l.pdf.setTextColor(...COLOR.muted);
      l.pdf.text(truncate(l, item.hint, cardW - 6), x + 4, y + 16.5);
    }
    if (col === perRow - 1 || idx === section.items.length - 1) {
      l.cursorY += cardH + gap;
    }
  });
}

function drawTable(l: Layout, title: string, table: TableSection): void {
  ensureSpace(l, 22);
  drawSectionTitle(l, title);

  const { columns, rows } = table;
  const colCount = columns.length || 1;
  const colW = l.contentWidth / colCount;
  const rowH = 7;

  const drawHeaderRow = () => {
    l.pdf.setFillColor(...COLOR.primary);
    l.pdf.rect(PAGE.marginX, l.cursorY, l.contentWidth, rowH, 'F');
    l.pdf.setFont('helvetica', 'bold');
    l.pdf.setFontSize(8.5);
    l.pdf.setTextColor(255, 255, 255);
    columns.forEach((col, i) => {
      l.pdf.text(truncate(l, String(col), colW - 4), PAGE.marginX + i * colW + 2, l.cursorY + 4.8);
    });
    l.cursorY += rowH;
  };

  drawHeaderRow();
  l.pdf.setFont('helvetica', 'normal');
  l.pdf.setFontSize(8.5);
  rows.forEach((row, rIdx) => {
    if (l.cursorY + rowH > l.pageHeight - PAGE.marginBottom) {
      addPage(l);
      drawHeaderRow();
      l.pdf.setFont('helvetica', 'normal');
      l.pdf.setFontSize(8.5);
    }
    if (rIdx % 2 === 1) {
      l.pdf.setFillColor(...COLOR.zebra);
      l.pdf.rect(PAGE.marginX, l.cursorY, l.contentWidth, rowH, 'F');
    }
    l.pdf.setTextColor(...COLOR.ink);
    row.forEach((cell, i) => {
      l.pdf.text(truncate(l, String(cell), colW - 4), PAGE.marginX + i * colW + 2, l.cursorY + 4.8);
    });
    l.cursorY += rowH;
  });
}

function drawText(l: Layout, section: TextSection): void {
  ensureSpace(l, 14);
  drawSectionTitle(l, section.title);
  l.pdf.setFont('helvetica', 'normal');
  l.pdf.setFontSize(9.5);
  l.pdf.setTextColor(...COLOR.ink);
  section.paragraphs.forEach((paragraph) => {
    const lines = l.pdf.splitTextToSize(paragraph, l.contentWidth);
    lines.forEach((line: string) => {
      ensureSpace(l, 5.5);
      l.pdf.text(line, PAGE.marginX, l.cursorY);
      l.cursorY += 5;
    });
    l.cursorY += 2;
  });
}

function drawChartSection(l: Layout, section: ChartSection): void {
  const chartH = chartBlockHeight(section);
  // Reserva título + gráfico juntos: evita título órfão no rodapé.
  ensureSpace(l, 6 + chartH);
  drawSectionTitle(l, section.title);

  const box: Box = { x: PAGE.marginX, y: l.cursorY, w: l.contentWidth, h: chartH };
  drawChart(l.pdf, box, section);
  l.cursorY += chartH;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginação / rodapé
// ─────────────────────────────────────────────────────────────────────────────

function ensureSpace(l: Layout, needed: number): void {
  if (l.cursorY + needed > l.pageHeight - PAGE.marginBottom) addPage(l);
}

function addPage(l: Layout): void {
  l.pdf.addPage();
  l.cursorY = PAGE.marginTop;
}

function paintRunningHeaderFooter(l: Layout): void {
  const total = l.pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    l.pdf.setPage(page);
    if (page > 1) {
      l.pdf.setFont('helvetica', 'bold');
      l.pdf.setFontSize(8);
      l.pdf.setTextColor(...COLOR.muted);
      l.pdf.text(l.model.title, PAGE.marginX, 12);
      l.pdf.setDrawColor(...COLOR.line);
      l.pdf.setLineWidth(0.2);
      l.pdf.line(PAGE.marginX, 14, l.pageWidth - PAGE.marginX, 14);
    }
    l.pdf.setFont('helvetica', 'normal');
    l.pdf.setFontSize(8);
    l.pdf.setTextColor(...COLOR.muted);
    l.pdf.text(`Gerado em ${l.generatedAt}`, PAGE.marginX, l.pageHeight - 8);
    const label = `Página ${page} de ${total}`;
    l.pdf.text(label, l.pageWidth - PAGE.marginX - l.pdf.getTextWidth(label), l.pageHeight - 8);
  }
}

function groupTitle(model: ReportModel, groupId: string): string {
  return model.groups.find((g) => g.id === groupId)?.title ?? groupId;
}

function truncate(l: Layout, text: string, maxWidth: number): string {
  if (l.pdf.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && l.pdf.getTextWidth(`${truncated}…`) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function formatGeneratedAt(): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
}
