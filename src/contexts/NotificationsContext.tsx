import React, { createContext, useContext, useMemo, useState, ReactNode, useCallback } from 'react';
import {
  fetchNotificationsForUser,
  markNotificationAsRead as apiMarkAsRead,
  markAllNotificationsAsRead as apiMarkAllAsRead,
  clearAllNotifications as apiClearAll,
  createNotification as apiCreateNotification,
  type CreateNotificationInput,
} from '@/features/notificacoes/services/notificationsService';

export type NotificationItem = {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  type?: string;
  linkType?: string;
  linkId?: string;
};

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  /** Carrega notificações do Supabase (multitenant). Chamar quando tiver tenantId e userId. */
  loadNotifications: (tenantId: string, userId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markAsRead: (id: string) => void;
  clearAll: () => Promise<void>;
  /** Adiciona notificação de teste (persiste no Supabase se tenantId/userId estiverem setados) */
  addTestNotification: (tenantId: string, userId: string) => Promise<void>;
  /** Para o sistema criar notificação (ex.: atividade pendente, bloqueio). */
  addNotification: (input: CreateNotificationInput) => Promise<string | null>;
  /** Último tenant/user usados no load (para markAllAsRead/clearAll) */
  currentTenantId: string | null;
  currentUserId: string | null;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function mapRowToItem(row: {
  id: string;
  title: string;
  body?: string | null;
  created_at: string;
  read_at: string | null;
  type?: string;
  link_type?: string | null;
  link_id?: string | null;
}): NotificationItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? undefined,
    createdAt: row.created_at,
    read: !!row.read_at,
    type: row.type,
    linkType: row.link_type ?? undefined,
    linkId: row.link_id ?? undefined,
  };
}

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const loadNotifications = useCallback(async (tenantId: string, userId: string) => {
    if (!tenantId || !userId) return;
    setLoading(true);
    try {
      const rows = await fetchNotificationsForUser(tenantId, userId);
      const fetched = rows.map((r) =>
        mapRowToItem({
          id: r.id,
          title: r.title,
          body: r.body,
          created_at: r.created_at,
          read_at: r.read_at,
          type: r.type,
          link_type: r.link_type,
          link_id: r.link_id,
        })
      );

      setNotifications((prev) => {
        const map = new Map<string, NotificationItem>();
        for (const n of prev) map.set(n.id, n);
        for (const n of fetched) map.set(n.id, n);
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      setCurrentTenantId(tenantId);
      setCurrentUserId(userId);
    } catch (e) {
      console.error('Erro ao carregar notificações:', e);
      // Mantém as notificações locais (seed/optimistic) caso a busca falhe
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    apiMarkAsRead(id).catch(console.error);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!currentTenantId || !currentUserId) return;
    const ok = await apiMarkAllAsRead(currentTenantId, currentUserId);
    if (ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }, [currentTenantId, currentUserId]);

  const clearAll = useCallback(async () => {
    if (!currentTenantId || !currentUserId) return;
    const ok = await apiClearAll(currentTenantId, currentUserId);
    if (ok) setNotifications([]);
  }, [currentTenantId, currentUserId]);

  const addTestNotification = useCallback(async (tenantId: string, userId: string) => {
    const id = await apiCreateNotification({
      tenant_id: tenantId,
      user_id: userId,
      title: 'Nova notificação (teste)',
      body: `Criada em ${new Date().toLocaleString('pt-BR')}.`,
      type: 'info',
    });
    if (id) {
      setNotifications((prev) => [
        {
          id,
          title: 'Nova notificação (teste)',
          body: `Criada em ${new Date().toLocaleString('pt-BR')}.`,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...prev,
      ]);
    }
  }, []);

  const addNotification = useCallback(async (input: CreateNotificationInput) => {
    let id: string | null = null;
    try {
      id = await apiCreateNotification(input);
    } catch (e) {
      console.error('Erro ao criar notificação:', e);
    }

    const finalId = id ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setNotifications((prev) => [
      {
        id: finalId,
        title: input.title,
        body: input.body,
        createdAt: new Date().toISOString(),
        read: false,
        type: input.type,
        linkType: input.link_type,
        linkId: input.link_id,
      },
      ...prev,
    ]);

    return id ?? finalId;
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      loadNotifications,
      markAllAsRead,
      markAsRead,
      clearAll,
      addTestNotification,
      addNotification,
      currentTenantId,
      currentUserId,
    }),
    [
      notifications,
      unreadCount,
      loading,
      loadNotifications,
      markAllAsRead,
      markAsRead,
      clearAll,
      addTestNotification,
      addNotification,
      currentTenantId,
      currentUserId,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
};
