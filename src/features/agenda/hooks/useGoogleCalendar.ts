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
  deleteGoogleCalendarEvent,
  agendaEventoToGoogleEvent,
  saveGoogleTokens,
  exchangeCodeForTokens,
  listGoogleCalendarEvents,
  getPriorityFromColorId,
  GoogleCalendarEvent
} from '../services/googleCalendarService';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

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
  const syncEvent = useCallback(async (evento: any, action: 'create' | 'update' | 'delete') => {
    if (!user?.id || !tenantId || !isConnected) return;

    try {
      const accessToken = await getValidAccessToken(user.id, tenantId);
      if (!accessToken) {
        toast.error('Token do Google Calendar expirado. Reconecte.');
        setIsConnected(false);
        return;
      }

      const googleEvent = agendaEventoToGoogleEvent(evento, tenantId);

      if (action === 'create') {
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
        await updateGoogleCalendarEvent(accessToken, evento.google_event_id, googleEvent);
      } else if (action === 'delete' && evento.google_event_id) {
        await deleteGoogleCalendarEvent(accessToken, evento.google_event_id);
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar evento:', error);
      // Não mostrar toast para não poluir UI
    }
  }, [user?.id, tenantId, user?.email, isConnected]);

  /**
   * Sincronizar todos os eventos (Bidirecional: CRM -> Google e Google -> CRM)
   */
  const syncAllEvents = useCallback(async () => {
    if (!user?.id || !tenantId || !user?.email || !isConnected) return;

    setIsSyncing(true);
    
    try {
      const accessToken = await getValidAccessToken(user.id, tenantId);
      if (!accessToken) {
        toast.error('Token expirado. Reconecte ao Google Calendar.');
        setIsConnected(false);
        setIsSyncing(false);
        return;
      }

      let exportCount = 0;
      let importCount = 0;

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
      const googleEvents = await listGoogleCalendarEvents(accessToken);
      
      // Buscar todos os eventos do usuário no período para evitar duplicatas
      const { data: eventosExistentes } = await supabase
        .from('agenda_eventos')
        .select('google_event_id, id')
        .eq('tenant_id', tenantId)
        .eq('corretor_email', user.email)
        .not('google_event_id', 'is', null);

      const googleEventIdsExistentes = new Set(eventosExistentes?.map(e => e.google_event_id) || []);

      for (const gEvent of googleEvents) {
        // Ignorar eventos cancelados ou já existentes
        if (gEvent.status === 'cancelled' || (gEvent.id && googleEventIdsExistentes.has(gEvent.id))) {
          continue;
        }

        // Ignorar eventos que já têm ID do sistema nas propriedades estendidas (evitar loop)
        const octoEventId = gEvent.extendedProperties?.private?.octo_event_id;
        if (octoEventId) {
          // Apenas garantir que o link está correto no banco
          const { error: updateError } = await supabase
            .from('agenda_eventos')
            .update({ google_event_id: gEvent.id, google_calendar_synced: true })
            .eq('id', octoEventId)
            .eq('tenant_id', tenantId)
            .is('google_event_id', null); // Só atualiza se estiver nulo
            
          continue;
        }

        // Criar novo evento no CRM
        try {
          const start = gEvent.start.dateTime || gEvent.start.date;
          if (!start) continue;

          const dataEvento = new Date(start);
          const horario = gEvent.start.dateTime 
            ? dataEvento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : null;

          const novoEvento = {
            tenant_id: tenantId,
            corretor_email: user.email,
            corretor_id: user.id,
            titulo: gEvent.summary || '(Sem título)',
            descricao: gEvent.description || null,
            data: dataEvento.toISOString().split('T')[0],
            horario: horario,
            tipo: 'outro', // Padrão para eventos importados
            status: 'confirmado',
            prioridade: getPriorityFromColorId(gEvent.colorId),
            recorrencia: 'nenhuma',
            google_event_id: gEvent.id,
            google_calendar_synced: true
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

      if (exportCount > 0 || importCount > 0) {
        toast.success(`Sincronização concluída: ${exportCount} enviados, ${importCount} recebidos`);
      } else {
        toast.success('Agenda sincronizada com sucesso');
      }

    } catch (error: any) {
      console.error('Erro ao sincronizar eventos:', error);
      toast.error(`Erro ao sincronizar: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [user?.id, tenantId, user?.email, isConnected]);

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
