import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from "@/hooks/useAuth";
import { CreateNotificationModal } from '@/features/notificacoes/components/CreateNotificationModal';

export const NotificacoesPage = () => {
  const { user, tenantId } = useAuth();
  const {
    notifications,
    loadNotifications,
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
              {notifications.map((n) => (
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
