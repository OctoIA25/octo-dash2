/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Cliente Proprietário
 * Rota: /cliente-proprietario/:subsection?
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GestaoSectionWithMetrics } from '@/components/sections/GestaoSectionWithMetrics';
import { ClienteProprietarioSubSection } from '@/components/AppSidebar';

interface ClienteProprietarioPageProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const ClienteProprietarioPage = ({ onRefresh, isRefreshing }: ClienteProprietarioPageProps) => {
  const { subsection } = useParams<{ subsection?: string }>();
  const navigate = useNavigate();
  
  // Estado para sub-abas de Proprietários (Vendedor/Locatário)
  const [activeProprietariosSubTab, setActiveProprietariosSubTab] = useState<'vendedor' | 'locatario'>(() => {
    const saved = localStorage.getItem('selectedProprietariosSubTab');
    return (saved as 'vendedor' | 'locatario') || 'vendedor';
  });
  
  // Validar e obter subsection
  const validSubsections: ClienteProprietarioSubSection[] = ['cliente-proprietario', 'estudo-mercado'];
  const activeSubsection: ClienteProprietarioSubSection = 
    (subsection && validSubsections.includes(subsection as ClienteProprietarioSubSection)) 
      ? subsection as ClienteProprietarioSubSection 
      : 'cliente-proprietario';

  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'cliente-proprietario');
    localStorage.setItem('selectedClienteProprietarioSubSection', activeSubsection);
  }, [activeSubsection]);

  // Redirecionar para subsection padrão se não especificada
  useEffect(() => {
    if (!subsection) {
      navigate('/cliente-proprietario/cliente-proprietario', { replace: true });
    }
  }, [subsection, navigate]);

  // Obter títulos
  const getSectionTitle = () => {
    if (activeSubsection === 'estudo-mercado') {
      return 'Estudo de Mercado';
    }
    return 'Visão Geral';
  };

  const getSectionSubtitle = () => {
    const subTitles: Record<ClienteProprietarioSubSection, string> = {
      'cliente-proprietario': 'Gestão de proprietários • Imóveis captados • Exclusividade • Valor de portfólio',
      'estudo-mercado': 'Análise de mercado • Precificação inteligente • Comparativo de região • Tendências'
    };
    return subTitles[activeSubsection];
  };

  return (
    <GestaoSectionWithMetrics 
      activeDashboardSection="proprietarios"
      activeLeadsSubSection="venda"
      activeVendaSubTab="comprador"
      onVendaSubTabChange={() => {}}
      activeProprietariosSubSection={activeSubsection === 'estudo-mercado' ? 'estudo-mercado' : activeProprietariosSubTab}
      onProprietariosSubSectionChange={(section) => {
        if (section === 'estudo-mercado') {
          navigate('/cliente-proprietario/estudo-mercado');
        } else {
          setActiveProprietariosSubTab(section as 'vendedor' | 'locatario');
          localStorage.setItem('selectedProprietariosSubTab', section);
        }
      }}
      activeClienteInteressadoSubSection="geral"
      currentSectionTitle={getSectionTitle()}
      currentSectionSubtitle={getSectionSubtitle()}
    />
  );
};

