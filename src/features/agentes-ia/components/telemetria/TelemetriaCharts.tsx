/**
 * Gráficos da página de Telemetria de Agentes (T5) — SVG próprio, sem Recharts.
 *
 * POR QUÊ: no Recharts 3.2.1 deste repo, os ticks dos eixos e o Tooltip não
 * renderizam (sintoma verificado ao vivo nesta página; a memória do projeto
 * já registrava o problema dos ticks — os KPIs contornaram com LabelList).
 * Nota de linhagem: o CSS global que sabotava gráficos foi corrigido em
 * b33c34b e NÃO é a causa aqui — o bug remanescente é dos ticks/Tooltip
 * nativos do Recharts 3, nunca corrigido, só contornado (LabelList nos KPIs).
 * Para série temporal isso não basta: sem eixo e sem hover o gráfico não
 * cumpre a leitura. Este kit desenha bars/linhas/eixos/crosshair/tooltip em
 * SVG+HTML puro — ~200 linhas com controle total, em vez de lutar com a lib.
 *
 * Paleta VALIDADA (script do skill de dataviz, light #fff e dark #0f172a):
 *   série principal #2563eb (azul) · erros #dc2626 (status, reservado)
 *   latência: média #2563eb · P95 #d97706 (âmbar) — azul+violeta REPROVOU
 *   (ΔE 0,4 no deutan); não trocar sem revalidar.
 * Identidade nunca só por cor: legenda + tooltip nomeiam as séries.
 */
import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import type {
  TelemetryTimeseriesPoint,
  TelemetryAgentRow,
} from '../../services/telemetryDashboardService';
import { fmtMs } from '../../services/telemetryDashboardService';

export const SERIES_BLUE = '#2563eb';
export const SERIES_ERROR_RED = '#dc2626';
export const SERIES_AMBER = '#d97706';

const H = 240;
const PAD = { top: 12, right: 12, bottom: 26, left: 44 };
const AXIS_TEXT = 'fill-slate-500 dark:fill-slate-400';
const GRID_STROKE = 'stroke-slate-200 dark:stroke-slate-700';

/** Largura real do container (SVG não pode escalar texto junto). */
function useElementWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const fmtBucket = (iso: string, bucket: 'hour' | 'day'): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return bucket === 'hour'
    ? `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.getHours()}h`
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/** "Nice" max p/ o eixo (1/2/5 × 10^n) — evita teto quebrado tipo 37. */
function niceMax(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/**
 * Geometria comum dos 3 gráficos: um slot por item, x no centro do slot,
 * y invertido (0 embaixo) na escala 0..max. Fonte única do modelo de padding.
 */
function chartScale(width: number, count: number, max: number) {
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const slot = count > 0 ? innerW / count : innerW;
  return {
    slot,
    xFor: (i: number) => PAD.left + slot * i + slot / 2,
    yFor: (v: number) => PAD.top + innerH * (1 - v / max),
  };
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  rows: Array<{ name: string; value: string; color?: string }>;
}

function HoverTooltip({ t }: { t: TooltipState }) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-md"
      style={{ left: t.x, top: t.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
    >
      <p className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.title}</p>
      {t.rows.map((r) => (
        <p key={r.name} className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums flex items-center gap-1.5 whitespace-nowrap">
          {r.color && <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />}
          <span className="text-slate-500 dark:text-slate-400 font-medium">{r.name}:</span> {r.value}
        </p>
      ))}
    </div>
  );
}

function LegendRow({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex items-center justify-center gap-4 mt-1.5">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Régua comum: escala Y (0..niceMax) + gridlines + labels do eixo. */
function YAxisLayer({ width, max, fmt }: { width: number; max: number; fmt: (v: number) => string }) {
  const innerH = H - PAD.top - PAD.bottom;
  const yFor = (v: number) => PAD.top + innerH * (1 - v / max);
  const steps = [0, max / 2, max];
  return (
    <g>
      {steps.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={width - PAD.right} y1={yFor(v)} y2={yFor(v)} className={GRID_STROKE} strokeDasharray="3 3" strokeOpacity={0.7} />
          <text x={PAD.left - 8} y={yFor(v) + 3.5} textAnchor="end" fontSize={10.5} fontWeight={500} className={AXIS_TEXT}>
            {fmt(v)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Labels do eixo X: primeiro, ~1/4, meio, ~3/4 e último bucket. */
function XAxisLabels({ labels, xFor, width }: { labels: string[]; xFor: (i: number) => number; width: number }) {
  const n = labels.length;
  const picks = n <= 5 ? labels.map((_, i) => i) : [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1];
  return (
    <g>
      <line x1={PAD.left} x2={width - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className={GRID_STROKE} />
      {[...new Set(picks)].map((i) => (
        <text key={i} x={xFor(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fontWeight={500} className={AXIS_TEXT}>
          {labels[i]}
        </text>
      ))}
    </g>
  );
}

/** Execuções (barras azuis) + erros (linha vermelha) — mesma unidade, um eixo. */
export function TelemetryTrendChart({ points, bucket }: { points: TelemetryTimeseriesPoint[]; bucket: 'hour' | 'day' }) {
  const [ref, width] = useElementWidth();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const labels = useMemo(() => points.map((p) => fmtBucket(p.bucket, bucket)), [points, bucket]);
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.events, p.errors)), 1));

  const { slot, xFor, yFor } = chartScale(width, points.length, max);
  const barW = Math.max(3, Math.min(28, slot * 0.62));

  const hover = (clientX: number, target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    const i = Math.min(points.length - 1, Math.max(0, Math.round((clientX - rect.left - PAD.left - slot / 2) / slot)));
    const p = points[i];
    if (!p) return;
    setTip({
      x: xFor(i),
      y: yFor(Math.max(p.events, p.errors)),
      title: labels[i],
      rows: [
        { name: 'Execuções', value: p.events.toLocaleString('pt-BR'), color: SERIES_BLUE },
        { name: 'Erros', value: p.errors.toLocaleString('pt-BR'), color: SERIES_ERROR_RED },
      ],
    });
  };

  return (
    <div ref={ref} className="relative" role="img" aria-label="Execuções e erros por período"
      onMouseMove={(e) => hover(e.clientX, e.currentTarget)} onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={H} style={{ display: 'block' }}>
          <YAxisLayer width={width} max={max} fmt={(v) => v.toLocaleString('pt-BR')} />
          {points.map((p, i) => (
            <rect key={p.bucket} x={xFor(i) - barW / 2} y={yFor(p.events)} width={barW}
              height={Math.max(0, H - PAD.bottom - yFor(p.events))} rx={2} fill={SERIES_BLUE} />
          ))}
          <polyline fill="none" stroke={SERIES_ERROR_RED} strokeWidth={2}
            points={points.map((p, i) => `${xFor(i)},${yFor(p.errors)}`).join(' ')} />
          {tip && <line x1={tip.x} x2={tip.x} y1={PAD.top} y2={H - PAD.bottom} className="stroke-slate-300 dark:stroke-slate-600" />}
          <XAxisLabels labels={labels} xFor={xFor} width={width} />
        </svg>
      )}
      {tip && <HoverTooltip t={tip} />}
      <LegendRow items={[{ label: 'Execuções', color: SERIES_BLUE }, { label: 'Erros', color: SERIES_ERROR_RED }]} />
    </div>
  );
}

/** Latência média + P95 (mesma unidade ms, um eixo). */
export function TelemetryLatencyChart({ points, bucket }: { points: TelemetryTimeseriesPoint[]; bucket: 'hour' | 'day' }) {
  const [ref, width] = useElementWidth();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const labels = useMemo(() => points.map((p) => fmtBucket(p.bucket, bucket)), [points, bucket]);
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.avg_duration_ms ?? 0, p.p95_duration_ms ?? 0)), 1));

  const { slot, xFor, yFor } = chartScale(width, points.length, max);
  const linePoints = (key: 'avg_duration_ms' | 'p95_duration_ms') =>
    points
      .map((p, i) => (p[key] == null ? null : `${xFor(i)},${yFor(p[key] as number)}`))
      .filter(Boolean)
      .join(' ');

  const hover = (clientX: number, target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    const i = Math.min(points.length - 1, Math.max(0, Math.round((clientX - rect.left - PAD.left - slot / 2) / slot)));
    const p = points[i];
    if (!p) return;
    setTip({
      x: xFor(i),
      y: yFor(Math.max(p.avg_duration_ms ?? 0, p.p95_duration_ms ?? 0)),
      title: labels[i],
      rows: [
        { name: 'Média', value: fmtMs(p.avg_duration_ms), color: SERIES_BLUE },
        { name: 'P95', value: fmtMs(p.p95_duration_ms), color: SERIES_AMBER },
      ],
    });
  };

  return (
    <div ref={ref} className="relative" role="img" aria-label="Latência média e P95 por período"
      onMouseMove={(e) => hover(e.clientX, e.currentTarget)} onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={H} style={{ display: 'block' }}>
          <YAxisLayer width={width} max={max} fmt={(v) => fmtMs(v)} />
          <polyline fill="none" stroke={SERIES_BLUE} strokeWidth={2} points={linePoints('avg_duration_ms')} />
          <polyline fill="none" stroke={SERIES_AMBER} strokeWidth={2} points={linePoints('p95_duration_ms')} />
          {tip && <line x1={tip.x} x2={tip.x} y1={PAD.top} y2={H - PAD.bottom} className="stroke-slate-300 dark:stroke-slate-600" />}
          <XAxisLabels labels={labels} xFor={xFor} width={width} />
        </svg>
      )}
      {tip && <HoverTooltip t={tip} />}
      <LegendRow items={[{ label: 'Média', color: SERIES_BLUE }, { label: 'P95', color: SERIES_AMBER }]} />
    </div>
  );
}

/** Execuções por agente — magnitude, um matiz; valor sobre a barra, agente embaixo. */
export function TelemetryAgentBars({ rows }: { rows: TelemetryAgentRow[] }) {
  const [ref, width] = useElementWidth();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const max = niceMax(Math.max(...rows.map((r) => r.events), 1));

  const { slot, xFor, yFor } = chartScale(width, rows.length, max);
  const barW = Math.max(10, Math.min(56, slot * 0.55));

  return (
    <div ref={ref} className="relative" role="img" aria-label="Execuções por agente" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={H} style={{ display: 'block' }}>
          <YAxisLayer width={width} max={max} fmt={(v) => v.toLocaleString('pt-BR')} />
          {rows.map((r, i) => (
            <g key={r.agent_slug}
              onMouseEnter={() =>
                setTip({
                  x: xFor(i), y: yFor(r.events), title: r.agent_slug,
                  rows: [
                    { name: 'Execuções', value: r.events.toLocaleString('pt-BR'), color: SERIES_BLUE },
                    { name: 'Erros', value: r.errors.toLocaleString('pt-BR'), color: SERIES_ERROR_RED },
                    { name: 'Latência média', value: fmtMs(r.avg_duration_ms) },
                  ],
                })}
            >
              <rect x={xFor(i) - barW / 2} y={yFor(r.events)} width={barW}
                height={Math.max(0, H - PAD.bottom - yFor(r.events))} rx={2} fill={SERIES_BLUE} />
              <text x={xFor(i)} y={yFor(r.events) - 7} textAnchor="middle" fontSize={12} fontWeight={700}
                className="fill-slate-700 dark:fill-slate-200">
                {r.events.toLocaleString('pt-BR')}
              </text>
              <text x={xFor(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fontWeight={500} className={AXIS_TEXT}>
                {r.agent_slug}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={width - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className={GRID_STROKE} />
        </svg>
      )}
      {tip && <HoverTooltip t={tip} />}
    </div>
  );
}
