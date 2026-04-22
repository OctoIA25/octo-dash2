import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from "@/hooks/useAuth";
import { CreateNotificationModal } from '@/features/notificacoes/components/CreateNotificationModal';

export const NotificacoesPage = () => {
  const { user, tenantId } = useAuth();
  const {
    notifications,
    unreadCount,
    loadNotifications,
    addTestNotification,
    addNotification,
    markAllAsRead,
    markAsRead,
    clearAll,
  } = useNotifications();

  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (tenantId && user?.id) {
      loadNotifications(tenantId, user.id);
    }
  }, [tenantId, user?.id, loadNotifications]);

  useEffect(() => {
    if (!tenantId || !user?.id) return;
    const key = `octodash:notifs-seed:${tenantId}:${user.id}`;

    const hasPendencia = notifications.some((n) => n.title === 'Pendência de resposta (24h)');
    const hasBloqueio = notifications.some((n) => n.title === 'Bloqueio do bolsão');
    try {
      const already = localStorage.getItem(key);
      if (already === 'true' && hasPendencia && hasBloqueio) return;
    } catch {
      // ignore
    }

    try {
      // Setar antes para evitar duplicação caso o efeito rode novamente durante o async.
      localStorage.setItem(key, 'true');
    } catch {
      // ignore
    }

    (async () => {
      if (!hasPendencia) {
        await addNotification({
          tenant_id: tenantId,
          user_id: user.id,
          title: 'Pendência de resposta (24h)',
          body: 'Você ainda não respondeu a situação do Lead CA0001, você tem 24h para responder ou será bloqueado da área de bolsão',
          type: 'warning',
          link_type: 'lead',
          link_id: 'CA0001',
          metadata: { leadCode: 'CA0001', reason: 'pending_lead_response', deadlineHours: 24 },
        });
      }

      if (!hasBloqueio) {
        await addNotification({
          tenant_id: tenantId,
          user_id: user.id,
          title: 'Bloqueio do bolsão',
          body: 'Você foi bloqueado da área de bolsão, resolva sua pendência o mais rápido o possível',
          type: 'blocked',
          link_type: 'bolsao',
          link_id: null as any,
          metadata: { reason: 'bolsao_blocked' },
        });
      }
    })();
  }, [tenantId, user?.id, addNotification, notifications]);

  const visibleNotifications = useMemo(() => {
    const keepOnlyOneTitles = new Set(['Pendência de resposta (24h)', 'Bloqueio do bolsão']);
    const seen = new Set<string>();

    return notifications.filter((n) => {
      if (!keepOnlyOneTitles.has(n.title)) return true;
      if (seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    });
  }, [notifications]);

  const handleAddTest = () => {
    if (tenantId && user?.id) {
      addTestNotification(tenantId, user.id);
    }
  };

  const handleCreateNotification = async (data: {
    title: string;
    sender: string;
    recipient: string;
    description: string;
  }) => {
    if (!tenantId || !user?.id) return;

    const metadata: Record<string, unknown> = {
      sender: data.sender,
      recipient: data.recipient,
    };

    await addNotification({
      tenant_id: tenantId,
      user_id: user.id,
      title: data.title,
      body: `${data.description}\n\nEnviado por: ${data.sender}\nPara: ${data.recipient}`,
      type: 'info',
      metadata,
    });
  };

  return (
    <div className="w-full h-full p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Notificações
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Avisos e atualizações do sistema (atividade pendente, bloqueio, etc.).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => clearAll()}>
            Limpar
          </Button>
          <Button type="button" variant="outline" onClick={() => markAllAsRead()}>
            Marcar tudo como lido
          </Button>
          <Button
            type="button"
            onClick={() => setIsModalOpen(true)}
            disabled={!tenantId || !user?.id}
          >
            Gerar notificação
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Caixa de notificações</CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma notificação.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleNotifications.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg border p-3 flex items-start justify-between gap-4"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {!n.read && (
                        <span className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {n.title}
                      </p>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(n.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {n.body && (
                      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {n.body}
                      </p>
                    )}
                  </div>

                  {!n.read && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => markAsRead(n.id)}
                    >
                      Marcar como lido
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateNotificationModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onCreateNotification={handleCreateNotification}
      />
    </div>
  );
};
