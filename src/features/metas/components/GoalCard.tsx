/** Cartão de uma meta na listagem: identidade + progresso + ações. */

import { format, parseISO } from 'date-fns';
import { MoreVertical, Pencil, History, Power, Trash2, CalendarDays, User, Star, StarOff, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatGoalValue, formatPercent } from '../domain/format';
import type { GoalView } from '../domain/metrics';
import { getModelStrategy } from '../domain/models';
import { GOAL_MODEL_VIEWS } from './GoalModelViews';
import { accentClasses, STATUS_META } from './styleMaps';

interface Props {
  view: GoalView;
  canManage: boolean;
  onEdit: (view: GoalView) => void;
  onToggleStatus: (view: GoalView) => void;
  onToggleFeatured: (view: GoalView) => void;
  onDelete: (view: GoalView) => void;
  onViewHistory: (view: GoalView) => void;
}

function formatDate(value: string): string {
  try {
    return format(parseISO(value), 'dd/MM/yyyy');
  } catch {
    return value;
  }
}

export function GoalCard({
  view,
  canManage,
  onEdit,
  onToggleStatus,
  onToggleFeatured,
  onDelete,
  onViewHistory,
}: Props) {
  const { goal, progress, status, category } = view;
  const accent = accentClasses(category.accent);
  const statusMeta = STATUS_META[status];
  const Icon = category.icon;
  const Extra = GOAL_MODEL_VIEWS[goal.model].Extra;
  const modelLabel = getModelStrategy(goal.model).label;
  const isInactive = goal.status === 'inactive';
  const isAuto = goal.source === 'crm';
  const canFeature = goal.scope === 'team';

  return (
    <Card className={cn('overflow-hidden transition-opacity', isInactive && 'opacity-70')}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('flex items-center justify-center w-10 h-10 rounded-lg shrink-0', accent.iconBg)}>
            <Icon className={cn('w-5 h-5', accent.iconText)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {goal.isFeatured && (
                <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" aria-label="Meta destacada" />
              )}
              <h3 className="font-semibold text-foreground truncate">{goal.name}</h3>
              <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', statusMeta.badge)}>
                {statusMeta.label}
              </span>
              {isAuto && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <RefreshCw className="w-3 h-3" /> Auto
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {category.label} · {modelLabel}
            </p>
          </div>

          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Ações da meta">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(view)}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleStatus(view)}>
                  <Power className="w-4 h-4 mr-2" /> {isInactive ? 'Ativar' : 'Desativar'}
                </DropdownMenuItem>
                {canFeature && (
                  <DropdownMenuItem onClick={() => onToggleFeatured(view)}>
                    {goal.isFeatured ? (
                      <>
                        <StarOff className="w-4 h-4 mr-2" /> Remover destaque
                      </>
                    ) : (
                      <>
                        <Star className="w-4 h-4 mr-2" /> Destacar na tela inicial
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onViewHistory(view)}>
                  <History className="w-4 h-4 mr-2" /> Histórico
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(view)} className="text-rose-600 focus:text-rose-600">
                  <Trash2 className="w-4 h-4 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {goal.description && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{goal.description}</p>
        )}

        {/* Barra de progresso principal */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">
              {formatGoalValue(progress.currentValue, goal.unit)} / {formatGoalValue(progress.targetValue, goal.unit)}
            </span>
            <span className="font-semibold tabular-nums">{formatPercent(progress.percent)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', accent.bar)}
              style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
            />
          </div>
        </div>

        {/* Visualização específica do modelo (níveis/marcos) */}
        <Extra view={view} />

        {/* Rodapé: responsável + período */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1 min-w-0">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{goal.ownerName || 'Sem responsável'}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <CalendarDays className="w-3.5 h-3.5" />
            {formatDate(goal.startDate)} – {formatDate(goal.endDate)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
