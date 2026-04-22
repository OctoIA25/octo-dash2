/**
 * 🔄 FILA POR EQUIPE — Redistribuição de Leads Expirados
 *
 * Quando um lead expira sem resposta, antes de ir ao Bolsão geral,
 * o sistema tenta redistribuí-lo para outro corretor da mesma equipe
 * e mesmo líder (leader_user_id).
 *
 * Regras de elegibilidade:
 * - Mesmo leader_user_id que o corretor original
 * - Mesma equipe (permissions.team) que o corretor original
 * - Role = 'corretor' (não líderes)
 * - Excluir o corretor original
 *
 * Seleção: least-recently-assigned (menor número de redistribuições recentes)
 */

import { supabase } from '@/integrations/supabase/client';
import { fetchLeadLimitConfig, checkBrokerEligibility, BrokerLeadLimitOverride } from './tenantLeadLimitService';
import type { TeamQueueOrder } from '@/features/leads/services/tenantBolsaoConfigService';

export interface TeamQueueMember {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  team: string;
  leader_user_id: string;
}

export interface TeamQueueResult {
  success: boolean;
  redistributed: boolean;
  member?: TeamQueueMember;
  reason?: string;
}

interface CorretorTeamInfo {
  user_id: string;
  team: string | null;
  leader_user_id: string | null;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

async function getCorretorTeamInfo(
  tenantId: string,
  corretorUserId: string | null,
  corretorName: string | null
): Promise<CorretorTeamInfo | null> {
  // 1. Tentar pelo user_id
  if (corretorUserId) {
    const { data, error } = await supabase
      .from('tenant_memberships')
      .select('user_id, leader_user_id, permissions')
      .eq('tenant_id', tenantId)
      .eq('user_id', corretorUserId)
      .maybeSingle();

    if (!error && data) {
      return {
        user_id: data.user_id,
        team: (data.permissions as any)?.team ?? null,
        leader_user_id: (data as any).leader_user_id ?? null,
      };
    }
  }

  // 2. Fallback: buscar pelo nome em user_profiles
  if (corretorName) {
    const nameTrimmed = corretorName.trim();

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id')
      .ilike('full_name', nameTrimmed)
      .limit(1);

    const profileId = profiles?.[0]?.id;
    if (profileId) {
      const { data, error } = await supabase
        .from('tenant_memberships')
        .select('user_id, leader_user_id, permissions')
        .eq('tenant_id', tenantId)
        .eq('user_id', profileId)
        .maybeSingle();

      if (!error && data) {
        return {
          user_id: data.user_id,
          team: (data.permissions as any)?.team ?? null,
          leader_user_id: (data as any).leader_user_id ?? null,
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

/**
 * Retorna os corretores elegíveis para receber o lead via fila da equipe.
 */
export async function getTeamQueueCandidates(
  tenantId: string,
  originalCorretorUserId: string | null,
  originalCorretorName: string | null
): Promise<TeamQueueMember[]> {
  const teamInfo = await getCorretorTeamInfo(tenantId, originalCorretorUserId, originalCorretorName);

  if (!teamInfo || !teamInfo.leader_user_id || !teamInfo.team) {
    return [];
  }

  const { data: members, error } = await (supabase as any)
    .from('tenant_memberships')
    .select('user_id, leader_user_id, permissions')
    .eq('tenant_id', tenantId)
    .eq('role', 'corretor')
    .eq('leader_user_id', teamInfo.leader_user_id)
    .neq('user_id', teamInfo.user_id);

  if (error || !members || members.length === 0) return [];

  const sameTeam = members.filter(
    (m) => (m.permissions as any)?.team === teamInfo.team
  );

  if (sameTeam.length === 0) return [];

  const userIds = sameTeam.map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, phone')
    .in('id', userIds);

  return sameTeam
    .map((m) => {
      const profile = profiles?.find((p) => p.id === m.user_id);
      if (!profile) return null;
      return {
        user_id: m.user_id,
        name:
          profile.full_name ||
          profile.email?.split('@')[0] ||
          'Corretor',
        email: profile.email || '',
        phone: (profile as any).phone ?? null,
        team: teamInfo.team!,
        leader_user_id: teamInfo.leader_user_id!,
      } as TeamQueueMember;
    })
    .filter(Boolean) as TeamQueueMember[];
}

/**
 * Filtra candidatos que já receberam este lead específico.
 */
async function filterAlreadyTriedForLead(
  candidates: TeamQueueMember[],
  tenantId: string,
  bolsaoLeadId: number
): Promise<TeamQueueMember[]> {
  if (candidates.length === 0) return [];

  const { data: history } = await supabase
    .from('lead_queue_history' as any)
    .select('redistributed_to_user_id')
    .eq('tenant_id', tenantId)
    .eq('bolsao_lead_id', bolsaoLeadId)
    .eq('success', true);

  if (!history || history.length === 0) return candidates;

  const alreadyTried = new Set(history.map((h: any) => h.redistributed_to_user_id));
  return candidates.filter((c) => !alreadyTried.has(c.user_id));
}

/**
 * Escolhe o próximo candidato de acordo com a ordem configurada.
 * - 'balanced' (default): round-robin — quem tem menos leads ativos recebe primeiro.
 *                         Empate é resolvido por menor atribuição recente (lead_queue_history).
 * - 'linear':  ordena por nome e pega o primeiro.
 * - 'random':  embaralha e pega o primeiro.
 */
async function pickCandidate(
  candidates: TeamQueueMember[],
  tenantId: string,
  order: TeamQueueOrder = 'balanced'
): Promise<TeamQueueMember | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (order === 'linear') {
    const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
    return sorted[0];
  }

  if (order === 'random') {
    const arr = [...candidates];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr[0];
  }

  // 'balanced' — round-robin
  const userIds = candidates.map((c) => c.user_id);

  // 1) Contagem de leads ativos por corretor (tabela leads)
  const leadCounts = new Map<string, number>();
  try {
    const { data: leadsRows } = await (supabase as any)
      .from('leads')
      .select('assigned_agent_name')
      .eq('tenant_id', tenantId)
      .in('assigned_agent_name', candidates.map((c) => c.name))
      .is('archived_at', null);
    (leadsRows || []).forEach((row: any) => {
      const cand = candidates.find((c) => c.name === row.assigned_agent_name);
      if (cand) leadCounts.set(cand.user_id, (leadCounts.get(cand.user_id) ?? 0) + 1);
    });
  } catch (e) {
    console.warn('[teamQueue] não foi possível contar leads ativos:', e);
  }

  // 2) Última redistribuição por corretor (tie-break)
  const lastAssignedAt = new Map<string, number>();
  try {
    const { data: history } = await supabase
      .from('lead_queue_history' as any)
      .select('redistributed_to_user_id, created_at')
      .eq('tenant_id', tenantId)
      .in('redistributed_to_user_id', userIds)
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(200);
    (history || []).forEach((row: any) => {
      const uid = row.redistributed_to_user_id;
      if (!lastAssignedAt.has(uid)) {
        lastAssignedAt.set(uid, new Date(row.created_at).getTime());
      }
    });
  } catch (e) {
    console.warn('[teamQueue] não foi possível ler histórico de fila:', e);
  }

  const sorted = [...candidates].sort((a, b) => {
    const ca = leadCounts.get(a.user_id) ?? 0;
    const cb = leadCounts.get(b.user_id) ?? 0;
    if (ca !== cb) return ca - cb;
    const la = lastAssignedAt.get(a.user_id) ?? 0;
    const lb = lastAssignedAt.get(b.user_id) ?? 0;
    return la - lb; // quem recebeu há mais tempo (ou nunca) ganha
  });

  return sorted[0];
}

/**
 * Redistribui um lead do Bolsão para o próximo corretor elegível da equipe.
 * Retorna { redistributed: true } quando bem-sucedido — o lead NÃO vai para o Bolsão geral.
 * Retorna { redistributed: false } quando não há candidatos — o chamador deve mover para bolsão.
 */
export async function redistributeLeadToTeamQueue(
  bolsaoLeadId: number,
  tenantId: string,
  originalCorretorUserId: string | null,
  originalCorretorName: string | null,
  attemptNumber: number = 1,
  order: TeamQueueOrder = 'balanced'
): Promise<TeamQueueResult> {
  try {
    const candidates = await getTeamQueueCandidates(
      tenantId,
      originalCorretorUserId,
      originalCorretorName
    );

    if (candidates.length === 0) {
      return {
        success: true,
        redistributed: false,
        reason: 'no_eligible_team_members',
      };
    }

    // Filtrar candidatos que já receberam este lead
    const notTriedCandidates = await filterAlreadyTriedForLead(candidates, tenantId, bolsaoLeadId);
    if (notTriedCandidates.length === 0) {
      return { success: true, redistributed: false, reason: 'all_team_members_already_tried' };
    }

    // Filtrar candidatos pelo limite de leads (se habilitado)
    let eligibleCandidates = notTriedCandidates;
    try {
      const limitConfig = await fetchLeadLimitConfig(tenantId);
      if (limitConfig && limitConfig.lead_limit_enabled) {
        const eligibilityResults = await Promise.all(
          notTriedCandidates.map(async (c) => {
            // Buscar override individual do corretor
            const { data: memberData } = await supabase
              .from('tenant_memberships')
              .select('permissions')
              .eq('tenant_id', tenantId)
              .eq('user_id', c.user_id)
              .maybeSingle();
            const brokerOverride = (memberData?.permissions as any)?.lead_limit as BrokerLeadLimitOverride | undefined;
            const result = await checkBrokerEligibility(tenantId, c.user_id, limitConfig, brokerOverride);
            return { candidate: c, eligible: result.eligible };
          })
        );
        eligibleCandidates = eligibilityResults.filter((r) => r.eligible).map((r) => r.candidate);
        if (eligibleCandidates.length === 0) {
          return { success: true, redistributed: false, reason: 'all_candidates_at_lead_limit' };
        }
      }
    } catch (e) {
      console.warn('[teamQueue] Erro ao verificar limites de leads, prosseguindo sem filtro:', e);
    }

    const chosen = await pickCandidate(eligibleCandidates, tenantId, order);
    if (!chosen) {
      return { success: true, redistributed: false, reason: 'no_candidate_picked' };
    }

    const teamInfo = await getCorretorTeamInfo(
      tenantId,
      originalCorretorUserId,
      originalCorretorName
    );

    const agora = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('bolsao')
      .update({
        corretor_responsavel: chosen.name,
        numero_corretor_responsavel: chosen.phone ?? null,
        data_atribuicao: agora,
        status: 'novo',
        atendido: false,
        data_atendimento: null,
        queue_attempt: attemptNumber,
        original_corretor_user_id: originalCorretorUserId ?? null,
      } as any)
      .eq('id', bolsaoLeadId);

    if (updateError) {
      console.error('❌ [teamQueue] Erro ao atualizar bolsao:', updateError);
      return { success: false, redistributed: false, reason: updateError.message };
    }

    await supabase.from('lead_queue_history' as any).insert({
      tenant_id: tenantId,
      bolsao_lead_id: bolsaoLeadId,
      original_corretor_name: originalCorretorName,
      original_corretor_user_id: originalCorretorUserId,
      redistributed_to_name: chosen.name,
      redistributed_to_user_id: chosen.user_id,
      team: teamInfo?.team ?? null,
      leader_user_id: teamInfo?.leader_user_id ?? null,
      reason: 'expired_no_response_team_queue',
      attempt_number: attemptNumber,
      success: true,
    });

    return { success: true, redistributed: true, member: chosen };
  } catch (error: any) {
    console.error('❌ [teamQueue] Erro na redistribuição:', error);
    return { success: false, redistributed: false, reason: error.message };
  }
}

/**
 * Retorna o histórico de redistribuições para um tenant.
 */
export async function getQueueHistory(
  tenantId: string,
  limit: number = 50
) {
  const { data, error } = await supabase
    .from('lead_queue_history' as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}
