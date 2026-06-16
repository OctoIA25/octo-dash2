/** Cartões de resumo do dashboard de metas. Visual simples e legível. */

import { Target, CheckCircle2, Clock, AlertTriangle, Gauge } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { GoalsSummary } from '../domain/metrics';

interface SummaryCard {
  key: keyof GoalsSummary;
  label: string;
  icon: typeof Target;
  iconClass: string;
  format?: (value: number) => string;
}

const CARDS: SummaryCard[] = [
  { key: 'total', label: 'Total de metas', icon: Target, iconClass: 'text-slate-500' },
  { key: 'completed', label: 'Concluídas', icon: CheckCircle2, iconClass: 'text-emerald-500' },
  { key: 'onTrack', label: 'Em andamento', icon: Clock, iconClass: 'text-sky-500' },
  { key: 'late', label: 'Atrasadas', icon: AlertTriangle, iconClass: 'text-rose-500' },
  {
    key: 'averageAttainment',
    label: 'Atingimento médio',
    icon: Gauge,
    iconClass: 'text-violet-500',
    format: (value) => `${value}%`,
  },
];

export function GoalsSummaryCards({ summary }: { summary: GoalsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = summary[card.key];
        return (
          <Card key={card.key}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                <Icon className={`w-4 h-4 ${card.iconClass}`} />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {card.format ? card.format(value) : value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
