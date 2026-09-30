/**
 * Notificações in-app multitenant (Supabase): leitura e estado de leitura.
 *
 * Quem GRAVA são funções do banco (publicar_comunicado, cron, gatilhos) e o
 * servidor. Desde 20261001_notifications_fecha_insert.sql o navegador não
 * grava notificação para ninguém — nem para si.
 */

import { supabase } from '@/integrations/supabase/client';

export interface NotificationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
  link_type: string | null;
  link_id: string | null;
  comunicado_id: string | null;
  metadata: Record<string, unknown> | null;
}

const COLUNAS =
  'id, tenant_id, user_id, title, body, type, read_at, created_at, link_type, link_id, comunicado_id, metadata';

/** Lança em erro: a tela precisa distinguir "não há nada" de "não deu para buscar". */
export async function fetchNotificationsForUser(tenantId: string, userId: string): Promise<NotificationRow[]> {
  if (!tenantId || tenantId === 'owner' || !userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function markAllNotificationsAsRead(tenantId: string, userId: string): Promise<boolean> {
  if (!tenantId || !userId) return false;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .is('read_at', null);
  return !error;
}

/** Apaga só as LIDAS: o que ainda não foi visto não some por engano. */
export async function clearReadNotifications(tenantId: string, userId: string): Promise<boolean> {
  if (!tenantId || !userId) return false;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .not('read_at', 'is', null);
  return !error;
}
