/**
 * Serviço de Tarefas / OKRs
 * Tabela: public.tarefas (multi-tenant, RLS ativo)
 */

import { supabase } from '@/integrations/supabase/client';
import type { Tarefa, PrioridadeTarefa } from '@/hooks/useTarefas';

export interface TarefaRow {
  id: string;
  tenant_id: string;
  assignee_user_id: string;
  assignee_email: string | null;
  titulo: string;
  descricao: string | null;
  prioridade: PrioridadeTarefa;
  categoria: string;
  tipo: 'tarefa' | 'okr';
  data_vencimento: string | null;
  data_conclusao: string | null;
  concluida: boolean;
  ordem: number;
  tags: string[] | null;
  criador_user_id: string | null;
  criador_email: string | null;
  criador_nome: string | null;
  atribuida_por_admin: boolean;
  editavel_por_corretor: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToTarefa(row: TarefaRow): Tarefa {
  return {
    id: row.id as unknown as number,
    corretor_email: row.assignee_email ?? '',
    titulo: row.titulo,
    descricao: row.descricao ?? undefined,
    concluida: row.concluida,
    prioridade: row.prioridade,
    categoria: row.categoria,
    data_vencimento: row.data_vencimento ?? undefined,
    data_conclusao: row.data_conclusao ?? undefined,
    tags: row.tags ?? undefined,
    ordem: row.ordem,
    criador_email: row.criador_email ?? undefined,
    criador_nome: row.criador_nome ?? undefined,
    atribuida_por_admin: row.atribuida_por_admin,
    editavel_por_corretor: row.editavel_por_corretor,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchTarefasByTenant(tenantId: string): Promise<Tarefa[]> {
  const { data, error } = await (supabase as any)
    .from('tarefas')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar tarefas (tenant):', error);
    return [];
  }
  return ((data ?? []) as TarefaRow[]).map(rowToTarefa);
}

export async function fetchTarefasByAssignee(tenantId: string, userId: string): Promise<Tarefa[]> {
  const { data, error } = await (supabase as any)
    .from('tarefas')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('assignee_user_id', userId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar tarefas (assignee):', error);
    return [];
  }
  return ((data ?? []) as TarefaRow[]).map(rowToTarefa);
}

export interface CreateTarefaInput {
  tenant_id: string;
  assignee_user_id: string;
  assignee_email?: string | null;
  titulo: string;
  descricao?: string | null;
  prioridade?: PrioridadeTarefa;
  categoria?: string;
  tipo?: 'tarefa' | 'okr';
  data_vencimento?: string | null;
  ordem?: number;
  tags?: string[] | null;
  criador_user_id?: string | null;
  criador_email?: string | null;
  criador_nome?: string | null;
  atribuida_por_admin?: boolean;
  editavel_por_corretor?: boolean;
}

export async function createTarefa(input: CreateTarefaInput): Promise<Tarefa | null> {
  const { data, error } = await (supabase as any)
    .from('tarefas')
    .insert({
      tenant_id: input.tenant_id,
      assignee_user_id: input.assignee_user_id,
      assignee_email: input.assignee_email ?? null,
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      prioridade: input.prioridade ?? 'media',
      categoria: input.categoria ?? 'geral',
      tipo: input.tipo ?? 'tarefa',
      data_vencimento: input.data_vencimento ?? null,
      ordem: input.ordem ?? 0,
      tags: input.tags ?? null,
      criador_user_id: input.criador_user_id ?? null,
      criador_email: input.criador_email ?? null,
      criador_nome: input.criador_nome ?? null,
      atribuida_por_admin: input.atribuida_por_admin ?? false,
      editavel_por_corretor: input.editavel_por_corretor ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar tarefa:', error);
    throw new Error(error.message);
  }
  return data ? rowToTarefa(data as TarefaRow) : null;
}

export async function updateTarefa(
  id: string | number,
  updates: Partial<Tarefa>
): Promise<Tarefa | null> {
  const payload: Record<string, unknown> = {};
  if (updates.titulo !== undefined) payload.titulo = updates.titulo;
  if (updates.descricao !== undefined) payload.descricao = updates.descricao;
  if (updates.prioridade !== undefined) payload.prioridade = updates.prioridade;
  if (updates.categoria !== undefined) payload.categoria = updates.categoria;
  if (updates.data_vencimento !== undefined) payload.data_vencimento = updates.data_vencimento;
  if (updates.data_conclusao !== undefined) payload.data_conclusao = updates.data_conclusao;
  if (updates.concluida !== undefined) payload.concluida = updates.concluida;
  if (updates.ordem !== undefined) payload.ordem = updates.ordem;
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.editavel_por_corretor !== undefined) payload.editavel_por_corretor = updates.editavel_por_corretor;

  const { data, error } = await (supabase as any)
    .from('tarefas')
    .update(payload)
    .eq('id', String(id))
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar tarefa:', error);
    throw new Error(error.message);
  }
  return data ? rowToTarefa(data as TarefaRow) : null;
}

export async function deleteTarefa(id: string | number): Promise<void> {
  const { error } = await (supabase as any)
    .from('tarefas')
    .delete()
    .eq('id', String(id));

  if (error) {
    console.error('Erro ao deletar tarefa:', error);
    throw new Error(error.message);
  }
}
