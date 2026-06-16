/** Barra de filtros das metas. Opções vêm dos registries (extensível). */

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GOAL_CATEGORIES } from '../domain/categories';
import { GOAL_MODELS } from '../domain/models';
import type { GoalFilters } from '../domain/metrics';
import type { GoalProgressStatus } from '../domain/types';
import { STATUS_META } from './styleMaps';

const STATUS_OPTIONS: GoalProgressStatus[] = ['completed', 'on_track', 'late', 'inactive'];

interface Props {
  filters: GoalFilters;
  onChange: (patch: Partial<GoalFilters>) => void;
}

export function GoalsFilters({ filters, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="Buscar por nome, responsável..."
          className="pl-9"
        />
      </div>

      <Select value={filters.categoryId} onValueChange={(value) => onChange({ categoryId: value })}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {GOAL_CATEGORIES.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.model} onValueChange={(value) => onChange({ model: value as GoalFilters['model'] })}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Modelo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os modelos</SelectItem>
          {GOAL_MODELS.map((model) => (
            <SelectItem key={model.model} value={model.model}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(value) => onChange({ status: value as GoalFilters['status'] })}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          {STATUS_OPTIONS.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_META[status].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
