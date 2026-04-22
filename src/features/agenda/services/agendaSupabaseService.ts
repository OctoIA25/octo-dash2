/**
 * 🗓️ AGENDA SUPABASE SERVICE
 * Serviço para sincronizar eventos da agenda com Supabase via MCP
 */

interface AgendaEventoSupabase {
  id?: string;
  corretor_email: string;
  corretor_id?: string;
  titulo: string;
  descricao?: string;
  data: string; // YYYY-MM-DD format
  horario?: string; // HH:MM format
  tipo: 'visita_agendada' | 'visita_realizada' | 'visita_nao_realizada' | 'retornar_cliente' | 'reuniao' | 'tarefa' | 'outro';
  status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado';
  prioridade?: 'alta' | 'media' | 'baixa';
  recorrencia?: 'nenhuma' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'anual';
  lead_id?: number; // ID do lead vinculado (bolsão)
  lead_nome?: string;
  lead_telefone?: string;
  imovel_ref?: string;
  imovel_titulo?: string;
  created_at?: string;
  updated_at?: string;
}

// Converter evento local para formato Supabase
export function eventoToSupabase(evento: any, corretorEmail: string, corretorId?: string): AgendaEventoSupabase {
  return {
    corretor_email: corretorEmail,
    corretor_id: corretorId,
    titulo: evento.titulo,
    descricao: evento.descricao,
    data: evento.data instanceof Date ? evento.data.toISOString().split('T')[0] : evento.data.split('T')[0],
    horario: evento.horario,
    tipo: evento.tipo,
    status: evento.status,
    prioridade: evento.prioridade,
    recorrencia: evento.recorrencia,
    lead_id: evento.leadId,
    lead_nome: evento.leadNome,
    lead_telefone: evento.leadTelefone,
    imovel_ref: evento.imovelRef,
    imovel_titulo: evento.imovelTitulo
  };
}

// Converter evento Supabase para formato local
export function supabaseToEvento(eventoSupabase: AgendaEventoSupabase): any {
  return {
    id: eventoSupabase.id,
    titulo: eventoSupabase.titulo,
    descricao: eventoSupabase.descricao,
    data: new Date(eventoSupabase.data + 'T12:00:00'),
    horario: eventoSupabase.horario,
    tipo: eventoSupabase.tipo,
    status: eventoSupabase.status,
    prioridade: eventoSupabase.prioridade,
    recorrencia: eventoSupabase.recorrencia,
    leadId: eventoSupabase.lead_id,
    leadNome: eventoSupabase.lead_nome,
    leadTelefone: eventoSupabase.lead_telefone,
    imovelRef: eventoSupabase.imovel_ref,
    imovelTitulo: eventoSupabase.imovel_titulo
  };
}

// MCP Service Functions (desativadas)
export const AgendaSupabaseService = {
  // Buscar todos os eventos do corretor
  async buscarEventos(corretorEmail: string): Promise<any[]> {
    console.warn('⚠️ AgendaSupabaseService: Supabase removido.');
    return [];
  },

  // Criar novo evento
  async criarEvento(evento: any, corretorEmail: string, corretorId?: string): Promise<string> {
    console.warn('⚠️ AgendaSupabaseService: Supabase removido.');
    throw new Error('AgendaSupabaseService desativado');
  },

  // Atualizar evento existente
  async atualizarEvento(eventoId: string, evento: any, corretorEmail: string): Promise<void> {
    console.warn('⚠️ AgendaSupabaseService: Supabase removido.');
    throw new Error('AgendaSupabaseService desativado');
  },

  // Excluir evento
  async excluirEvento(eventoId: string, corretorEmail: string): Promise<void> {
    console.warn('⚠️ AgendaSupabaseService: Supabase removido.');
    throw new Error('AgendaSupabaseService desativado');
  }
};

export const AgendaQueries = {};

export type { AgendaEventoSupabase };
