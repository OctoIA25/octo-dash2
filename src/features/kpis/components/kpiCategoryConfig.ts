/**
 * Metadados de apresentação das categorias de KPI: ordem, título, ícone e a
 * cor-assinatura. Centralizado para a página, o índice e as seções lerem a
 * mesma fonte. A cor aparece em pontos calibrados (faixa do cabeçalho, número
 * e borda do card hero) — os cards compactos permanecem neutros (slate).
 */
import { TrendingUp, Megaphone, Building2, Users, LayoutGrid, type LucideIcon } from 'lucide-react';

/**
 * Cor-assinatura de uma categoria, espalhada por alguns poucos pontos calibrados
 * para dar identidade sem colorir os cards inteiros:
 *  - `headerBg`/`headerText`/`headerIcon`: a faixa tonal (clara) do cabeçalho;
 *  - `heroValue`: a cor do número grande do card hero (o destaque da seção);
 *  - `heroBorder`: a borda esquerda discreta do card hero.
 *
 * São strings de classe LITERAIS (não concatenadas) — o purge do Tailwind só
 * mantém classes que aparecem inteiras no código-fonte.
 */
export interface CategoryColor {
  headerBg: string;
  headerText: string;
  headerIcon: string;
  heroValue: string;
  heroBorder: string;
}

export interface CategoryMeta {
  title: string;
  icon: LucideIcon;
  color: CategoryColor;
}

/** Ordem canônica das seções na Home. */
export const CATEGORY_ORDER = ['comercial', 'marketing', 'operacao', 'equipe', 'geral'] as const;

export type CategoryId = (typeof CATEGORY_ORDER)[number];

// Keyed pela união literal: o compilador acusa se CATEGORY_ORDER e CATEGORY_META
// divergirem (chave faltando/sobrando), eliminando o risco de `undefined` em runtime.
export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  comercial: {
    title: 'Comercial', icon: TrendingUp,
    color: {
      headerBg: 'bg-emerald-50 dark:bg-emerald-950/30',
      headerText: 'text-emerald-700 dark:text-emerald-300',
      headerIcon: 'text-emerald-600 dark:text-emerald-400',
      heroValue: 'text-emerald-700 dark:text-emerald-300',
      heroBorder: 'border-l-emerald-400 dark:border-l-emerald-600',
    },
  },
  marketing: {
    title: 'Marketing', icon: Megaphone,
    color: {
      headerBg: 'bg-violet-50 dark:bg-violet-950/30',
      headerText: 'text-violet-700 dark:text-violet-300',
      headerIcon: 'text-violet-600 dark:text-violet-400',
      heroValue: 'text-violet-700 dark:text-violet-300',
      heroBorder: 'border-l-violet-400 dark:border-l-violet-600',
    },
  },
  operacao: {
    title: 'Operação', icon: Building2,
    color: {
      headerBg: 'bg-amber-50 dark:bg-amber-950/30',
      headerText: 'text-amber-700 dark:text-amber-300',
      headerIcon: 'text-amber-600 dark:text-amber-400',
      heroValue: 'text-amber-700 dark:text-amber-300',
      heroBorder: 'border-l-amber-400 dark:border-l-amber-600',
    },
  },
  equipe: {
    title: 'Equipe', icon: Users,
    color: {
      headerBg: 'bg-sky-50 dark:bg-sky-950/30',
      headerText: 'text-sky-700 dark:text-sky-300',
      headerIcon: 'text-sky-600 dark:text-sky-400',
      heroValue: 'text-sky-700 dark:text-sky-300',
      heroBorder: 'border-l-sky-400 dark:border-l-sky-600',
    },
  },
  geral: {
    title: 'Geral', icon: LayoutGrid,
    color: {
      headerBg: 'bg-slate-100 dark:bg-slate-800/50',
      headerText: 'text-slate-700 dark:text-slate-300',
      headerIcon: 'text-slate-500 dark:text-slate-400',
      heroValue: 'text-slate-900 dark:text-slate-100',
      heroBorder: 'border-l-slate-300 dark:border-l-slate-600',
    },
  },
};
