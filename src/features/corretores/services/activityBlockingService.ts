/**
 * Bloqueio por atividades pendentes (Retornar para o lead / Agendar Visita).
 * - Atividade passou do prazo → notifica corretor (24h para realizar).
 * - Passou 24h desde a notificação → bloqueia corretor de receber leads (bolsão/geral).
 * - Corretor realizou atividade → libera.
 *
 * NOTIFICAR e BLOQUEAR rodam no banco (pg_cron → processar_atividades_pendentes,
 * migration 20260911_atividades_lembrete_e_bloqueio.sql): quem some é justamente
 * quem precisa ser cobrado, então não pode depender de alguém com a aba aberta.
 * Aqui fica só o lado do cliente — checar pendência e liberar quando conclui.
 */

import { supabase } from '@/integrations/supabase/client';
import { updateMemberPermissions, fetchTenantMembers } from './tenantMembersService';

const BLOCKING_TIPOS = ['retornar_cliente', 'visita_agendada'];
const PENDING_STATUSES = ['pendente', 'confirmado'];

/** Retorna user_id (auth) do corretor pelo email no tenant */
export async function getUserIdByCorretorEmail(
  tenantId: string,
  corretorEmail: string
): Promise<string | null> {
  const members = await fetchTenantMembers(tenantId);
  const emailNorm = (corretorEmail || '').trim().toLowerCase();
  const member = members.find((m) => (m.email || '').trim().toLowerCase() === emailNorm);
  return member?.user_id ?? null;
}

/** Busca membership id do tenant por user_id */
export async function getMembershipIdByUserId(
  tenantId: string,
  userId: string
): Promise<string | null> {
  const members = await fetchTenantMembers(tenantId);
  const m = members.find((x) => x.user_id === userId);
  return m?.id ?? null;
}

/** Eventos da agenda que podem gerar bloqueio */
export interface PendingBlockingEvent {
  id: string;
  tenant_id: string;
  corretor_email: string;
  titulo: string;
  data: string;
  horario: string | null;
  tipo: string;
  status: string;
  pending_notified_at: string | null;
  lead_nome: string | null;
}

/** Lista atividades pendentes que geram bloqueio (retornar_cliente, visita_agendada) e já passaram do prazo */
export async function fetchPendingBlockingActivities(
  tenantId: string
): Promise<PendingBlockingEvent[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('agenda_eventos')
    .select('id, tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at, lead_nome')
    .eq('tenant_id', tenantId)
    .in('tipo', BLOCKING_TIPOS)
    .in('status', PENDING_STATUSES)
    .lte('data', today);

  if (error) {
    console.error('Erro ao buscar atividades pendentes:', error);
    return [];
  }

  const rows = (data || []) as PendingBlockingEvent[];
  return rows.filter((row) => {
    const dataEvento = new Date(row.data);
    const horario = (row.horario || '').toString();
    if (horario && /^\d{2}:\d{2}/.test(horario)) {
      const [hh, mm] = horario.split(':').map(Number);
      dataEvento.setHours(hh || 0, mm || 0, 0, 0);
    } else {
      dataEvento.setHours(23, 59, 59, 999);
    }
    return dataEvento.getTime() < now.getTime();
  });
}

/** Remove bloqueio do corretor (quando concluiu a atividade ou gestor desbloqueou) */
export async function unblockCorretor(
  tenantId: string,
  corretorEmailOrUserId: string
): Promise<boolean> {
  let userId = corretorEmailOrUserId;
  if (corretorEmailOrUserId.includes('@')) {
    const resolved = await getUserIdByCorretorEmail(tenantId, corretorEmailOrUserId);
    if (!resolved) return false;
    userId = resolved;
  }
  const membershipId = await getMembershipIdByUserId(tenantId, userId);
  if (!membershipId) return false;
  const { data: member } = await supabase
    .from('tenant_memberships')
    .select('permissions')
    .eq('id', membershipId)
    .maybeSingle();
  const current = (member?.permissions as Record<string, unknown>) || {};
  const updated = {
    ...current,
    bolsao_blocked_enabled: false,
    bolsao_blocked_until: null,
    bolsao_blocked_reason: null,
    bolsao_blocked_duration: null,
  };
  const res = await updateMemberPermissions(membershipId, updated);
  return res.success;
}

/** Verifica se o corretor ainda tem alguma atividade de bloqueio pendente; se não tiver, pode desbloquear */
export async function hasAnyPendingBlockingActivity(
  tenantId: string,
  corretorEmail: string
): Promise<boolean> {
  const pending = await fetchPendingBlockingActivities(tenantId);
  return pending.some((e) => e.corretor_email.toLowerCase() === corretorEmail.toLowerCase());
}
