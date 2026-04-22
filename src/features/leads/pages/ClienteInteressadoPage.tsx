/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Cliente Interessado
 * Rota: /cliente-interessado/:subsection?
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GestaoSectionWithMetrics } from '@/components/sections/GestaoSectionWithMetrics';
import { ClienteInteressadoSubSection, LeadsSubSection } from '@/shared/types';

interface ClienteInteressadoPageProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const ClienteInteressadoPage = ({ onRefresh, isRefreshing }: ClienteInteressadoPageProps) => {
  const { subsection } = useParams<{ subsection?: string }>();
  const navigate = useNavigate();
  
  // Estado para controlar o filtro Venda/Locação
  const [businessType, setBusinessType] = useState<LeadsSubSection>('venda');
  
  // Validar e obter subsection
  const validSubsections: ClienteInteressadoSubSection[] = ['geral', 'pre-atendimento', 'bolsao', 'atendimento'];
  const activeSubsection: ClienteInteressadoSubSection = 
    (subsection && validSubsections.includes(subsection as ClienteInteressadoSubSection)) 
      ? subsection as ClienteInteressadoSubSection 
      : 'geral';

  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'cliente-interessado');
    localStorage.setItem('selectedClienteInteressadoSubSection', activeSubsection);
  }, [activeSubsection]);

  // Redirecionar para subsection padrão se não especificada
  useEffect(() => {
    if (!subsection) {
      navigate('/cliente-interessado/geral', { replace: true });
    }
  }, [subsection, navigate]);

  // Obter títulos
  const getSectionTitle = () => {
    const titles: Record<ClienteInteressadoSubSection, string> = {
      'geral': 'Gestão',
      'pre-atendimento': 'Pré-Atendimento',
      'bolsao': 'Bolsão de Imóveis',
      'atendimento': 'Atendimento'
    };
    return titles[activeSubsection];
  };

  const getSectionSubtitle = () => {
    const subTitles: Record<ClienteInteressadoSubSection, string> = {
      'geral': 'Análise completa de leads interessados • Performance de corretores • Funil de conversão • Métricas em tempo real',
      'pre-atendimento': 'Leads aguardando primeiro contato • Priorização por temperatura • Distribuição para corretores',
      'bolsao': 'Leads sem imóvel definido • Oportunidades de captação • Preferências e perfil do cliente',
      'atendimento': 'Leads em atendimento ativo • Histórico de interações • Visitas agendadas • Negociações em andamento'
    };
    return subTitles[activeSubsection];
  };

  return (
    <GestaoSectionWithMetrics 
      activeDashboardSection="leads"
      activeLeadsSubSection={businessType}
      activeVendaSubTab="comprador"
      onLeadsSubSectionChange={(type) => setBusinessType(type)}
      onVendaSubTabChange={() => {}}
      activeProprietariosSubSection="vendedor"
      onProprietariosSubSectionChange={() => {}}
      activeClienteInteressadoSubSection={activeSubsection}
      currentSectionTitle={getSectionTitle()}
      currentSectionSubtitle={getSectionSubtitle()}
    />
  );
};

