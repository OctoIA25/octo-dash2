import React, { createContext, useContext, useMemo, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchNotificationsForUser,
  markNotificationAsRead as apiMarkAsRead,
  markAllNotificationsAsRead as apiMarkAllAsRead,
  clearReadNotifications as apiClearRead,
  type NotificationRow,
} from '@/features/notificacoes/services/notificationsService';

/** O que publicar_comunicado grava em metadata: a fotografia do envio. */
export type NotificationMetadata = {
  remetente?: { tipo?: string; nome?: string; cargo?: string };
  publico?: string;
  prioridade?: 'normal' | 'importante';
  sobre?: string;
  [chave: string]: unknown;
};

export type NotificationItem = {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  type?: string;
  linkType?: string;
  linkId?: string;
  metadata: NotificationMetadata;
};

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  /** A última carga falhou (rede/banco). A lista na tela pode estar velha. */
  loadError: boolean;
  /** A última notificação entregue pelo Realtime — o gatilho do aviso na tela. */
  novaChegada: NotificationItem | null;
  /** Carrega as notificações do usuário naquela imobiliária. */
  loadNotifications: (tenantId: string, userId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markAsRead: (id: string) => void;
  /** Apaga só as lidas. */
  clearRead: () => Promise<void>;
  currentTenantId: string | null;
  currentUserId: string | null;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

type Linha = Pick<NotificationRow, 'id' | 'title' | 'body' | 'created_at' | 'read_at' | 'type' | 'link_type' | 'link_id' | 'metadata'>;

function mapRowToItem(row: Linha): NotificationItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? undefined,
    createdAt: row.created_at,
    read: !!row.read_at,
    type: row.type,
    linkType: row.link_type ?? undefined,
    linkId: row.link_id ?? undefined,
    // As linhas de antes de 01/10 têm metadata {} ou null.
    metadata: (row.metadata ?? {}) as NotificationMetadata,
  };
}

const maisNovasPrimeiro = (a: NotificationItem, b: NotificationItem) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [novaChegada, setNovaChegada] = useState<NotificationItem | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /** De quem é a lista na tela. Trocar de imobiliária ou de conta começa do zero. */
  const donoDaLista = useRef<string | null>(null);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const loadNotifications = useCallback(async (tenantId: string, userId: string) => {
    if (!tenantId || !userId) return;
    const dono = `${tenantId}:${userId}`;
    if (donoDaLista.current !== dono) {
      donoDaLista.current = dono;
      setNotifications([]);
      setNovaChegada(null);
    }
    setCurrentTenantId(tenantId);
    setCurrentUserId(userId);
    setLoading(true);
    try {
      const fetched = (await fetchNotificationsForUser(tenantId, userId)).map(mapRowToItem);
      // A casa mudou enquanto buscava: esta resposta é da lista antiga.
      if (donoDaLista.current !== dono) return;
      // Mescla para não perder o que o Realtime entregou durante a busca.
      setNotifications((prev) => {
        const porId = new Map(prev.map((n) => [n.id, n]));
        for (const n of fetched) porId.set(n.id, n);
        return [...porId.values()].sort(maisNovasPrimeiro);
      });
      setLoadError(false);
    } catch (e) {
      if (donoDaLista.current !== dono) return;
      console.error('Erro ao carregar notificações:', e);
      setLoadError(true);
    } finally {
      if (donoDaLista.current === dono) setLoading(false);
    }
  }, []);

  // Realtime: o que chega aparece sem F5 e vira `novaChegada` (o aviso na tela).
  // Mesmo padrão de useChatConversations (postgres_changes + removeChannel).
  useEffect(() => {
    if (!currentTenantId || !currentUserId || currentTenantId === 'owner') return;
    const channel = supabase
      .channel(`notifications_${currentTenantId}_${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const row = payload.new as Linha & { tenant_id: string };
          if (row.tenant_id !== currentTenantId) return;
          const item = mapRowToItem(row);
          setNotifications((prev) => (prev.some((n) => n.id === item.id) ? prev : [item, ...prev]));
          setNovaChegada(item);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTenantId, currentUserId]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    apiMarkAsRead(id).catch(console.error);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!currentTenantId || !currentUserId) return;
    const ok = await apiMarkAllAsRead(currentTenantId, currentUserId);
    if (ok) setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [currentTenantId, currentUserId]);

  const clearRead = useCallback(async () => {
    if (!currentTenantId || !currentUserId) return;
    const ok = await apiClearRead(currentTenantId, currentUserId);
    if (ok) setNotifications((prev) => prev.filter((n) => !n.read));
  }, [currentTenantId, currentUserId]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      loadError,
      novaChegada,
      loadNotifications,
      markAllAsRead,
      markAsRead,
      clearRead,
      currentTenantId,
      currentUserId,
    }),
    [notifications, unreadCount, loading, loadError, novaChegada, loadNotifications, markAllAsRead, markAsRead, clearRead, currentTenantId, currentUserId]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
};
