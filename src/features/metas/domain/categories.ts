/**
 * Registry de CATEGORIAS de meta.
 *
 * Categorias são apenas metadados (rótulo, unidade padrão, ícone, cor).
 * Adicionar uma nova categoria = adicionar uma entrada neste array.
 *
 * `resolveCategory` NUNCA retorna undefined: categorias desconhecidas
 * (ex: dados antigos ou criadas em outro lugar) ganham um fallback
 * neutro, garantindo que a UI sempre renderize sem condicionais
 * defensivas espalhadas pelo código.
 */

import { Building2, Coins, TrendingUp, UserPlus, Target, type LucideIcon } from 'lucide-react';
import type { GoalUnit } from './types';

export interface GoalCategoryDefinition {
  id: string;
  label: string;
  description: string;
  defaultUnit: GoalUnit;
  icon: LucideIcon;
  /** Token de cor (Tailwind) usado nos realces visuais. */
  accent: 'emerald' | 'amber' | 'sky' | 'violet' | 'slate' | 'rose';
  /**
   * Se a categoria pode ter o valor realizado calculado automaticamente
   * a partir do CRM. Deve haver uma fonte correspondente em
   * services/metricSources.ts (garantido por teste de consistência).
   */
  supportsAutoSync: boolean;
}

export const GOAL_CATEGORIES: GoalCategoryDefinition[] = [
  {
    id: 'vgv',
    label: 'VGV',
    description: 'Valor Geral de Vendas',
    defaultUnit: 'currency',
    icon: TrendingUp,
    accent: 'emerald',
    supportsAutoSync: true,
  },
  {
    id: 'vgc',
    label: 'VGC',
    description: 'Valor Geral de Comissão',
    defaultUnit: 'currency',
    icon: Coins,
    accent: 'amber',
    // VGC real vem de `commercial_sales.valor_vgc` (sincronização da planilha
    // comercial). Fonte registrada em services/metricSources.ts.
    supportsAutoSync: true,
  },
  {
    id: 'captacao',
    label: 'Captação',
    description: 'Captação de imóveis',
    defaultUnit: 'count',
    icon: Building2,
    accent: 'sky',
    supportsAutoSync: true,
  },
  {
    id: 'recrutamento',
    label: 'Recrutamento',
    description: 'Recrutamento de corretores',
    defaultUnit: 'count',
    icon: UserPlus,
    accent: 'violet',
    supportsAutoSync: true,
  },
];

const CATEGORY_BY_ID = new Map(GOAL_CATEGORIES.map((category) => [category.id, category]));

/** Fallback para categorias não cadastradas no registry. */
function createFallbackCategory(id: string): GoalCategoryDefinition {
  return {
    id,
    label: id,
    description: 'Categoria personalizada',
    defaultUnit: 'count',
    icon: Target,
    accent: 'slate',
    supportsAutoSync: false,
  };
}

export function getCategory(id: string): GoalCategoryDefinition | undefined {
  return CATEGORY_BY_ID.get(id);
}

/** Sempre retorna uma categoria utilizável (registry ou fallback). */
export function resolveCategory(id: string): GoalCategoryDefinition {
  return CATEGORY_BY_ID.get(id) ?? createFallbackCategory(id);
}
