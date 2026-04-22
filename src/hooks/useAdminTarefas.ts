/**
 * Hook para gestor/admin atribuir tarefas/OKRs a corretores.
 *
 * Regras:
 *  - admin/owner: enxerga todas as tarefas do tenant
 *  - team_leader: enxerga tarefas de membros das equipes que ele lidera
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { Tarefa, PrioridadeTarefa } from './useTarefas';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchTarefasByTenant,
  createTarefa as createTarefaRemote,
} from '@/features/corretores/services/tarefasService';

type AssigneeLookup = Record<string, { user_id: string; email: string; name?: string | null }>;

async function buildAssigneeLookupForTenant(tenantId: string): Promise<AssigneeLookup> {
  try {
    const { data: members } = await supabase.rpc('get_tenant_members', { p_tenant_id: tenantId });
    const out: AssigneeLookup = {};
    (members as any[] | null)?.forEach((m: any) => {
      const email = (m.email || m.name || '').toLowerCase();
      if (!email) return;
      out[email] = { user_id: m.user_id, email, name: m.name ?? null };
    });
    return out;
  } catch (e) {
    console.error('Erro ao montar lookup de assignees:', e);
    return {};
  }
}

export const useAdminTarefas = () => {
  const { user } = useAuth();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigneeLookup, setAssigneeLookup] = useState<AssigneeLookup>({});

  const canManage = user?.systemRole === 'admin' || user?.systemRole === 'owner' || user?.systemRole === 'team_leader';

  const loadTodasTarefas = useCallback(async () => {
    if (!user?.tenantId || user.tenantId === 'owner' || !canManage) {
      setTarefas([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [all, lookup] = await Promise.all([
        fetchTarefasByTenant(user.tenantId),
        buildAssigneeLookupForTenant(user.tenantId),
      ]);
      setAssigneeLookup(lookup);

      // Se o usuário é team_leader, filtrar só tarefas de membros das equipes que ele lidera
      if (user.systemRole === 'team_leader') {
        const { data: ledTeams } = await (supabase as any)
          .from('teams')
          .select('id')
          .eq('tenant_id', user.tenantId)
          .eq('leader_user_id', user.id);

        const ledTeamIds = (ledTeams || []).map((t: any) => t.id);
        if (ledTeamIds.length === 0) {
          setTarefas([]);
          return;
        }

        const { data: ledMembers } = await (supabase as any)
          .from('tenant_memberships')
          .select('user_id')
          .eq('tenant_id', user.tenantId)
          .in('team_id', ledTeamIds);

        const ledUserIds = new Set(((ledMembers || []) as any[]).map((m) => m.user_id));
        ledUserIds.add(user.id); // o gestor também vê o que criou

        const filtered = all.filter((t) => {
          const email = (t.corretor_email || '').toLowerCase();
          const uid = lookup[email]?.user_id;
          return uid ? ledUserIds.has(uid) : false;
        });
        setTarefas(filtered);
      } else {
        setTarefas(all);
      }
    } catch (err) {
      console.error('Erro ao carregar tarefas (admin):', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [user?.tenantId, user?.systemRole, user?.id, canManage]);

  const resolveAssignee = useCallback(
    (emailOrUserId: string): { user_id: string; email: string } | null => {
      const normalized = emailOrUserId.toLowerCase();
      const entry = assigneeLookup[normalized];
      if (entry) return { user_id: entry.user_id, email: entry.email };
      // fallback: talvez já tenha sido passado user_id
      const byUserId = Object.values(assigneeLookup).find((v) => v.user_id === emailOrUserId);
      if (byUserId) return { user_id: byUserId.user_id, email: byUserId.email };
      return null;
    },
    [assigneeLookup]
  );

  const atribuirTarefa = async (
    corretorEmail: string,
    tarefa: Omit<Tarefa, 'id' | 'corretor_email' | 'created_at' | 'updated_at' | 'criador_email' | 'criador_nome' | 'atribuida_por_admin' | 'editavel_por_corretor'> & { editavel_por_corretor?: boolean }
  ) => {
    if (!user?.tenantId || !user?.id || !canManage) {
      throw new Error('Sem permissão para atribuir tarefas');
    }
    const assignee = resolveAssignee(corretorEmail);
    if (!assignee) throw new Error(`Corretor não encontrado no tenant: ${corretorEmail}`);

    const created = await createTarefaRemote({
      tenant_id: user.tenantId,
      assignee_user_id: assignee.user_id,
      assignee_email: assignee.email,
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
      atribuida_por_admin: true,
      editavel_por_corretor: tarefa.editavel_por_corretor ?? true,
    });

    if (created) {
      setTarefas((prev) => [created, ...prev]);
    }
    return created;
  };

  const atribuirTarefaMultiplos = async (
    corretoresEmails: string[],
    tarefa: Omit<Tarefa, 'id' | 'corretor_email' | 'created_at' | 'updated_at' | 'criador_email' | 'criador_nome' | 'atribuida_por_admin' | 'editavel_por_corretor'> & { editavel_por_corretor?: boolean }
  ) => {
    const results: Tarefa[] = [];
    for (const email of corretoresEmails) {
      try {
        const r = await atribuirTarefa(email, tarefa);
        if (r) results.push(r);
      } catch (e) {
        console.error(`Falha ao atribuir para ${email}:`, e);
      }
    }
    return results;
  };

  const estatisticasPorCorretor = useMemo(() => {
    return tarefas.reduce((acc, tarefa) => {
      if (!acc[tarefa.corretor_email]) {
        acc[tarefa.corretor_email] = { total: 0, concluidas: 0, pendentes: 0, atribuidas: 0 };
      }
      acc[tarefa.corretor_email].total++;
      if (tarefa.concluida) acc[tarefa.corretor_email].concluidas++;
      else acc[tarefa.corretor_email].pendentes++;
      if (tarefa.atribuida_por_admin) acc[tarefa.corretor_email].atribuidas++;
      return acc;
    }, {} as Record<string, { total: number; concluidas: number; pendentes: number; atribuidas: number }>);
  }, [tarefas]);

  useEffect(() => {
    loadTodasTarefas();
  }, [loadTodasTarefas]);

  return {
    tarefas,
    isLoading,
    error,
    atribuirTarefa,
    atribuirTarefaMultiplos,
    estatisticasPorCorretor,
    refetch: loadTodasTarefas,
  };
};
