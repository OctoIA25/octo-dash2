/**
 * 📅 Serviço de Agenda - DESATIVADO
 * Supabase/banco removido e nenhuma persistência temporária deve ser usada.
 */

export interface AgendaEvento {
  id?: string;
  corretor_email: string;
  corretor_id?: string;
  titulo: string;
  descricao?: string;
  data: string; // YYYY-MM-DD
  horario?: string; // HH:MM
  tipo: 'visita' | 'reuniao' | 'ligacao' | 'tarefa' | 'personalizado';
  status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado';
  prioridade?: 'alta' | 'media' | 'baixa';
  lead_nome?: string;
  lead_telefone?: string;
  local?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Buscar todos os eventos de um corretor
 */
export async function getEventosCorretor(corretorEmail: string): Promise<AgendaEvento[]> {
  
  try {
    console.warn('⚠️ Agenda desativada: retornando lista vazia.');
    return [];
  } catch (error) {
    console.error('❌ Erro ao buscar eventos:', error);
    return [];
  }
}

/**
 * Buscar eventos de um período específico
 */
export async function getEventosPorPeriodo(
  corretorEmail: string,
  dataInicio: string,
  dataFim: string
): Promise<AgendaEvento[]> {
  
  try {
    console.warn('⚠️ Agenda desativada: retornando lista vazia.');
    return [];
  } catch (error) {
    console.error('❌ Erro ao buscar eventos do período:', error);
    return [];
  }
}

/**
 * Criar novo evento
 */
export async function criarEvento(evento: Omit<AgendaEvento, 'id' | 'created_at' | 'updated_at'>): Promise<AgendaEvento | null> {
  
  try {
    console.warn('⚠️ Agenda desativada: evento não será criado.');
    return null;
  } catch (error) {
    console.error('❌ Erro ao criar evento:', error);
    return null;
  }
}

/**
 * Atualizar evento existente
 */
export async function atualizarEvento(
  eventoId: string,
  updates: Partial<Omit<AgendaEvento, 'id' | 'corretor_email' | 'created_at' | 'updated_at'>>
): Promise<AgendaEvento | null> {
  
  try {
    console.warn('⚠️ Agenda desativada: evento não será atualizado.');
    return null;
  } catch (error) {
    console.error('❌ Erro ao atualizar evento:', error);
    return null;
  }
}

/**
 * Deletar evento
 */
export async function deletarEvento(eventoId: string): Promise<boolean> {
  
  try {
    console.warn('⚠️ Agenda desativada: evento não será deletado.');
    return false;
  } catch (error) {
    console.error('❌ Erro ao deletar evento:', error);
    return false;
  }
}

/**
 * Deletar todos os eventos de um corretor (usar com cuidado!)
 */
export async function deletarTodosEventos(corretorEmail: string): Promise<boolean> {
  
  try {
    console.warn('⚠️ Agenda desativada: nenhum evento será deletado.');
    return false;
  } catch (error) {
    console.error('❌ Erro ao deletar todos os eventos:', error);
    return false;
  }
}

/**
 * Atualizar status de um evento
 */
export async function atualizarStatusEvento(
  eventoId: string,
  novoStatus: AgendaEvento['status']
): Promise<AgendaEvento | null> {
  
  return atualizarEvento(eventoId, { status: novoStatus });
}

/**
 * Buscar eventos por tipo
 */
export async function getEventosPorTipo(
  corretorEmail: string,
  tipo: AgendaEvento['tipo']
): Promise<AgendaEvento[]> {
  
  try {
    console.warn('⚠️ Agenda desativada: retornando lista vazia.');
    return [];
  } catch (error) {
    console.error('❌ Erro ao buscar eventos por tipo:', error);
    return [];
  }
}
