/**
 * 📅 Google Calendar Connect Component
 * Botão para conectar/desconectar Google Calendar
 */

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { Calendar, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const GoogleCalendarConnect = () => {
  const {
    isConnected,
    isLoading,
    isSyncing,
    connectGoogleCalendar,
    disconnect,
    syncAllEvents
  } = useGoogleCalendar();

  if (isLoading) {
    return (
      <Card className="bg-card-dark border-border-subtle">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card-dark border-border-subtle">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Octo Agenda + Google</CardTitle>
              <CardDescription>
                Conecte sua conta Google para sincronizar a Octo Agenda com o Google Calendar
              </CardDescription>
            </div>
          </div>
          
          {isConnected ? (
            <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Conectado
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-gray-500/20 text-gray-400 border-gray-500/30 dark:text-slate-500">
              <XCircle className="w-3 h-3 mr-1" />
              Desconectado
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isConnected ? (
          <>
            <div className="bg-bg-secondary/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    Sincronização Ativa
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    Seus eventos são automaticamente sincronizados com o Google Calendar
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    Sincronização Bidirecional
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    Eventos criados aqui aparecem no Google Calendar e vice-versa
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={syncAllEvents}
                disabled={isSyncing}
                variant="outline"
                className="flex-1"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sincronizar Agora
                  </>
                )}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    Desconectar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card-dark border-border-subtle">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">
                      Desconectar Google Calendar?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-400 dark:text-slate-500">
                      Seus eventos não serão mais sincronizados com o Google Calendar.
                      Os eventos já criados no Google Calendar não serão deletados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-bg-secondary border-border-subtle text-white hover:bg-bg-secondary/80">
                      Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={disconnect}
                      className="bg-red-500 hover:bg-red-600 text-white"
                    >
                      Desconectar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <>
            <div className="bg-bg-secondary/50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-gray-300">
                Conecte sua conta do Google para:
              </p>
              <ul className="space-y-2 text-xs text-gray-400 dark:text-slate-500">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Sincronizar eventos automaticamente</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Ver eventos da agenda no Google Calendar</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Receber notificações do Google</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Acessar eventos em qualquer dispositivo</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={connectGoogleCalendar}
              className="w-full bg-primary hover:bg-primary/90"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Conectar com Google (OAuth) — Octo Agenda
            </Button>

            <p className="text-xs text-gray-500 text-center dark:text-slate-400">
              Ao conectar, você autoriza o acesso ao seu Google Calendar para esta conta e tenant.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
