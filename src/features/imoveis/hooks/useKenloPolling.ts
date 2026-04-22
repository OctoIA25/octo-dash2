/**
 * Hook para gerenciar o polling global do Kenlo
 * Inicia automaticamente quando o usuário está autenticado
 */

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { startPolling, stopPolling, isPollingRunning } from '../services/kenloPollingService';

export const useKenloPolling = () => {
  const { isAuthenticated, tenantId } = useAuth();

  useEffect(() => {
    if (isAuthenticated && tenantId && tenantId !== 'owner') {
      // Sempre pedir para iniciar: o próprio startPolling evita duplicar interval
      startPolling(tenantId);
    }
  }, [isAuthenticated, tenantId]);

  // Parar polling quando deslogar
  useEffect(() => {
    if (!isAuthenticated && isPollingRunning()) {
      stopPolling();
    }
  }, [isAuthenticated]);
};
