/**
 * Hook para gerenciar tarefas pessoais do corretor (lado do assignee)
 * Lê/escreve em public.tarefas no Supabase.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  fetchTarefasByAssignee,
  createTarefa as createTarefaRemote,
  updateTarefa as updateTarefaRemote,
  deleteTarefa as deleteTarefaRemote,
} from '@/features/corretores/services/tarefasService';

export type PrioridadeTarefa = 'baixa' | 'media' | 'alta' | 'urgente';

export interface Tarefa {
  id?: number;
  corretor_email: string;
  titulo: string;
  descricao?: string;
  concluida: boolean;
  prioridade: PrioridadeTarefa;
  data_vencimento?: string;
  data_conclusao?: string;
  categoria: string;
  tags?: string[];
  ordem: number;
  criador_email?: string;
  criador_nome?: string;
  atribuida_por_admin?: boolean;
  editavel_por_corretor?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const useTarefas = () => {
  const { user } = useAuth();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTarefas = useCallback(async () => {
    if (!user?.id || !user?.tenantId || user.tenantId === 'owner') {
      setTarefas([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const data = await fetchTarefasByAssignee(user.tenantId, user.id);
      setTarefas(data);
    } catch (err) {
      console.error('Erro ao carregar tarefas:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.tenantId]);

  const criarTarefa = async (
    tarefa: Omit<Tarefa, 'id' | 'corretor_email' | 'created_at' | 'updated_at'>
  ) => {
    if (!user?.id || !user?.tenantId) return;

    const created = await createTarefaRemote({
      tenant_id: user.tenantId,
      assignee_user_id: user.id,
      assignee_email: user.email || null,
      titulo: tarefa.titulo,
      descricao: tarefa.descricao ?? null,
      prioridade: tarefa.prioridade,
      categoria: tarefa.categoria,
      data_vencimento: tarefa.data_vencimento ?? null,
      ordem: tarefa.ordem ?? 0,
      tags: tarefa.tags ?? null,
      criador_user_id: user.id,
      criador_email: user.email || null,
      criador_nome: user.name || null,
      atribuida_por_admin: false,
      editavel_por_corretor: true,
    });

    if (created) {
      setTarefas((prev) => [created, ...prev]);
    }
    return created;
  };

  const atualizarTarefa = async (id: number, updates: Partial<Tarefa>) => {
    if (!user?.id) return;
    const updated = await updateTarefaRemote(id, updates);
    if (updated) {
      setTarefas((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
    return updated;
  };

  const toggleTarefaConcluida = async (id: number) => {
    const tarefa = tarefas.find((t) => t.id === id);
    if (!tarefa) return;
    await atualizarTarefa(id, {
      concluida: !tarefa.concluida,
      data_conclusao: !tarefa.concluida ? new Date().toISOString() : undefined,
    });
  };

  const deletarTarefa = async (id: number) => {
    if (!user?.id) return;
    await deleteTarefaRemote(id);
    setTarefas((prev) => prev.filter((t) => t.id !== id));
  };

  const estatisticas = {
    total: tarefas.length,
    concluidas: tarefas.filter((t) => t.concluida).length,
    pendentes: tarefas.filter((t) => !t.concluida).length,
    urgentes: tarefas.filter((t) => t.prioridade === 'urgente' && !t.concluida).length,
    vencidas: tarefas.filter((t) => {
      if (!t.data_vencimento || t.concluida) return false;
      return new Date(t.data_vencimento) < new Date();
    }).length,
  };

  useEffect(() => {
    loadTarefas();
  }, [loadTarefas]);

  return {
    tarefas,
    isLoading,
    error,
    criarTarefa,
    atualizarTarefa,
    toggleTarefaConcluida,
    deletarTarefa,
    estatisticas,
    refetch: loadTarefas,
  };
};
