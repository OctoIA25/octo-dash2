/**
 * Notificações in-app multitenant (Supabase)
 */

import { supabase } from '@/integrations/supabase/client';

export type NotificationType = 'info' | 'warning' | 'activity_pending' | 'blocked' | 'lead';

export interface NotificationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
  link_type?: string | null;
  link_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateNotificationInput {
  tenant_id: string;
  user_id: string;
  title: string;
  body?: string;
  type?: NotificationType;
  link_type?: string;
  link_id?: string;
  metadata?: Record<string, unknown>;
}

export async function fetchNotificationsForUser(
  tenantId: string,
  userId: string
): Promise<NotificationRow[]> {
  if (!tenantId || tenantId === 'owner' || !userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('Erro ao buscar notificações:', error);
    return [];
  }
  return (data || []) as NotificationRow[];
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function markAllNotificationsAsRead(
  tenantId: string,
  userId: string
): Promise<boolean> {
  if (!tenantId || !userId) return false;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .is('read_at', null);
  return !error;
}

export async function clearAllNotifications(
  tenantId: string,
  userId: string
): Promise<boolean> {
  if (!tenantId || !userId) return false;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  return !error;
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<string | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? 'info',
      link_type: input.link_type ?? null,
      link_id: input.link_id ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();
  if (error) {
    console.error('Erro ao criar notificação:', error);
    return null;
  }
  return data?.id ?? null;
}
