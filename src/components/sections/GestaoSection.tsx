import { ProcessedLead } from '@/data/realLeadsProcessor';
import { MainMetricsSection } from '@/features/metricas/components/MainMetricsSection';
import { LeadsTable } from '@/features/leads/components/LeadsTable';
import { BolsaoSection } from '@/features/leads/components/BolsaoSection';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RefreshCw, BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { 
  DashboardSubSection, 
  LeadsSubSection, 
  ProprietariosSubSection, 
  ClienteInteressadoSubSection, 
  ClienteProprietarioSubSection 
} from '@/shared/types';

interface GestaoSectionProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  activeDashboardSection?: DashboardSubSection;
  activeLeadsSubSection?: LeadsSubSection;
  onLeadsSubSectionChange?: (section: LeadsSubSection) => void;
  activeVendaSubTab?: 'comprador' | 'vendedor';
  onVendaSubTabChange?: (tab: 'comprador' | 'vendedor') => void;
  activeProprietariosSubSection?: ProprietariosSubSection | ClienteProprietarioSubSection;
  onProprietariosSubSectionChange?: (section: ProprietariosSubSection | ClienteProprietarioSubSection) => void;
  activeClienteInteressadoSubSection?: ClienteInteressadoSubSection;
  currentSectionTitle?: string;
  currentSectionSubtitle?: string;
}

export const GestaoSection = ({ 
  leads, 
  onRefresh, 
  isRefreshing,
  activeDashboardSection = 'leads',
  activeLeadsSubSection = 'venda',
  onLeadsSubSectionChange,
  activeVendaSubTab = 'comprador',
  onVendaSubTabChange,
  activeProprietariosSubSection = 'vendedor',
  onProprietariosSubSectionChange,
  activeClienteInteressadoSubSection = 'geral',
  currentSectionTitle = 'Gestão',
  currentSectionSubtitle = 'Dashboard completo de métricas e análises'
}: GestaoSectionProps) => {

  // Filtrar leads baseado na aba ativa
  const filteredLeads = useMemo(() => {

    // OUTRAS ABAS (corretores, imóveis, proprietários): Também mostrar todos
    if (activeDashboardSection !== 'leads') {
      return leads || [];
    }

    // ABA LEADS: Filtrar por sub-seção
    if (!leads || leads.length === 0) {
      return [];
    }

    let filtered: ProcessedLead[] = [];

    // Se estiver em PRÉ-ATENDIMENTO ou ATENDIMENTO, usar apenas activeLeadsSubSection
    if (activeClienteInteressadoSubSection === 'pre-atendimento' || activeClienteInteressadoSubSection === 'atendimento') {
      if (activeLeadsSubSection === 'venda') {
        filtered = leads.filter(lead => {
          const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
          const tipoLead = lead.tipo_lead?.toLowerCase() || '';
          return tipoNegocio.includes('compra') || tipoLead.includes('comprador');
        });
        
        // Se não houver leads de comprador, retornar array vazio
        // Removido: leads de exemplo não são mais adicionados
      } else if (activeLeadsSubSection === 'locacao') {
        filtered = leads.filter(lead => {
          const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
          const tipoLead = lead.tipo_lead?.toLowerCase() || '';
          return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao') ||
                 tipoLead.includes('locatário') || tipoLead.includes('locatario') ||
                 tipoLead.includes('inquilino');
        });
        
        // Se não houver leads de locação, retornar array vazio
        // Removido: leads de exemplo não são mais adicionados
      } else {
        // Todos os leads
        filtered = leads;
      }
    }
    // LOCAÇÃO (aba tradicional)
    else if (activeLeadsSubSection === 'locacao') {
      filtered = leads.filter(lead => {
        const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
        const tipoLead = lead.tipo_lead?.toLowerCase() || '';
        return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao') ||
               tipoLead.includes('locatário') || tipoLead.includes('locatario') ||
               tipoLead.includes('inquilino');
      });
      
      // Se não houver leads de locação, retornar array vazio
      // Removido: leads de exemplo não são mais adicionados
    }
    // VENDA (aba tradicional com Comprador ou Vendedor)
    else if (activeLeadsSubSection === 'venda') {
      if (activeVendaSubTab === 'comprador') {
        filtered = leads.filter(lead => {
          const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
          const tipoLead = lead.tipo_lead?.toLowerCase() || '';
          return tipoNegocio.includes('compra') || tipoLead.includes('comprador');
        });
        
        // Se não houver leads de comprador, retornar array vazio
        // Removido: leads de exemplo não são mais adicionados
      } else if (activeVendaSubTab === 'vendedor') {
        filtered = leads.filter(lead => {
          const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
          const tipoLead = lead.tipo_lead?.toLowerCase() || '';
          return tipoNegocio.includes('venda') || 
                 tipoNegocio.includes('vender') ||
                 tipoLead.includes('vendedor') ||
                 tipoLead.includes('proprietário') ||
                 tipoLead.includes('proprietario');
        });
        
        // Se não houver leads de vendedor, retornar array vazio
        // Removido: leads de exemplo não são mais adicionados
      } else {
        // Fallback: todos
        filtered = leads;
      }
    }
    // TODOS (default)
    else {
      filtered = leads;
    }

    return filtered;
  }, [leads, activeDashboardSection, activeClienteInteressadoSubSection, activeLeadsSubSection, activeVendaSubTab]);

  // Função para lidar com movimentação de leads
  const handleLeadMove = (leadId: number, newEtapa: string, newCorretor: string) => {
    // TODO: Implementar a lógica de movimentação do lead
  };

  // Se a sub-aba ativa for Bolsão, renderizar o BolsaoSection
  if (activeDashboardSection === 'leads' && activeClienteInteressadoSubSection === 'bolsao') {
    return <BolsaoSection />;
  }

  // Se a sub-aba ativa for Estudo de Mercado, mostrar iframe
  if (activeDashboardSection === 'proprietarios' && activeProprietariosSubSection === 'estudo-mercado') {
    return (
      <div className="w-full h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <iframe 
          src="https://octodash-estudodemercadoocto.fltgo5.easypanel.host/" 
          className="w-full h-full border-0"
          title="Estudo de Mercado"
          allow="fullscreen"
        />
      </div>
    );
  }

  // Dashboard completa de gestão com fundo limpo e transições harmônicas
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-slate-950 overflow-x-hidden transition-all duration-300 ease-in-out">
      <SectionHeader
        title={currentSectionTitle}
        subtitle={currentSectionSubtitle}
        icon={BarChart3}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        showRefresh={true}
      />
      <div className="w-full overflow-x-hidden transition-all duration-300 ease-in-out">
        {/* Dashboard principal com todas as métricas - TRANSIÇÕES HARMÔNICAS */}
        <MainMetricsSection 
          leads={leads} 
          activeSection={activeDashboardSection}
          activeLeadsSubSection={activeLeadsSubSection}
          onLeadsSubSectionChange={onLeadsSubSectionChange}
          activeVendaSubTab={activeVendaSubTab}
          onVendaSubTabChange={onVendaSubTabChange}
          activeProprietariosSubSection={activeProprietariosSubSection as any}
          onProprietariosSubSectionChange={onProprietariosSubSectionChange as any}
          activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
        />
        
        {/* Tabelas - SEMPRE exibir (mas com leads filtrados ou todos conforme a aba), exceto em estudo-mercado */}
        {!(activeDashboardSection === 'proprietarios' && activeProprietariosSubSection === 'estudo-mercado') &&
          !(activeDashboardSection === 'leads' && (activeClienteInteressadoSubSection === 'pre-atendimento' || activeClienteInteressadoSubSection === 'atendimento')) && (
          <div className="pb-4 transition-all duration-300 ease-in-out">
            <LeadsTable 
              leads={filteredLeads}
              showCorretorAssignment={activeDashboardSection === 'leads' && activeLeadsSubSection === 'venda' && activeVendaSubTab === 'vendedor'}
            />
          </div>
        )}
      </div>
    </div>
  );
};
