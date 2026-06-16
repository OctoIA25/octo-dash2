/**
 * Mapas de estilo (classes Tailwind ESTÁTICAS — necessárias para o purge).
 * Centraliza a tradução de tokens semânticos (accent de categoria, status
 * de progresso) para classes, evitando classes dinâmicas espalhadas.
 */

import type { GoalCategoryDefinition } from '../domain/categories';
import type { GoalProgressStatus } from '../domain/types';

interface AccentClasses {
  iconBg: string;
  iconText: string;
  bar: string;
}

const ACCENT_CLASSES: Record<GoalCategoryDefinition['accent'], AccentClasses> = {
  emerald: { iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconText: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  amber: { iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconText: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  sky: { iconBg: 'bg-sky-100 dark:bg-sky-900/40', iconText: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500' },
  violet: { iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconText: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  rose: { iconBg: 'bg-rose-100 dark:bg-rose-900/40', iconText: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' },
  slate: { iconBg: 'bg-slate-100 dark:bg-slate-800', iconText: 'text-slate-600 dark:text-slate-300', bar: 'bg-slate-500' },
};

export function accentClasses(accent: GoalCategoryDefinition['accent']): AccentClasses {
  return ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.slate;
}

interface StatusMeta {
  label: string;
  badge: string;
  dot: string;
}

export const STATUS_META: Record<GoalProgressStatus, StatusMeta> = {
  completed: {
    label: 'Concluída',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  on_track: {
    label: 'Em andamento',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  late: {
    label: 'Atrasada',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  inactive: {
    label: 'Inativa',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
};
