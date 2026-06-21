/**
 * Orquestração do CRUD de KPIs (TanStack Query). Quem PODE gerenciar: owner da
 * plataforma (isOwner) ou role de gestão do tenant (admin/team_leader/owner).
 * Defesa em 2 camadas — a UI esconde as ações; a RLS bloqueia a escrita no banco.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  fetchKpis, createKpi, updateKpi, deleteKpi, reorderKpis, setKpiVisibility, setKpiStatus,
} from '../services/kpiAdminService';
import type { DashboardKpiDraft } from '@/features/kpis/domain/kpiTypes';

/**
 * Pura e testável: decide se o ator pode gerenciar KPIs.
 *
 * ATENÇÃO: o `user.role` do AuthContext é COLAPSADO em 'gestao' | 'corretor'
 * (admin/team_leader → 'gestao'), NÃO os papéis granulares. O sinal canônico de
 * "é gestor" no codebase é `isGestao` (= role 'gestao' OU owner). Usamos
 * `isGestao` (cobre admin/team_leader) OU `isOwner` (owner da plataforma).
 * O corretor fica de fora. A RLS é a 2ª camada (bloqueia escrita no banco).
 */
export function computeCanManageKpis(actor: { isGestao?: boolean; isOwner?: boolean }): boolean {
  return Boolean(actor.isOwner || actor.isGestao);
}

export function useKpiAdmin() {
  const { tenantId, user, isOwner, isGestao } = useAuthContext();
  const qc = useQueryClient();
  const canManage = computeCanManageKpis({ isGestao, isOwner });
  const ready = Boolean(tenantId && tenantId !== 'owner');
  const actorName = user?.name || user?.email || 'Gestor';

  /**
   * Guarda de escrita: sem tenant REAL (ex.: owner sem impersonation, tenantId
   * 'owner'), nenhuma mutação deve gravar — escreveria com tenant_id='owner'.
   * `canManage` pode ser true para o owner; só `ready` garante tenant real.
   */
  function requireTenant(): string {
    if (!ready) throw new Error('Selecione uma imobiliária para gerenciar KPIs.');
    return tenantId as string;
  }

  const kpisQuery = useQuery({
    queryKey: ['kpis', 'admin', tenantId],
    queryFn: () => fetchKpis(tenantId as string),
    enabled: ready,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kpis', 'admin', tenantId] });
    qc.invalidateQueries({ queryKey: ['kpis', 'overview'] }); // reflete no dashboard
  };

  // Todas as mutações passam por requireTenant() — falham claro sem tenant real.
  const create = useMutation({ mutationFn: (d: DashboardKpiDraft) => createKpi(d, { tenantId: requireTenant(), actorName }), onSuccess: invalidate });
  const update = useMutation({ mutationFn: (p: { id: string; draft: DashboardKpiDraft }) => updateKpi(p.id, p.draft, { tenantId: requireTenant(), actorName }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => deleteKpi(id, requireTenant()), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ids: string[]) => reorderKpis(ids, requireTenant()), onSuccess: invalidate });
  const setVisibility = useMutation({ mutationFn: (p: { id: string; isVisible: boolean }) => setKpiVisibility(p.id, p.isVisible, requireTenant()), onSuccess: invalidate });
  const setStatus = useMutation({ mutationFn: (p: { id: string; status: 'active' | 'inactive' }) => setKpiStatus(p.id, p.status, requireTenant()), onSuccess: invalidate });

  return {
    kpis: kpisQuery.data ?? [], isLoading: kpisQuery.isLoading, canManage,
    create, update, remove, reorder, setVisibility, setStatus,
    // Revalida a lista + o overview. Usado após a importação (que grava por fora
    // das mutations, então precisa disparar a invalidação manualmente).
    refresh: invalidate,
  };
}
