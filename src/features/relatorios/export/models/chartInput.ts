/**
 * Adaptador: converte os objetos de dados do Chart.js (já calculados na página)
 * na estrutura neutra `ChartInput` consumida pelos builders/geradores.
 * Mantém a página desacoplada da camada de exportação.
 */

import type { ChartType, ValueFormat } from '../types';
import type { ChartInput } from './source';

interface ChartJsLike {
  labels?: unknown[];
  datasets?: Array<{ label?: string; data?: unknown[]; backgroundColor?: unknown }>;
}

export function fromChartJs(data: ChartJsLike, chartType: ChartType, valueFormat: ValueFormat = 'number'): ChartInput {
  const labels = (data.labels ?? []).map((l) => String(l));
  const datasets = data.datasets ?? [];

  if (chartType === 'doughnut') {
    const ds = datasets[0];
    const bg = ds?.backgroundColor;
    return {
      chartType,
      labels,
      valueFormat,
      series: [{ name: ds?.label ?? '', data: toNumbers(ds?.data) }],
      sliceColors: Array.isArray(bg) ? bg.map((c) => String(c)) : undefined,
    };
  }

  return {
    chartType,
    labels,
    valueFormat,
    series: datasets.map((ds) => ({
      name: ds.label ?? '',
      data: toNumbers(ds.data),
      color: typeof ds.backgroundColor === 'string' ? ds.backgroundColor : undefined,
    })),
  };
}

function toNumbers(data: unknown[] | undefined): number[] {
  return (data ?? []).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
}
