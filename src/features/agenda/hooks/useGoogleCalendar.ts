/**
 * 📅 Hook useGoogleCalendar
 * Gerencia integração com Google Calendar de forma multitenant
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  getGoogleAuthUrl,
  getValidAccessToken,
  isGoogleCalendarConnected,
  disconnectGoogleCalendar,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  agendaEventoToGoogleEvent,
  saveGoogleTokens,
  exchangeCodeForTokens,
  listGoogleCalendarEvents,
  getPriorityFromColorId,
  GoogleCalendarEvent
} from '../services/googleCalendarService';
import {
  removerTarefaSemanalDaAgenda,
  sincronizarTarefaSemanalDaAgenda
} from '../services/tarefasAgendaSyncService';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

type SyncAllEventsOptions = {
  silent?: boolean;
  minIntervalMs?: number;
};

const lastSilentSyncByUserTenant = new Map<string, number>();
const STATUS_CONCLUIDO_REGEX = /^\[Conclu[ií]do\]\s*/i;
const STATUS_CONCLUIDO_DESCRICAO_REGEX = /^Status:\s*Conclu[ií]do/im;

const formatDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const googleEventToAgendaPayload = (
  gEvent: GoogleCalendarEvent,
  status?: string,
  prioridade?: string
) => {
  const start = gEvent.start.dateTime || gEvent.start.date;
  if (!start) return null;

  let data = gEvent.start.date;
  let horario: string | null = null;

  if (gEvent.start.dateTime) {
    const dataEvento = new Date(gEvent.start.dateTime);
    if (Number.isNaN(dataEvento.getTime())) return null;

    data = formatDateInputValue(dataEvento);
    horario = dataEvento.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (!data) return null;

  const titulo = String(gEvent.summary || '(Sem título)').replace(STATUS_CONCLUIDO_REGEX, '') || '(Sem título)';
  const estaConcluidoNoGoogle = STATUS_CONCLUIDO_REGEX.test(gEvent.summary || '')
    || STATUS_CONCLUIDO_DESCRICAO_REGEX.test(gEvent.description || '');
  const statusFinal = estaConcluidoNoGoogle ? 'concluido' : status;
  const descricao = (gEvent.description || '')
    .replace(STATUS_CONCLUIDO_DESCRICAO_REGEX, '')
    .trim() || null;

  return {
    titulo,
    descricao,
    data,
    horario,
    prioridade: prioridade ?? getPriorityFromColorId(gEvent.colorId),
    recorrencia: 'nenhuma',
    google_calendar_synced: true,
    ...(statusFinal ? { status: statusFinal } : {}),
  };
};

export const useGoogleCalendar = () => {
  const { user, tenantId } = useAuthContext();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Verificar se está conectado ao carregar - executa quando user ou tenantId muda
  useEffect(() => {
    const userId = user?.id;
    const effectTenantId = tenantId;
    
    
    if (!userId || !tenantId) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    const checkConnectionInternal = async () => {
      try {
        setIsLoading(true);
        const connected = await isGoogleCalendarConnected(userId, tenantId);
        setIsConnected(connected);
      } catch (error) {
        console.error('Erro ao verificar conexão:', error);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnectionInternal();
  }, [user, tenantId]);

  // Função exportável para re-verificar conexão manualmente
  const checkConnection = useCallback(async () => {
    if (!user?.id || !tenantId) {
      setIsConnected(false);
      return;
    }
    try {
      setIsLoading(true);
      const connected = await isGoogleCalendarConnected(user.id, tenantId);
      setIsConnected(connected);
    } catch (error) {
      console.error('Erro ao verificar conexão:', error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, tenantId]);

  /**
   * Iniciar processo de autenticação OAuth (multitenant: tokens por user_id + tenant_id)
   */
  const connectGoogleCalendar = useCallback(() => {
    if (!user?.id || !tenantId) {
      toast.error('Usuário não autenticado');
      return;
    }
    if (tenantId === 'owner') {
      toast.error('Selecione uma imobiliária antes de conectar o Google Agenda.');
      return;
    }

    try {
      const authUrl = getGoogleAuthUrl(user.id, tenantId);
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        authUrl,
        'Google Calendar OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Se o popup foi bloqueado, redirecionar na mesma aba (funciona sempre)
      if (!popup || popup.closed) {
        toast.info('Abrindo Google para selecionar a conta...');
        window.location.href = authUrl;
        return;
      }

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS') {
          const { code } = event.data;
          try {
            const tokens = await exchangeCodeForTokens(code);
            await saveGoogleTokens(user.id, tenantId, tokens);
            if (tenantId && tenantId !== 'owner') {
              await supabase
                .from('agenda_eventos')
                .update({ google_calendar_synced: true })
                .eq('tenant_id', tenantId)
                .eq('corretor_email', user.email);
            }
            setIsConnected(true);
            toast.success('Google Calendar conectado com sucesso!');
            await syncAllEvents();
          } catch (error: any) {
            console.error('Erro ao conectar:', error);
            toast.error(error?.message ?? 'Erro ao conectar com Google Calendar');
          }
          popup?.close();
          window.removeEventListener('message', handleMessage);
          clearInterval(closeCheck);
        } else if (event.data?.type === 'GOOGLE_OAUTH_ERROR') {
          toast.error('Erro ao conectar com Google Calendar');
          popup?.close();
          window.removeEventListener('message', handleMessage);
          clearInterval(closeCheck);
        }
      };

      window.addEventListener('message', handleMessage);
      const closeCheck = setInterval(() => {
        if (popup?.closed) {
          window.removeEventListener('message', handleMessage);
          clearInterval(closeCheck);
        }
      }, 500);
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao abrir autorização Google');
    }
  }, [user?.id, tenantId, user?.email]);

  /**
   * Desconectar Google Calendar
   */
  const disconnect = useCallback(async () => {
    if (!user?.id || !tenantId) return;

    try {
      await disconnectGoogleCalendar(user.id, tenantId);
      setIsConnected(false);
      toast.success('Google Calendar desconectado');
    } catch (error: any) {
      console.error('Erro ao desconectar:', error);
      toast.error(`Erro ao desconectar: ${error.message}`);
    }
  }, [user?.id, tenantId]);

  /**
   * Sincronizar evento específico com Google Calendar
   */
  const syncEvent = useCallback(async (evento: any, action: 'create' | 'update' | 'delete'): Promise<boolean> => {
    if (!user?.id || !tenantId || !isConnected) return false;

    try {
      const accessToken = await getValidAccessToken(user.id, tenantId);
      if (!accessToken) {
        toast.error('Token do Google Calendar expirado. Reconecte.');
        setIsConnected(false);
        return false;
      }

      if (action === 'create') {
        const googleEvent = agendaEventoToGoogleEvent(evento, tenantId);
        const googleEventId = await createGoogleCalendarEvent(accessToken, googleEvent);
        
        // Salvar google_event_id no Supabase
        if (tenantId && tenantId !== 'owner') {
          await supabase
            .from('agenda_eventos')
            .update({ 
              google_event_id: googleEventId,
              google_calendar_synced: true 
            })
            .eq('id', evento.id)
            .eq('tenant_id', tenantId);
        }
        
      } else if (action === 'update' && evento.google_event_id) {
        const googleEvent = agendaEventoToGoogleEvent(evento, tenantId);
        await updateGoogleCalendarEvent(accessToken, evento.google_event_id, googleEvent);
      } else if (action === 'delete' && evento.google_event_id) {
            console.log("Erro");
      }

      return true;
    } catch (error: any) {
      console.error('Erro ao sincronizar evento:', error);
      // Não mostrar toast para não poluir UI
      return false;
    }
  }, [user?.id, tenantId, user?.email, isConnected]);

  /**
   * Sincronizar todos os eventos (Bidirecional: CRM -> Google e Google -> CRM)
   */
  const syncAllEvents = useCallback(async (options?: SyncAllEventsOptions) => {
    if (!user?.id || !tenantId || !user?.email) return;

    const silent = options?.silent ?? false;
    if (silent) {
      const now = Date.now();
      const minIntervalMs = options?.minIntervalMs ?? 60_000;
      const syncKey = `${user.id}:${tenantId}`;
      const lastSilentSyncAt = lastSilentSyncByUserTenant.get(syncKey) ?? 0;

      if (now - lastSilentSyncAt < minIntervalMs) return;
      lastSilentSyncByUserTenant.set(syncKey, now);
    }

    setIsSyncing(true);
    
    try {
      const accessToken = await getValidAccessToken(user.id, tenantId);
      if (!accessToken) {
        if (!silent) {
          toast.error('Token expirado. Reconecte ao Google Calendar.');
        }
        setIsConnected(false);
        setIsSyncing(false);
        return;
      }

      let exportCount = 0;
      let importCount = 0;
      let updateCount = 0;

      // 1. CRM -> Google: Exportar eventos sem google_event_id
      const { data: eventosParaExportar, error: errorExport } = await supabase
        .from('agenda_eventos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('corretor_email', user.email)
        .is('google_event_id', null);

      if (errorExport) throw errorExport;

      if (eventosParaExportar && eventosParaExportar.length > 0) {
        for (const evento of eventosParaExportar) {
          try {
            const googleEvent = agendaEventoToGoogleEvent(evento, tenantId);
            const googleEventId = await createGoogleCalendarEvent(accessToken, googleEvent);
            
            await supabase
              .from('agenda_eventos')
              .update({ 
                google_event_id: googleEventId,
                google_calendar_synced: true 
              })
              .eq('id', evento.id)
              .eq('tenant_id', tenantId);
            
            exportCount++;
          } catch (error) {
            console.error(`Erro ao exportar evento ${evento.id}:`, error);
          }
        }
      }

      // 2. Google -> CRM: Importar eventos do Google
      const syncStartDate = new Date();
      syncStartDate.setDate(syncStartDate.getDate() - 30);
      const googleEvents = await listGoogleCalendarEvents(accessToken, syncStartDate.toISOString());
      
      // Buscar todos os eventos do usuário no período para atualizar existentes e evitar duplicatas
      const { data: eventosExistentes } = await supabase
        .from('agenda_eventos')
        .select('google_event_id, id, status, prioridade, tipo')
        .eq('tenant_id', tenantId)
        .eq('corretor_email', user.email)
        .not('google_event_id', 'is', null);

      const eventosPorGoogleId = new Map(
        (eventosExistentes || [])
          .filter(evento => evento.google_event_id)
          .map(evento => [evento.google_event_id, evento])
      );

      for (const gEvent of googleEvents) {
        if (!gEvent.id) {
          continue;
        }

        const eventoExistente = eventosPorGoogleId.get(gEvent.id);
        const octoEventId = gEvent.extendedProperties?.private?.octo_event_id;

        if (gEvent.status === 'cancelled') {
          const eventoLocalId = eventoExistente?.id || octoEventId;

          if (eventoLocalId) {
            const { error: deleteError } = await supabase
              .from('agenda_eventos')
              .delete()
              .eq('id', eventoLocalId)
              .eq('tenant_id', tenantId)
              .eq('corretor_email', user.email);

            if (deleteError) {
              console.error('Erro ao remover evento cancelado do Google:', deleteError);
            } else {
              await removerTarefaSemanalDaAgenda(eventoLocalId, tenantId);
              updateCount++;
            }
          }

          continue;
        }

        if (eventoExistente) {
          const payload = googleEventToAgendaPayload(
            gEvent,
            eventoExistente.status || 'confirmado',
            eventoExistente.prioridade || undefined
          );
          if (!payload) continue;

          const { error: updateError } = await supabase
            .from('agenda_eventos')
            .update(payload)
            .eq('id', eventoExistente.id)
            .eq('tenant_id', tenantId)
            .eq('corretor_email', user.email);

          if (updateError) {
            console.error('Erro ao atualizar evento vindo do Google:', updateError);
          } else {
            if (eventoExistente.tipo === 'tarefa') {
              await sincronizarTarefaSemanalDaAgenda(eventoExistente.id, tenantId, payload);
            }
            updateCount++;
          }

          continue;
        }

        // Eventos que já têm ID do sistema nas propriedades estendidas devem atualizar o registro local.
        if (octoEventId) {
          const payload = googleEventToAgendaPayload(gEvent);
          if (!payload) continue;

          const { error: updateError } = await supabase
            .from('agenda_eventos')
            .update({
              ...payload,
              google_event_id: gEvent.id,
            })
            .eq('id', octoEventId)
            .eq('tenant_id', tenantId)
            .eq('corretor_email', user.email);

          if (updateError) {
            console.error('Erro ao vincular evento do Google ao evento local:', updateError);
          } else {
            await sincronizarTarefaSemanalDaAgenda(octoEventId, tenantId, payload);
            updateCount++;
          }

          continue;
        }

        // Criar novo evento no CRM
        try {
          const payload = googleEventToAgendaPayload(gEvent, 'confirmado');
          if (!payload) continue;

          const novoEvento = {
            tenant_id: tenantId,
            corretor_email: user.email,
            corretor_id: user.id,
            ...payload,
            tipo: 'outro', // Padrão para eventos importados
            google_event_id: gEvent.id,
          };

          const { error: insertError } = await supabase
            .from('agenda_eventos')
            .insert(novoEvento);

          if (insertError) {
            console.error('Erro ao importar evento do Google:', insertError);
          } else {
            importCount++;
          }
        } catch (error) {
          console.error('Erro ao processar evento do Google:', error);
        }
      }

      if (!silent) {
        if (exportCount > 0 || importCount > 0 || updateCount > 0) {
          toast.success(`Sincronização concluída: ${exportCount} enviados, ${updateCount} atualizados, ${importCount} recebidos`);
        } else {
          toast.success('Agenda sincronizada com sucesso');
        }
      }

    } catch (error: any) {
      console.error('Erro ao sincronizar eventos:', error);
      if (!silent) {
        toast.error(`Erro ao sincronizar: ${error.message}`);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [user?.id, tenantId, user?.email]);

  return {
    isConnected,
    isLoading,
    isSyncing,
    connectGoogleCalendar,
    disconnect,
    syncEvent,
    syncAllEvents,
    checkConnection
  };
};
