/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Métricas
 * Rota: /metricas/:subsection/:subsubsection?
 * 
 * Consolida Cliente Interessado, Cliente Proprietário e Corretores Gráficos
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GestaoSectionWithMetrics } from '@/components/sections/GestaoSectionWithMetrics';
import { MetricasSubSection, ClienteInteressadoSubSection, ClienteProprietarioSubSection } from '@/components/FixedSidebar';

import { BolsaoSection } from '@/features/leads/components/BolsaoSection';
import { PropostaPage } from '@/features/leads/pages/PropostaPage';

interface MetricasPageProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const MetricasPage = ({ onRefresh, isRefreshing }: MetricasPageProps) => {
  const { subsection, subsubsection } = useParams<{ subsection?: string; subsubsection?: string }>();
  const navigate = useNavigate();
  
  // Validar e obter subsection
  const validSubsections: MetricasSubSection[] = ['cliente-interessado', 'cliente-proprietario', 'bolsao', 'proposta'];
  const activeSubsection: MetricasSubSection = 
    (subsection && validSubsections.includes(subsection as MetricasSubSection)) 
      ? subsection as MetricasSubSection 
      : 'cliente-interessado';

  // Validar e obter sub-subsection para Cliente Interessado
  const validClienteInteressadoSubSections: ClienteInteressadoSubSection[] = ['geral', 'pre-atendimento', 'atendimento'];
  const activeClienteInteressadoSubSection: ClienteInteressadoSubSection = 
    (subsubsection && validClienteInteressadoSubSections.includes(subsubsection as ClienteInteressadoSubSection)) 
      ? subsubsection as ClienteInteressadoSubSection 
      : 'geral';

  // Validar e obter sub-subsection para Cliente Proprietário
  const validClienteProprietarioSubSections: ClienteProprietarioSubSection[] = ['cliente-proprietario', 'estudo-mercado'];
  const activeClienteProprietarioSubSection: ClienteProprietarioSubSection = 
    (subsubsection && validClienteProprietarioSubSections.includes(subsubsection as ClienteProprietarioSubSection)) 
      ? subsubsection as ClienteProprietarioSubSection 
      : 'cliente-proprietario';

  // Estado para sub-abas de Proprietários (Vendedor/Locatário) - usado apenas na visão geral
  const [activeProprietariosSubTab, setActiveProprietariosSubTab] = useState<'vendedor' | 'locatario'>(() => {
    const saved = localStorage.getItem('selectedProprietariosSubTab');
    return (saved as 'vendedor' | 'locatario') || 'vendedor';
  });

  // Estado para filtro Venda/Locação em Cliente Interessado
  const [activeLeadsSubSection, setActiveLeadsSubSection] = useState<'venda' | 'locacao' | 'todos'>('venda');

  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'metricas');
    localStorage.setItem('selectedMetricasSubSection', activeSubsection);
    if (activeSubsection === 'cliente-interessado') {
      localStorage.setItem('selectedClienteInteressadoSubSection', activeClienteInteressadoSubSection);
    } else if (activeSubsection === 'cliente-proprietario') {
      localStorage.setItem('selectedClienteProprietarioSubSection', activeClienteProprietarioSubSection);
    }
  }, [activeSubsection, activeClienteInteressadoSubSection, activeClienteProprietarioSubSection]);

  // Redirecionar para subsection padrão se não especificada
  useEffect(() => {
    if (!subsection) {
      navigate('/metricas/cliente-interessado/geral', { replace: true });
    } else if (activeSubsection === 'cliente-interessado' && !subsubsection) {
      navigate(`/metricas/cliente-interessado/geral`, { replace: true });
    } else if (activeSubsection === 'cliente-proprietario' && !subsubsection) {
      navigate(`/metricas/cliente-proprietario/cliente-proprietario`, { replace: true });
    }
  }, [subsection, subsubsection, activeSubsection, navigate]);

  // Obter configurações baseadas na subsection
  const getPageConfig = () => {
    switch (activeSubsection) {
      case 'cliente-interessado':
        const subTitles: Record<ClienteInteressadoSubSection, string> = {
          'geral': 'Análise completa de leads interessados • Performance de corretores • Funil de conversão • Métricas em tempo real',
          'pre-atendimento': 'Leads aguardando primeiro contato • Priorização por temperatura • Distribuição para corretores',
          'atendimento': 'Leads em atendimento ativo • Histórico de interações • Visitas agendadas • Negociações em andamento'
        };
        const subTitlesLabels: Record<ClienteInteressadoSubSection, string> = {
          'geral': 'Cliente Interessado - Geral',
          'pre-atendimento': 'Cliente Interessado - Pré-Atendimento',
          'atendimento': 'Cliente Interessado - Atendimento'
        };
        return {
          section: 'leads' as const,
          title: subTitlesLabels[activeClienteInteressadoSubSection],
          subtitle: subTitles[activeClienteInteressadoSubSection],
          clienteInteressadoSubSection: activeClienteInteressadoSubSection,
          clienteProprietarioSubSection: 'cliente-proprietario' as const
        };
      
      case 'cliente-proprietario':
        const proprietarioSubTitles: Record<ClienteProprietarioSubSection, string> = {
          'cliente-proprietario': 'Gestão de proprietários • Imóveis captados • Exclusividade • Valor de portfólio',
          'estudo-mercado': 'Análise de mercado • Precificação inteligente • Comparativo de região • Tendências'
        };
        const proprietarioLabels: Record<ClienteProprietarioSubSection, string> = {
          'cliente-proprietario': 'Cliente Proprietário - Visão Geral',
          'estudo-mercado': 'Cliente Proprietário - Estudo de Mercado'
        };
        return {
          section: 'proprietarios' as const,
          title: proprietarioLabels[activeClienteProprietarioSubSection],
          subtitle: proprietarioSubTitles[activeClienteProprietarioSubSection],
          clienteInteressadoSubSection: 'geral' as const,
          clienteProprietarioSubSection: activeClienteProprietarioSubSection
        };
      
      default:
        return {
          section: 'leads' as const,
          title: 'Comercial',
          subtitle: 'Análise completa de métricas e desempenho',
          clienteInteressadoSubSection: 'geral' as const,
          clienteProprietarioSubSection: 'cliente-proprietario' as const
        };
    }
  };

  const config = getPageConfig();

  if (activeSubsection === 'bolsao') {
    return (
      <BolsaoSection />
    );
  }

  if (activeSubsection === 'proposta') {
    return <PropostaPage />;
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Conteúdo principal - tabs são controladas pelo header superior */}
      <div className="flex-1 overflow-auto">
        <GestaoSectionWithMetrics 
          activeDashboardSection={config.section}
          activeLeadsSubSection={activeLeadsSubSection}
          onLeadsSubSectionChange={setActiveLeadsSubSection}
          activeVendaSubTab="comprador"
          onVendaSubTabChange={() => {}}
          activeProprietariosSubSection={
            activeSubsection === 'cliente-proprietario' && activeClienteProprietarioSubSection === 'estudo-mercado' 
              ? 'estudo-mercado' 
              : activeProprietariosSubTab
          }
          onProprietariosSubSectionChange={(section) => {
            if (activeSubsection === 'cliente-proprietario') {
              if (section === 'estudo-mercado') {
                navigate('/metricas/cliente-proprietario/estudo-mercado');
              } else {
                setActiveProprietariosSubTab(section as 'vendedor' | 'locatario');
                localStorage.setItem('selectedProprietariosSubTab', section);
              }
            }
          }}
          activeClienteInteressadoSubSection={config.clienteInteressadoSubSection}
          currentSectionTitle={config.title}
          currentSectionSubtitle={config.subtitle}
        />
      </div>
    </div>
  );
};

