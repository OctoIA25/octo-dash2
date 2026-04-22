/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Hook: useRouteSync
 * Sincroniza sidebar com rotas do React Router
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  SidebarSection,
  MetricasSubSection,
  ClienteInteressadoSubSection, 
  ClienteProprietarioSubSection, 
  AgentesIaSubSection,
  EstudoMercadoSubSection
} from '@/components/FixedSidebar';

interface UseRouteSyncProps {
  onSectionChange: (section: SidebarSection) => void;
  onMetricasSubSectionChange?: (section: MetricasSubSection) => void;
  onClienteInteressadoSubSectionChange?: (section: ClienteInteressadoSubSection) => void;
  onClienteProprietarioSubSectionChange?: (section: ClienteProprietarioSubSection) => void;
  onAgentesIaSubSectionChange?: (section: AgentesIaSubSection) => void;
  onEstudoMercadoSubSectionChange?: (section: EstudoMercadoSubSection) => void;
}

export const useRouteSync = ({
  onSectionChange,
  onMetricasSubSectionChange,
  onClienteInteressadoSubSectionChange,
  onClienteProprietarioSubSectionChange,
  onAgentesIaSubSectionChange,
  onEstudoMercadoSubSectionChange
}: UseRouteSyncProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Sincronizar seção ativa com a rota atual
  useEffect(() => {
    const path = location.pathname;
    
    // Determinar seção baseada na rota
    if (path.startsWith('/leads')) {
      onSectionChange('leads');
    } else if (path.startsWith('/meus-leads')) {
      // Mantém "Comercial" ativo e seleciona subitem "Meus Leads"
      onSectionChange('metricas');
      onMetricasSubSectionChange?.('meus-leads');
    } else if (path.startsWith('/metricas')) {
      onSectionChange('metricas');
      
      // Extrair subsection da rota
      const parts = path.split('/');
      if (parts[2] && onMetricasSubSectionChange) {
        const subsection = parts[2] as MetricasSubSection;
        const validSubsections: MetricasSubSection[] = ['meus-leads', 'bolsao', 'cliente-interessado', 'cliente-proprietario', 'proposta'];
        if (validSubsections.includes(subsection)) {
          onMetricasSubSectionChange(subsection);
        }
      }
    } else if (path.startsWith('/proposta')) {
      onSectionChange('metricas');
      onMetricasSubSectionChange?.('proposta');
    } else if (path.startsWith('/bolsao')) {
      // Mantém "Comercial" ativo e seleciona subitem "Bolsão"
      onSectionChange('metricas');
      onMetricasSubSectionChange?.('bolsao');
    } else if (path.startsWith('/cliente-interessado')) {
      // Mantém "Comercial" ativo e seleciona subitem "Funil Cliente Interessado"
      onSectionChange('metricas');
      onMetricasSubSectionChange?.('cliente-interessado');
      
      // Extrair subsection da rota
      const parts = path.split('/');
      if (parts[2] && onClienteInteressadoSubSectionChange) {
        const subsection = parts[2] as ClienteInteressadoSubSection;
        const validSubsections: ClienteInteressadoSubSection[] = ['geral', 'pre-atendimento', 'atendimento'];
        if (validSubsections.includes(subsection)) {
          onClienteInteressadoSubSectionChange(subsection);
        }
      }
    } else if (path.startsWith('/cliente-proprietario')) {
      // Mantém "Comercial" ativo e seleciona subitem "Cliente Proprietário"
      onSectionChange('metricas');
      onMetricasSubSectionChange?.('cliente-proprietario');
      
      // Extrair subsection da rota
      const parts = path.split('/');
      if (parts[2] && onClienteProprietarioSubSectionChange) {
        const subsection = parts[2] as ClienteProprietarioSubSection;
        const validSubsections: ClienteProprietarioSubSection[] = ['cliente-proprietario', 'estudo-mercado'];
        if (validSubsections.includes(subsection)) {
          onClienteProprietarioSubSectionChange(subsection);
        }
      }
    } else if (path.startsWith('/estudo-mercado')) {
      onSectionChange('estudo-mercado');
      
      const parts = path.split('/');
      if (parts[2] && onEstudoMercadoSubSectionChange) {
        const sub = parts[2] as EstudoMercadoSubSection;
        const validSubs: EstudoMercadoSubSection[] = ['avaliacao', 'agente-ia', 'metricas'];
        if (validSubs.includes(sub)) {
          onEstudoMercadoSubSectionChange(sub);
        }
      }
    } else if (path.startsWith('/recrutamento')) {
      onSectionChange('recrutamento');
    } else if (path.startsWith('/gestao-equipe')) {
      onSectionChange('gestao-equipe');
    } else if (path.startsWith('/imoveis')) {
      onSectionChange('imoveis');
    } else if (path.startsWith('/agentes-ia')) {
      onSectionChange('agentes-ia');
      
      // Extrair agent da rota
      const parts = path.split('/');
      if (parts[2] && onAgentesIaSubSectionChange) {
        const agent = parts[2] as AgentesIaSubSection;
        const validAgents: AgentesIaSubSection[] = ['agente-marketing', 'agente-comportamental'];
        if (validAgents.includes(agent)) {
          onAgentesIaSubSectionChange(agent);
        }
      }
    } else if (path.startsWith('/octo-chat')) {
      onSectionChange('octo-chat');
    } else if (path.startsWith('/integracoes')) {
      onSectionChange('integracoes');
    } else if (path.startsWith('/central-leads')) {
      onSectionChange('central-leads');
    } else if (path.startsWith('/notificacoes')) {
      onSectionChange('notificacoes');
    } else if (path.startsWith('/configuracoes')) {
      onSectionChange('configuracoes');
    }
  }, [location.pathname, onSectionChange, onMetricasSubSectionChange, onClienteInteressadoSubSectionChange, onClienteProprietarioSubSectionChange, onAgentesIaSubSectionChange, onEstudoMercadoSubSectionChange]);

  // Função para navegar entre seções
  const navigateToSection = (section: SidebarSection, subsection?: string) => {
    const routes: Record<SidebarSection, string> = {
      'leads': '/leads',
      'meus-leads': '/meus-leads',
      'metricas': (() => {
        if (subsection === 'meus-leads') return '/meus-leads';
        if (subsection === 'bolsao') return '/bolsao';
        return `/metricas/${subsection || 'cliente-interessado'}`;
      })(),
      'estudo-mercado': `/estudo-mercado/${subsection || 'avaliacao'}`,
      'recrutamento': '/recrutamento',
      'gestao-equipe': '/gestao-equipe',
      'bolsao': '/bolsao',
      'imoveis': '/imoveis',
      'agentes-ia': `/agentes-ia/${subsection || 'agente-marketing'}`,
      'octo-chat': '/octo-chat',
      'integracoes': '/integracoes',
      'central-leads': '/central-leads',
      'notificacoes': '/notificacoes',
      'relatorios': '/relatorios',
      'configuracoes': '/configuracoes'
    };
    
    navigate(routes[section]);
  };

  return { navigateToSection };
};

