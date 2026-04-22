/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Equipe
 * Rota: /equipe
 */

import { useEffect } from 'react';
import { EquipeSection } from '../components/EquipeSection';
import { ProcessedLead } from '@/data/realLeadsProcessor';

interface EquipePageProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const EquipePage = ({ leads, onRefresh, isRefreshing }: EquipePageProps) => {
  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'gestao-equipe');
    localStorage.setItem('selectedGestaoEquipeSubSection', 'corretores');
  }, []);

  return (
    <EquipeSection 
      leads={leads}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
    />
  );
};

