/**
 * TaskManager - Sistema Kanban Semanal de Tarefas
 * Substituído pelo novo sistema Kanban com dias da semana
 */

import { KanbanSemanalTarefas } from '@/components/KanbanSemanalTarefas';

interface TaskManagerProps {
  isWeekView?: boolean;
}

export const TaskManager = ({ isWeekView = false }: TaskManagerProps) => {
  // O novo sistema Kanban semanal já inclui toda a funcionalidade
  // O parâmetro isWeekView é mantido para compatibilidade
  return <KanbanSemanalTarefas />;
};


