/** Diálogo de histórico de alterações de uma meta. */

import { format, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGoalHistory } from '../hooks/useGoals';
import type { GoalView } from '../domain/metrics';

interface Props {
  view: GoalView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateTime(value: string): string {
  try {
    return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm");
  } catch {
    return value;
  }
}

export function GoalHistoryDialog({ view, open, onOpenChange }: Props) {
  const { data: history = [], isLoading } = useGoalHistory(open ? view?.goal.id ?? null : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico — {view?.goal.name}</DialogTitle>
          <DialogDescription>Registro de alterações desta meta.</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando histórico...</p>}

          {!isLoading && history.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
          )}

          <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-4">
            {history.map((entry) => (
              <li key={entry.id} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
                <p className="text-sm font-medium text-foreground">{entry.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                  {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
