/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Bolsão
 * Rota: /bolsao
 */

import { useEffect } from 'react';
import { BolsaoSection } from '../components/BolsaoSection';
import { ProcessedLead } from '@/data/realLeadsProcessor';

interface BolsaoPageProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const BolsaoPage = ({ leads, onRefresh, isRefreshing }: BolsaoPageProps) => {
  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'bolsao');
  }, []);

  return (
    <BolsaoSection 
      leads={leads}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
    />
  );
};

