/**
 * Tokens de APRESENTAÇÃO dos KPIs no painel de gestão (cor/rótulo/ícone por
 * origem; rótulo de unidade). Mantém a UI livre de condicionais espalhadas —
 * mesmo princípio do registry de categorias das Metas.
 *
 * A cor codifica a ORIGEM do dado (informação, não enfeite):
 *  - crm      → sky    (vem do sistema/CRM, calculado)
 *  - manual   → violet (inserido por um humano)
 *  - planilha → emerald(importado de Excel)
 */
import { Cpu, PencilLine, FileSpreadsheet, type LucideIcon } from 'lucide-react';
import type { KpiSource, KpiUnit } from '@/features/kpis/domain/kpiTypes';

export interface SourcePresentation {
  label: string;
  short: string;
  icon: LucideIcon;
  /** Classe da barra/realce (borda esquerda da linha). */
  bar: string;
  /** Classes da pílula de origem (texto + fundo + borda). */
  pill: string;
  /** Cor do ícone no estado normal. */
  dot: string;
}

const SOURCE: Record<KpiSource, SourcePresentation> = {
  crm: {
    label: 'CRM',
    short: 'CRM',
    icon: Cpu,
    bar: 'bg-sky-400',
    pill: 'text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950/40 dark:border-sky-900',
    dot: 'text-sky-500',
  },
  manual: {
    label: 'Manual',
    short: 'Manual',
    icon: PencilLine,
    bar: 'bg-violet-400',
    pill: 'text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950/40 dark:border-violet-900',
    dot: 'text-violet-500',
  },
  planilha: {
    label: 'Planilha',
    short: 'Planilha',
    icon: FileSpreadsheet,
    bar: 'bg-emerald-400',
    pill: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900',
    dot: 'text-emerald-500',
  },
};

/** Sempre retorna uma apresentação (fallback CRM defensivo). */
export function sourcePresentation(source: KpiSource): SourcePresentation {
  return SOURCE[source] ?? SOURCE.crm;
}

const UNIT_LABEL: Record<KpiUnit, string> = {
  count: 'quantidade',
  currency: 'moeda (R$)',
  percent: 'percentual',
};

export function unitLabel(unit: KpiUnit): string {
  return UNIT_LABEL[unit] ?? unit;
}
