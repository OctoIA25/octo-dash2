/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Configurações
 * Rota: /configuracoes
 */

import { useEffect } from 'react';
import { ConfiguracoesSection } from '@/features/settings/components/ConfiguracoesSection';
import { ProcessedLead } from '@/data/realLeadsProcessor';

interface ConfiguracoesPageProps {
  leads: ProcessedLead[];
}

export const ConfiguracoesPage = ({ leads }: ConfiguracoesPageProps) => {
  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'configuracoes');
  }, []);

  return <ConfiguracoesSection leads={leads} />;
};

