/**
 * Bloqueio por atividades pendentes (Retornar para o lead / Agendar Visita).
 * - Atividade passou do prazo → notifica corretor (24h para realizar).
 * - Passou 24h desde a notificação → bloqueia corretor de receber leads (bolsão/geral).
 * - Corretor realizou atividade → libera.
 */

import { supabase } from '@/integrations/supabase/client';
import { createNotification } from '@/features/notificacoes/services/notificationsService';
import { updateMemberPermissions, fetchTenantMembers } from './tenantMembersService';

const BLOCKING_TIPOS = ['retornar_cliente', 'visita_agendada'];
const PENDING_STATUSES = ['pendente', 'confirmado'];
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

/** Notifica corretor e marca pending_notified_at; se já passou 24h desde notificação, bloqueia */
export async function processPendingBlockingForTenant(tenantId: string): Promise<{
  notified: number;
  blocked: number;
}> {
  const pending = await fetchPendingBlockingActivities(tenantId);
  let notified = 0;
  let blocked = 0;

  for (const evt of pending) {
    const userId = await getUserIdByCorretorEmail(tenantId, evt.corretor_email);
    if (!userId) continue;

    const now = Date.now();
    const notifiedAt = evt.pending_notified_at ? new Date(evt.pending_notified_at).getTime() : null;

    if (notifiedAt === null) {
      await supabase
        .from('agenda_eventos')
        .update({
          pending_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', evt.id);
      await createNotification({
        tenant_id: tenantId,
        user_id: userId,
        title: 'Atividade pendente',
        body: `"${evt.titulo}" (${evt.tipo === 'visita_agendada' ? 'Visita' : 'Retorno ao lead'}) passou do prazo. Realize em até 24h para não ser bloqueado do recebimento de leads.`,
        type: 'activity_pending',
        link_type: 'agenda_event',
        link_id: evt.id,
      });
      notified += 1;
      continue;
    }

    if (now - notifiedAt >= TWENTY_FOUR_HOURS_MS) {
      const membershipId = await getMembershipIdByUserId(tenantId, userId);
      if (!membershipId) continue;
      const { data: member } = await supabase
        .from('tenant_memberships')
        .select('permissions')
        .eq('id', membershipId)
        .maybeSingle();
      const current = (member?.permissions as Record<string, unknown>) || {};
      const updated = {
        ...current,
        bolsao_blocked_enabled: true,
        bolsao_blocked_until: null,
        bolsao_blocked_reason: 'atividade_pendente',
        bolsao_blocked_duration: 'indefinido',
      };
      const res = await updateMemberPermissions(membershipId, updated);
      if (res.success) {
        blocked += 1;
        await createNotification({
          tenant_id: tenantId,
          user_id: userId,
          title: 'Você foi bloqueado do recebimento de leads',
          body: 'Por não realizar a atividade pendente em 24h, você está temporariamente bloqueado. Resolva a pendência ou peça ao gestor para desbloquear.',
          type: 'blocked',
          link_type: 'agenda_event',
          link_id: evt.id,
        });
      }
    }
  }

  return { notified, blocked };
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
