/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Corretores Gráficos
 * Rota: /corretores
 */

import { useEffect } from 'react';
import { GestaoSection } from '@/components/sections/GestaoSection';
import { ProcessedLead } from '@/data/realLeadsProcessor';

interface CorretoresPageProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const CorretoresPage = ({ leads, onRefresh, isRefreshing }: CorretoresPageProps) => {
  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'gestao-equipe');
    localStorage.setItem('selectedGestaoEquipeSubSection', 'corretores');
  }, []);

  return (
    <GestaoSection 
      leads={leads}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      activeDashboardSection="corretores"
      activeLeadsSubSection="venda"
      activeVendaSubTab="comprador"
      onVendaSubTabChange={() => {}}
      activeProprietariosSubSection="vendedor"
      onProprietariosSubSectionChange={() => {}}
      activeClienteInteressadoSubSection="geral"
      currentSectionTitle="Corretores Gráficos"
      currentSectionSubtitle="Performance individual • Leads atribuídos • Taxa de conversão • Visitas e negociações • Vendas finalizadas"
    />
  );
};

