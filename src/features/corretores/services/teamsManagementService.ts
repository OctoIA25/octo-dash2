/**
 * 👥 SERVIÇO DE GESTÃO DE EQUIPES (Multi-tenant)
 *
 * CRUD completo de equipes estruturadas:
 * - Criar / editar / excluir equipes
 * - Atribuir líder (team_leader) à equipe
 * - Adicionar / remover corretores da equipe
 *
 * Ao adicionar um corretor a uma equipe:
 *  - team_id e leader_user_id são atualizados em tenant_memberships
 *  - permissions.team é sincronizado com o color da equipe
 *
 * Ao remover ou trocar de equipe:
 *  - team_id e leader_user_id são limpos / re-atribuídos
 */

import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Team {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  description: string | null;
  /** Gestor primário (= leader_user_ids[0]). Mantido por compat (fila, eNPS, bolsão). */
  leader_user_id: string | null;
  /** Todos os gestores da equipe. O primeiro é o primário. */
  leader_user_ids: string[];
  created_at: string;
  updated_at: string;
  // derivados (enriquecidos no fetch)
  leader_name?: string | null;
  leader_email?: string | null;
  /** Nomes de todos os gestores, na ordem de leader_user_ids. */
  leader_names?: string[];
  member_count?: number;
}

export interface TeamMember {
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  team_id: string | null;
  leader_user_id: string | null;
  permissions: Record<string, unknown> | null;
}

export interface CreateTeamData {
  name: string;
  color: string;
  description?: string;
  /** Gestores da equipe; o primeiro vira o primário (leader_user_id). */
  leader_user_ids?: string[];
}

export interface UpdateTeamData {
  name?: string;
  color?: string;
  description?: string;
  /** Gestores da equipe; o primeiro vira o primário (leader_user_id). */
  leader_user_ids?: string[];
}

/** Deriva o par de colunas persistidas a partir da lista de gestores. */
function leaderColumns(leaderUserIds: string[]) {
  return {
    leader_user_ids: leaderUserIds,
    leader_user_id: leaderUserIds[0] ?? null,
  };
}

export interface TeamServiceResult {
  success: boolean;
  error?: string;
  data?: any;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Retorna todas as equipes do tenant com contagem de membros e nome do líder. */
export async function fetchTeams(tenantId: string): Promise<Team[]> {
  const { data: teams, error } = await supabase
    .from('teams' as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error || !teams) return [];

  // Buscar nomes dos líderes e contagem de membros em paralelo
  const leaderIds = [
    ...new Set(
      (teams as Team[]).flatMap((t) => [t.leader_user_id, ...(t.leader_user_ids ?? [])])
    ),
  ].filter(Boolean) as string[];

  const [leaderProfiles, memberCounts] = await Promise.all([
    leaderIds.length > 0
      ? supabase.from('user_profiles').select('id, full_name, email').in('id', leaderIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('tenant_memberships')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .not('team_id', 'is', null),
  ]);

  const profileMap = new Map(
    (leaderProfiles.data || []).map((p: any) => [p.id, p])
  );
  const countMap = new Map<string, number>();
  (memberCounts.data || []).forEach((m: any) => {
    countMap.set(m.team_id, (countMap.get(m.team_id) || 0) + 1);
  });

  return (teams as Team[]).map((t) => {
    const ids = t.leader_user_ids?.length
      ? t.leader_user_ids
      : t.leader_user_id
        ? [t.leader_user_id]
        : [];
    const leader = ids[0] ? (profileMap.get(ids[0]) as any) : null;
    return {
      ...t,
      leader_user_ids: ids,
      leader_name: leader?.full_name ?? null,
      leader_email: leader?.email ?? null,
      leader_names: ids.map((id) => {
        const p = profileMap.get(id) as any;
        return p?.full_name || p?.email || id;
      }),
      member_count: countMap.get(t.id) || 0,
    };
  });
}

/** Retorna os membros de uma equipe específica. */
export async function fetchTeamMembers(teamId: string, tenantId: string): Promise<TeamMember[]> {
  const { data: memberships, error } = await (supabase as any)
    .from('tenant_memberships')
    .select('id, user_id, role, team_id, leader_user_id, permissions')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);

  if (error || !memberships || memberships.length === 0) return [];

  const userIds = (memberships as any[]).map((m: any) => m.user_id);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return (memberships as any[]).map((m: any) => {
    const p = profileMap.get(m.user_id) as any;
    return {
      membership_id: m.id,
      user_id: m.user_id,
      name: p?.full_name || p?.email?.split('@')[0] || m.user_id,
      email: p?.email || '',
      role: m.role,
      team_id: (m as any).team_id ?? null,
      leader_user_id: (m as any).leader_user_id ?? null,
      permissions: m.permissions ?? null,
    } as TeamMember;
  });
}

/** Retorna membros disponíveis para adicionar à equipe (corretores sem equipe ou de outra equipe). */
export async function fetchAvailableMembers(tenantId: string, excludeTeamId?: string): Promise<TeamMember[]> {
  const base = supabase
    .from('tenant_memberships')
    .select('id, user_id, role, team_id, leader_user_id, permissions')
    .eq('tenant_id', tenantId)
    .in('role', ['corretor', 'team_leader']);

  const { data: memberships, error } = await (
    excludeTeamId
      ? (base as any).or(`team_id.is.null,team_id.neq.${excludeTeamId}`)
      : base.is('team_id' as any, null)
  );
  if (error || !memberships || memberships.length === 0) return [];

  const userIds = (memberships as any[]).map((m: any) => m.user_id);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return (memberships as any[]).map((m: any) => {
    const p = profileMap.get(m.user_id) as any;
    return {
      membership_id: m.id,
      user_id: m.user_id,
      name: p?.full_name || p?.email?.split('@')[0] || m.user_id,
      email: p?.email || '',
      role: m.role,
      team_id: (m as any).team_id ?? null,
      leader_user_id: (m as any).leader_user_id ?? null,
      permissions: m.permissions ?? null,
    } as TeamMember;
  });
}

// ---------------------------------------------------------------------------
// CRUD de equipe
// ---------------------------------------------------------------------------

export async function createTeam(
  tenantId: string,
  data: CreateTeamData
): Promise<TeamServiceResult> {
  const { leader_user_ids = [], ...rest } = data;
  const { data: team, error } = await supabase
    .from('teams' as any)
    .insert({ tenant_id: tenantId, ...rest, ...leaderColumns(leader_user_ids) })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: team };
}

export async function updateTeam(
  teamId: string,
  data: UpdateTeamData
): Promise<TeamServiceResult> {
  const { leader_user_ids, ...rest } = data;
  const payload = leader_user_ids !== undefined
    ? { ...rest, ...leaderColumns(leader_user_ids) }
    : rest;

  const { error } = await supabase
    .from('teams' as any)
    .update(payload)
    .eq('id', teamId);

  if (error) return { success: false, error: error.message };

  // Se os gestores mudaram, sincronizar o primário nos membros da equipe
  // (tenant_memberships.leader_user_id alimenta fila por equipe/roleta e eNPS)
  if (leader_user_ids !== undefined) {
    const { error: memberError } = await supabase
      .from('tenant_memberships')
      .update({ leader_user_id: leader_user_ids[0] ?? null } as any)
      .eq('team_id' as any, teamId)
      .neq('role', 'team_leader'); // não sobrescrever o próprio líder

    if (memberError) {
      console.warn('[teamsService] Aviso: erro ao atualizar leader_user_id dos membros:', memberError.message);
    }
  }

  return { success: true };
}

export async function deleteTeam(teamId: string): Promise<TeamServiceResult> {
  // Desassociar membros primeiro
  await supabase
    .from('tenant_memberships')
    .update({ team_id: null, leader_user_id: null } as any)
    .eq('team_id' as any, teamId);

  const { error } = await supabase
    .from('teams' as any)
    .delete()
    .eq('id', teamId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Membros
// ---------------------------------------------------------------------------

/**
 * Adiciona um membro a uma equipe.
 * - Atualiza team_id
 * - Atualiza leader_user_id com o líder da equipe
 * - Sincroniza permissions.team com o color da equipe
 */
export async function addMemberToTeam(
  membershipId: string,
  teamId: string,
  tenantId: string
): Promise<TeamServiceResult> {
  // Buscar dados da equipe
  const { data: team, error: teamError } = await supabase
    .from('teams' as any)
    .select('id, color, leader_user_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamError || !team) return { success: false, error: 'Equipe não encontrada' };

  // Buscar permissions atuais do membro
  const { data: membership, error: memError } = await supabase
    .from('tenant_memberships')
    .select('permissions')
    .eq('id', membershipId)
    .maybeSingle();

  if (memError || !membership) return { success: false, error: 'Membro não encontrado' };

  const currentPerms = (membership.permissions as Record<string, unknown>) || {};
  const newPerms = { ...currentPerms, team: (team as any).color };

  const { error } = await supabase
    .from('tenant_memberships')
    .update({
      team_id: teamId,
      leader_user_id: (team as any).leader_user_id ?? null,
      permissions: newPerms,
    } as any)
    .eq('id', membershipId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Remove um membro de uma equipe.
 * Limpa team_id, leader_user_id e permissions.team.
 */
export async function removeMemberFromTeam(membershipId: string): Promise<TeamServiceResult> {
  const { data: membership, error: memError } = await supabase
    .from('tenant_memberships')
    .select('permissions')
    .eq('id', membershipId)
    .maybeSingle();

  if (memError || !membership) return { success: false, error: 'Membro não encontrado' };

  const currentPerms = (membership.permissions as Record<string, unknown>) || {};
  const { team: _removed, ...newPerms } = currentPerms as any;

  const { error } = await supabase
    .from('tenant_memberships')
    .update({
      team_id: null,
      leader_user_id: null,
      permissions: newPerms,
    } as any)
    .eq('id', membershipId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Adiciona ou remove um gestor da equipe, sincronizando o primário nos membros.
 */
export async function toggleTeamLeader(
  teamId: string,
  leaderUserId: string,
  action: 'add' | 'remove'
): Promise<TeamServiceResult> {
  const { data: team, error } = await supabase
    .from('teams' as any)
    .select('leader_user_id, leader_user_ids')
    .eq('id', teamId)
    .maybeSingle();

  if (error || !team) return { success: false, error: 'Equipe não encontrada' };

  const current: string[] = (team as any).leader_user_ids?.length
    ? (team as any).leader_user_ids
    : (team as any).leader_user_id
      ? [(team as any).leader_user_id]
      : [];

  const next = action === 'add'
    ? current.includes(leaderUserId) ? current : [...current, leaderUserId]
    : current.filter((id) => id !== leaderUserId);

  return updateTeam(teamId, { leader_user_ids: next });
}
