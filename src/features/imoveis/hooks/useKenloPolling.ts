/**
 * Hook para gerenciar o polling global do Kenlo
 * Inicia automaticamente quando o usuário está autenticado
 */

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { startPolling, stopPolling, isPollingRunning } from '../services/kenloPollingService';

export const useKenloPolling = () => {
  const { isAuthenticated, tenantId } = useAuth();
  const canPoll = isAuthenticated && !!tenantId && tenantId !== 'owner';

  useEffect(() => {
    if (!canPoll) {
      if (isPollingRunning()) stopPolling();
      return;
    }

    const tid = tenantId as string;
    const start = () => startPolling(tid);
    const stopIfRunning = () => {
      if (isPollingRunning()) stopPolling();
    };

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      stopIfRunning();
    } else {
      start();
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopIfRunning();
      } else {
        start();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [canPoll, tenantId]);
};
