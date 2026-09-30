/**
 * Agrupa a caixa por dia do calendário (Hoje, Ontem, Esta semana, Anteriores).
 * Dia do calendário, não "últimas 24 h": às 9h, uma notificação das 23h de
 * ontem é de ontem.
 */
import { differenceInCalendarDays } from 'date-fns';

const ORDEM = ['Hoje', 'Ontem', 'Esta semana', 'Anteriores'] as const;
export type RotuloDoDia = (typeof ORDEM)[number];

export function rotuloDoDia(data: Date, agora: Date): RotuloDoDia {
  const dias = differenceInCalendarDays(agora, data);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) return 'Esta semana';
  return 'Anteriores';
}

export function agruparPorDia<T extends { createdAt: string }>(
  itens: T[],
  agora: Date,
): { rotulo: RotuloDoDia; itens: T[] }[] {
  const grupos = new Map<RotuloDoDia, T[]>();
  for (const item of itens) {
    const rotulo = rotuloDoDia(new Date(item.createdAt), agora);
    grupos.set(rotulo, [...(grupos.get(rotulo) ?? []), item]);
  }
  return ORDEM.filter((r) => grupos.has(r)).map((rotulo) => ({ rotulo, itens: grupos.get(rotulo)! }));
}
