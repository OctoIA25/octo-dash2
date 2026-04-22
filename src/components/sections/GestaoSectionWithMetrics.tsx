/**
 * 🎯 GESTÃO SECTION COM MÉTRICAS BASEADAS EM ROLE (Multi-tenant)
 * 
 * Este componente envolve o GestaoSection e fornece dados de leads
 * baseados no papel do usuário:
 * - Admin/Owner/Gestão: vê métricas consolidadas de todo o tenant
 * - Corretor: vê métricas apenas dos próprios leads
 * 
 * Fonte de dados: public.leads (mesma tabela do Kanban)
 */

import { useState, useCallback } from 'react';
import { GestaoSection } from './GestaoSection';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import { useAuth } from "@/hooks/useAuth";
import { 
  DashboardSubSection, 
  LeadsSubSection, 
  ProprietariosSubSection, 
  ClienteInteressadoSubSection,
  ClienteProprietarioSubSection 
} from '@/shared/types';
import { Loader2, AlertCircle, Users, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LEAD_TYPE_INTERESSADO, LEAD_TYPE_PROPRIETARIO, LeadType } from '@/features/leads/services/leadsService';

interface GestaoSectionWithMetricsProps {
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

export const GestaoSectionWithMetrics = ({
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
}: GestaoSectionWithMetricsProps) => {
  
  // Determinar o tipo de lead baseado na seção ativa
  const getLeadTypeForSection = (): LeadType | null => {
    // Se está em Cliente Proprietário ou aba de proprietários
    if (activeDashboardSection === 'proprietarios') {
      return LEAD_TYPE_PROPRIETARIO;
    }
    // Se está em vendedor (que é proprietário)
    if (activeVendaSubTab === 'vendedor') {
      return LEAD_TYPE_PROPRIETARIO;
    }
    // Se está em Cliente Interessado ou aba de leads/comprador
    if (activeDashboardSection === 'leads') {
      return LEAD_TYPE_INTERESSADO;
    }
    // Caso geral: buscar todos
    return null;
  };

  const leadType = getLeadTypeForSection();

  // Hook de métricas com suporte a role
  const { 
    processedLeads, 
    isLoading, 
    error, 
    isAdmin, 
    refetch,
    generalMetrics 
  } = useLeadsMetrics({ leadType });

  const { user } = useAuth();

  // Estado de refreshing
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Handler de refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl p-8">
          <CardContent className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-text-primary">Carregando métricas...</h3>
              <p className="text-sm text-text-secondary">
                {isAdmin ? 'Buscando dados consolidados do tenant' : 'Buscando seus leads'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen w-full bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <Card className="bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 shadow-xl p-8 max-w-md">
          <CardContent className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-red-700 dark:text-red-300">Erro ao carregar métricas</h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
              <button 
                onClick={handleRefresh}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Subtitle dinâmico baseado no role
  const dynamicSubtitle = isAdmin
    ? `${currentSectionSubtitle} • Visão consolidada do tenant`
    : `${currentSectionSubtitle} • Seus leads pessoais`;

  return (
    <div className="relative">
      {/* Badge indicando o tipo de visão */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Badge 
          variant="outline" 
          className={`flex items-center gap-1.5 px-3 py-1.5 ${
            isAdmin 
              ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' 
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}
        >
          {isAdmin ? (
            <>
              <Users className="h-3.5 w-3.5" />
              <span>Admin • {generalMetrics?.totalLeads || 0} leads</span>
            </>
          ) : (
            <>
              <User className="h-3.5 w-3.5" />
              <span>Meus Leads • {generalMetrics?.totalLeads || 0}</span>
            </>
          )}
        </Badge>
      </div>

      {/* GestaoSection com dados baseados em role */}
      <GestaoSection
        leads={processedLeads}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        activeDashboardSection={activeDashboardSection}
        activeLeadsSubSection={activeLeadsSubSection}
        onLeadsSubSectionChange={onLeadsSubSectionChange}
        activeVendaSubTab={activeVendaSubTab}
        onVendaSubTabChange={onVendaSubTabChange}
        activeProprietariosSubSection={activeProprietariosSubSection}
        onProprietariosSubSectionChange={onProprietariosSubSectionChange}
        activeClienteInteressadoSubSection={activeClienteInteressadoSubSection}
        currentSectionTitle={currentSectionTitle}
        currentSectionSubtitle={dynamicSubtitle}
      />
    </div>
  );
};

export default GestaoSectionWithMetrics;
