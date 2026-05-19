import { supabase } from '@/lib/supabaseClient';

type PrioridadeAgenda = 'alta' | 'media' | 'baixa';
type StatusAgenda = 'pendente' | 'confirmado' | 'concluido' | 'cancelado';

type AgendaEventoTarefaPayload = {
  titulo?: string | null;
  descricao?: string | null;
  data?: string | null;
  horario?: string | null;
  prioridade?: PrioridadeAgenda | null;
  status?: StatusAgenda | string | null;
};

const parseDateInputValue = (dateString: string): Date => {
  return new Date(`${dateString}T12:00:00`);
};

const calcularSemanaAn = (data: Date): number => {
  const year = data.getFullYear();
  const week = Math.max(
    1,
    Math.ceil((data.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))
  );
  return year * 100 + week;
};

const getDiaSemana = (data: Date): number => {
  const day = data.getDay();
  return day === 0 ? 7 : day;
};

export async function sincronizarStatusTarefaSemanalDaAgenda(
  agendaEventoId: string,
  tenantId: string,
  status: StatusAgenda | string
): Promise<void> {
  const concluida = status === 'concluido';
  const updates = {
    concluida,
    data_conclusao: concluida ? new Date().toISOString() : null,
    atualizado_em: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('tarefas_semanais')
    .update(updates)
    .eq('agenda_evento_id', agendaEventoId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('Erro ao sincronizar status da tarefa semanal pela agenda:', error);
  }
}

export async function sincronizarTarefaSemanalDaAgenda(
  agendaEventoId: string,
  tenantId: string,
  evento: AgendaEventoTarefaPayload
): Promise<void> {
  const updates: Record<string, unknown> = {
    atualizado_em: new Date().toISOString(),
  };

  if (typeof evento.titulo === 'string') {
    updates.titulo = evento.titulo;
  }

  if ('descricao' in evento) {
    updates.descricao = evento.descricao || null;
  }

  if (evento.prioridade) {
    updates.prioridade = evento.prioridade;
  }

  if (evento.status) {
    const concluida = evento.status === 'concluido';
    updates.concluida = concluida;
    updates.data_conclusao = concluida ? new Date().toISOString() : null;
  }

  if (evento.data) {
    const data = parseDateInputValue(evento.data);
    updates.data_especifica = evento.data;
    updates.dia_semana = getDiaSemana(data);
    updates.semana_an = calcularSemanaAn(data);
  }

  if ('horario' in evento) {
    const { data: tarefas, error: fetchError } = await supabase
      .from('tarefas_semanais')
      .select('id, dados_recorrencia')
      .eq('agenda_evento_id', agendaEventoId)
      .eq('tenant_id', tenantId);

    if (fetchError) {
      console.error('Erro ao buscar tarefa semanal vinculada ao evento da agenda:', fetchError);
      return;
    }

    await Promise.all((tarefas || []).map(async tarefa => {
      const { error } = await supabase
        .from('tarefas_semanais')
        .update({
          ...updates,
          dados_recorrencia: {
            ...(tarefa.dados_recorrencia || {}),
            horario: evento.horario || null,
          },
        })
        .eq('id', tarefa.id)
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Erro ao sincronizar tarefa semanal vinculada ao evento da agenda:', error);
      }
    }));

    return;
  }

  const { error } = await supabase
    .from('tarefas_semanais')
    .update(updates)
    .eq('agenda_evento_id', agendaEventoId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('Erro ao sincronizar tarefa semanal vinculada ao evento da agenda:', error);
  }
}

export async function removerTarefaSemanalDaAgenda(
  agendaEventoId: string,
  tenantId: string
): Promise<void> {
  const { error } = await supabase
    .from('tarefas_semanais')
    .delete()
    .eq('agenda_evento_id', agendaEventoId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('Erro ao remover tarefa semanal vinculada ao evento da agenda:', error);
  }
}
