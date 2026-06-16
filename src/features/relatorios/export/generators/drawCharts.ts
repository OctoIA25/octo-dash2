/**
 * Renderização VETORIAL de gráficos no PDF (jsPDF), a partir dos dados do
 * `ChartSection`. Sem imagens/screenshots — barras, barras horizontais e
 * doughnut são desenhados nativamente, com eixos, grade, legenda e rótulos.
 */

import type { ChartSection, ChartSeries, ValueFormat } from '../types';
import { seriesColor, parseColor, BRAND_PALETTE, type RGB } from '../color';

type Doc = import('jspdf').jsPDF;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GRID: RGB = [233, 236, 240];
const AXIS: RGB = [203, 210, 219];
const TEXT: RGB = [55, 65, 81];
const MUTED: RGB = [120, 128, 140];

const MAX_VBARS = 12;
const MAX_HBARS = 16;
const MAX_LEGEND = 12;

/** Altura estimada (mm) do bloco do gráfico — usada para paginação sem órfãos. */
export function chartBlockHeight(section: ChartSection): number {
  if (section.chartType === 'horizontalBar') {
    const n = Math.min(section.labels.length, MAX_HBARS);
    return 8 + n * 7.2;
  }
  if (section.chartType === 'doughnut') {
    const n = Math.min(section.labels.length, MAX_LEGEND);
    return Math.max(58, 14 + n * 5.2);
  }
  return 64;
}

export function drawChart(pdf: Doc, box: Box, section: ChartSection): void {
  switch (section.chartType) {
    case 'horizontalBar':
      drawHorizontalBars(pdf, box, section);
      break;
    case 'doughnut':
      drawDoughnut(pdf, box, section);
      break;
    case 'stackedBar':
      drawVerticalBars(pdf, box, section, true);
      break;
    default:
      drawVerticalBars(pdf, box, section, false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Barras verticais (agrupadas ou empilhadas)
// ─────────────────────────────────────────────────────────────────────────────

function drawVerticalBars(pdf: Doc, box: Box, section: ChartSection, stacked: boolean): void {
  const labels = section.labels.slice(0, MAX_VBARS);
  const series = section.series.map((s) => ({ ...s, data: s.data.slice(0, MAX_VBARS) }));
  const multi = series.length > 1;

  const legendH = multi ? drawLegend(pdf, box, series) : 0;
  const padLeft = 16;
  const padRight = 4;
  const rotate = labels.length > 6 || labels.some((l) => l.length > 6);
  const padBottom = rotate ? 18 : 8;

  const plotX = box.x + padLeft;
  const plotTop = box.y + legendH + 2;
  const plotW = box.w - padLeft - padRight;
  const plotBottom = box.y + box.h - padBottom;
  const plotH = plotBottom - plotTop;
  if (plotH <= 0 || plotW <= 0) return;

  const maxVal = niceCeil(
    stacked
      ? Math.max(0, ...labels.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0)))
      : Math.max(0, ...series.flatMap((s) => s.data)),
  );

  drawYAxis(pdf, plotX, plotTop, plotW, plotH, maxVal, section.valueFormat);

  const n = labels.length || 1;
  const slot = plotW / n;

  labels.forEach((label, i) => {
    const cx = plotX + slot * (i + 0.5);

    if (stacked) {
      const bw = Math.min(slot * 0.6, 18);
      let yTop = plotBottom;
      series.forEach((s, si) => {
        const val = s.data[i] || 0;
        const hgt = (val / maxVal) * plotH;
        if (hgt > 0) {
          setFill(pdf, seriesColor(s.color, si));
          pdf.rect(cx - bw / 2, yTop - hgt, bw, hgt, 'F');
          yTop -= hgt;
        }
      });
    } else {
      const count = series.length;
      const groupW = Math.min(slot * 0.7, count * 22); // evita barras gigantes com poucas categorias
      const bw = groupW / count;
      series.forEach((s, si) => {
        const val = s.data[i] || 0;
        const hgt = (val / maxVal) * plotH;
        const x = cx - groupW / 2 + si * bw;
        setFill(pdf, seriesColor(s.color, si));
        roundedBarTop(pdf, x + bw * 0.04, plotBottom - hgt, bw * 0.92, hgt);
      });
    }

    drawXLabel(pdf, label, cx, plotBottom + 3, rotate, slot);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Barras horizontais (rankings / breakdowns)
// ─────────────────────────────────────────────────────────────────────────────

function drawHorizontalBars(pdf: Doc, box: Box, section: ChartSection): void {
  const series = section.series[0];
  if (!series) return;
  const count = Math.min(section.labels.length, MAX_HBARS);
  const labels = section.labels.slice(0, count);
  const data = series.data.slice(0, count);

  const padLeft = 34;
  const valueCol = 18;
  const plotX = box.x + padLeft;
  const plotW = box.w - padLeft - valueCol;
  if (plotW <= 0) return;

  const rowH = Math.min((box.h - 2) / Math.max(count, 1), 8);
  const barH = rowH * 0.62;
  const maxVal = niceCeil(Math.max(0, ...data));
  const baseColor = parseColor(series.color) ?? BRAND_PALETTE[0];

  labels.forEach((label, i) => {
    const yMid = box.y + rowH * i + rowH / 2;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    setText(pdf, TEXT);
    pdf.text(truncate(pdf, label, padLeft - 3), box.x, yMid + 1.5, { baseline: 'alphabetic' });

    const w = maxVal > 0 ? (data[i] / maxVal) * plotW : 0;
    setFill(pdf, baseColor);
    pdf.roundedRect(plotX, yMid - barH / 2, Math.max(w, 0.4), barH, 0.6, 0.6, 'F');

    pdf.setFontSize(7.5);
    setText(pdf, MUTED);
    pdf.text(formatValue(data[i], section.valueFormat), plotX + w + 1.5, yMid + 1.5);
  });

  if (section.labels.length > count) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    setText(pdf, MUTED);
    pdf.text(`+${section.labels.length - count} itens não exibidos`, box.x, box.y + rowH * count + 3);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Doughnut + legenda
// ─────────────────────────────────────────────────────────────────────────────

function drawDoughnut(pdf: Doc, box: Box, section: ChartSection): void {
  const values = (section.series[0]?.data ?? []).map((v) => Math.max(0, v));
  const total = values.reduce((a, b) => a + b, 0);
  const colors = (section.sliceColors && section.sliceColors.length
    ? section.sliceColors
    : section.labels.map((_, i) => undefined)
  ).map((c, i) => (c ? parseColor(c) : BRAND_PALETTE[i % BRAND_PALETTE.length]));

  const radius = Math.min(box.h / 2 - 2, box.w * 0.22);
  const cx = box.x + radius + 2;
  const cy = box.y + box.h / 2;

  if (total <= 0) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    setText(pdf, MUTED);
    pdf.text('Sem dados.', box.x, cy);
    return;
  }

  let angle = -Math.PI / 2;
  values.forEach((val, i) => {
    const slice = (val / total) * Math.PI * 2;
    if (slice > 0) {
      fillArc(pdf, cx, cy, radius, angle, angle + slice, colors[i]);
      angle += slice;
    }
  });

  // Furo central (doughnut).
  setFill(pdf, [255, 255, 255]);
  pdf.circle(cx, cy, radius * 0.56, 'F');

  // Legenda à direita.
  const legendX = cx + radius + 6;
  const entries = section.labels
    .map((label, i) => ({ label, value: values[i] || 0, color: colors[i] }))
    .slice(0, MAX_LEGEND);
  const lineH = Math.min(5.2, (box.h - 2) / Math.max(entries.length, 1));
  entries.forEach((e, i) => {
    const y = box.y + 2 + i * lineH;
    setFill(pdf, e.color);
    pdf.roundedRect(legendX, y, 2.6, 2.6, 0.4, 0.4, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    setText(pdf, TEXT);
    const pct = Math.round((e.value / total) * 100);
    const text = truncate(pdf, e.label, box.x + box.w - legendX - 16);
    pdf.text(text, legendX + 4, y + 2.4);
    setText(pdf, MUTED);
    pdf.text(`${formatValue(e.value, section.valueFormat)} (${pct}%)`, box.x + box.w, y + 2.4, { align: 'right' });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de eixo / legenda / desenho
// ─────────────────────────────────────────────────────────────────────────────

function drawYAxis(
  pdf: Doc,
  plotX: number,
  plotTop: number,
  plotW: number,
  plotH: number,
  maxVal: number,
  format?: ValueFormat,
): void {
  const steps = 4;
  pdf.setLineWidth(0.15);
  for (let i = 0; i <= steps; i++) {
    const y = plotTop + plotH - (i / steps) * plotH;
    setDraw(pdf, GRID);
    pdf.line(plotX, y, plotX + plotW, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);
    setText(pdf, MUTED);
    pdf.text(formatValue((maxVal * i) / steps, format), plotX - 2, y + 1.2, { align: 'right' });
  }
  setDraw(pdf, AXIS);
  pdf.setLineWidth(0.25);
  pdf.line(plotX, plotTop + plotH, plotX + plotW, plotTop + plotH);
}

function drawLegend(pdf: Doc, box: Box, series: ChartSeries[]): number {
  let x = box.x + 2;
  const y = box.y + 1;
  const right = box.x + box.w;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  for (let i = 0; i < series.length; i++) {
    const name = truncate(pdf, series[i].name || `Série ${i + 1}`, 30);
    const itemW = 6 + pdf.getTextWidth(name) + 4;
    if (x + itemW > right && i > 0) break; // não deixa a legenda vazar
    setFill(pdf, seriesColor(series[i].color, i));
    pdf.roundedRect(x, y, 2.6, 2.6, 0.4, 0.4, 'F');
    setText(pdf, TEXT);
    pdf.text(name, x + 4, y + 2.3);
    x += itemW;
  }
  return 6;
}

function drawXLabel(pdf: Doc, label: string, cx: number, y: number, rotate: boolean, slot: number): void {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.8);
  setText(pdf, MUTED);
  if (rotate) {
    pdf.text(truncate(pdf, label, 24), cx, y, { angle: 45, align: 'right' });
  } else {
    pdf.text(truncate(pdf, label, slot - 1), cx, y + 1.5, { align: 'center' });
  }
}

/** Preenche um setor circular aproximando o arco por leque de triângulos. */
function fillArc(pdf: Doc, cx: number, cy: number, r: number, start: number, end: number, color: RGB): void {
  setFill(pdf, color);
  const segments = Math.max(2, Math.ceil(((end - start) / (Math.PI * 2)) * 72));
  const step = (end - start) / segments;
  for (let i = 0; i < segments; i++) {
    const a1 = start + i * step;
    const a2 = a1 + step;
    pdf.triangle(
      cx,
      cy,
      cx + r * Math.cos(a1),
      cy + r * Math.sin(a1),
      cx + r * Math.cos(a2),
      cy + r * Math.sin(a2),
      'F',
    );
  }
}

function roundedBarTop(pdf: Doc, x: number, y: number, w: number, h: number): void {
  if (h <= 0) return;
  const r = Math.min(0.8, w / 2, h);
  pdf.roundedRect(x, y, w, h, r, r, 'F');
}

function setFill(pdf: Doc, [r, g, b]: RGB) {
  pdf.setFillColor(r, g, b);
}
function setDraw(pdf: Doc, [r, g, b]: RGB) {
  pdf.setDrawColor(r, g, b);
}
function setText(pdf: Doc, [r, g, b]: RGB) {
  pdf.setTextColor(r, g, b);
}

function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * base;
}

function truncate(pdf: Doc, text: string, maxWidth: number): string {
  const t = String(text ?? '');
  if (maxWidth <= 0) return '';
  if (pdf.getTextWidth(t) <= maxWidth) return t;
  let out = t;
  while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

export function formatValue(v: number, format?: ValueFormat): string {
  if (format === 'percent') return `${trimZero(v)}%`;
  if (format === 'currency') return `R$ ${compact(v)}`;
  return compact(v);
}

function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${trimZero(v / 1e6)}M`;
  if (a >= 1e3) return `${trimZero(v / 1e3)}k`;
  return String(Math.round(v));
}

function trimZero(n: number): string {
  return Number(n.toFixed(1)).toString().replace('.', ',');
}
