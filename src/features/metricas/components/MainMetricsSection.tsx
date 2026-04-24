/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { EnhancedFunnelChart } from '@/features/leads/components/EnhancedFunnelChart';
import { SectionMetrics } from './SectionMetrics';
import { LeadsChartsSection } from '@/features/leads/components/LeadsChartsSection';
import { LeadsMetricsChart } from '@/features/leads/components/LeadsMetricsChart';
import { LeadsConversionChart } from '@/features/leads/components/LeadsConversionChart';
import { LeadsTemperatureChart } from '@/features/leads/components/LeadsTemperatureChart';
import { LeadsOriginChart } from '@/features/leads/components/LeadsOriginChart';
import { LeadsPerformanceChart } from '@/features/leads/components/LeadsPerformanceChart';
import { ImoveisSimpleChart } from '@/features/imoveis/components/ImoveisSimpleChart';
import { RelatorioGeralChart } from './RelatorioGeralChart';
import { MonthlyReport } from './MonthlyReport';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { BairrosChart } from '@/features/imoveis/components/BairrosChart';
import { EstudoMercadoChart } from '@/features/estudo-mercado/components/EstudoMercadoChart';
import { TaxaExclusividadeChart } from '@/features/corretores/components/TaxaExclusividadeChart';
import { LeadsTabOptimized } from '@/features/leads/components/LeadsTabOptimized';
import { CorretoresTabOptimized } from '@/features/corretores/components/CorretoresTabOptimized';
import { ImoveisTabOptimized } from '@/features/imoveis/components/ImoveisTabOptimized';
import { RelatorioTabOptimized } from './RelatorioTabOptimized';
// Novos componentes de funil dividido
import { LeadsFunnelChart } from '@/features/leads/components/LeadsFunnelChart';
import { VendedoresFunnelChart } from '@/features/corretores/components/VendedoresFunnelChart';
// Funis separados para Pré-Atendimento e Atendimento
import { PreAtendimentoFunnelChart } from '@/features/leads/components/PreAtendimentoFunnelChart';
import { AtendimentoFunnelChart } from '@/features/leads/components/AtendimentoFunnelChart';
// Novo componente de performance com bolhas
import { FunnelStagesBubbleChart } from '@/features/leads/components/FunnelStagesBubbleChart';
// Novos gráficos de vendedores
import { VendedoresValoresChart } from '@/features/corretores/components/VendedoresValoresChart';
import { VendedoresTiposChart } from '@/features/corretores/components/VendedoresTiposChart';
import { VendedoresTemperaturaChart } from '@/features/corretores/components/VendedoresTemperaturaChart';
// Novos gráficos de corretores
// Novos gráficos de imóveis
import { ImoveisPortfolioChart } from '@/features/imoveis/components/ImoveisPortfolioChart';
import { ImoveisRegionChart } from '@/features/imoveis/components/ImoveisRegionChart';
import { ImoveisValueChart } from '@/features/imoveis/components/ImoveisValueChart';
import { ImoveisTrendChart } from '@/features/imoveis/components/ImoveisTrendChart';
// Removido: ImoveisMarketAnalysis (backup em branch backup/analise-mercado-imobiliario)
// Novos gráficos gerais
import { GeralOverviewChart } from '@/features/leads/components/GeralOverviewChart';
import { GeralFunnelAdvancedChart } from '@/features/leads/components/GeralFunnelAdvancedChart';
import { GeralTimelineChart } from '@/features/leads/components/GeralTimelineChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NotionTabs } from '@/components/ui/NotionTabs';
import { Users, Home, UserCheck, BarChart3, Target, Building2, Key, Calendar, ChevronLeft, ChevronRight, Users2, User, LayoutGrid } from 'lucide-react';
// Removido import não utilizado: LeadsSubSection
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MainMetricsSectionProps {
  leads: ProcessedLead[];
  activeSection?: 'leads' | 'proprietarios' | 'corretores' | 'imoveis' | 'geral';
  activeLeadsSubSection?: 'venda' | 'locacao' | 'todos';
  onLeadsSubSectionChange?: (section: 'venda' | 'locacao' | 'todos') => void;
  activeVendaSubTab?: 'comprador' | 'vendedor';
  onVendaSubTabChange?: (tab: 'comprador' | 'vendedor') => void;
  activeProprietariosSubSection?: 'vendedor' | 'locatario' | 'estudo-mercado';
  onProprietariosSubSectionChange?: (section: 'vendedor' | 'locatario' | 'estudo-mercado') => void;
  activeClienteInteressadoSubSection?: 'geral' | 'pre-atendimento' | 'bolsao' | 'atendimento';
}

type SectionType = 'leads' | 'proprietarios' | 'corretores' | 'imoveis' | 'geral';

export const MainMetricsSection = ({ 
  leads, 
  activeSection = 'leads', 
  activeLeadsSubSection: externalActiveLeadsSubSection = 'todos',
  onLeadsSubSectionChange,
  activeVendaSubTab = 'comprador',
  onVendaSubTabChange,
  activeProprietariosSubSection = 'vendedor',
  onProprietariosSubSectionChange,
  activeClienteInteressadoSubSection = 'geral'
}: MainMetricsSectionProps) => {
  // Estado interno para activeLeadsSubSection (fallback se não houver callback externo)
  const [internalLeadsSubSection, setInternalLeadsSubSection] = useState<'venda' | 'locacao' | 'todos'>('venda');
  
  // Usar estado externo se disponível, senão usar interno
  const activeLeadsSubSection = onLeadsSubSectionChange ? externalActiveLeadsSubSection : internalLeadsSubSection;
  const handleLeadsSubSectionChange = (section: 'venda' | 'locacao' | 'todos') => {
    if (onLeadsSubSectionChange) {
      onLeadsSubSectionChange(section);
    } else {
      setInternalLeadsSubSection(section);
    }
  };
  
  // Usar estado local apenas se não houver callback externo
  const [internalVendaSubTab, setInternalVendaSubTab] = useState<'comprador' | 'vendedor'>('comprador');
  
  // Estados para filtro de data
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  
  // Novo estado para filtro de tipo de negócio na aba Geral
  const [geralBusinessFilter, setGeralBusinessFilter] = useState<'todos' | 'venda' | 'locacao'>('todos');
  
  // Estados para filtros da aba Atendimento
  const [atendimentoEquipeFilter, setAtendimentoEquipeFilter] = useState<'todas' | 'verde' | 'vermelha' | 'amarela' | 'azul'>('todas');
  const [atendimentoCorretorFilter, setAtendimentoCorretorFilter] = useState<string>('todos');
  
  // Determinar qual estado usar
  const currentVendaSubTab = onVendaSubTabChange ? activeVendaSubTab : internalVendaSubTab;
  const handleVendaSubTabChange = onVendaSubTabChange || setInternalVendaSubTab;

  // Debug logs para verificar mudanças de estado
  useEffect(() => {
  }, [leads]);

  // Debug: monitorar mudanças no filtro activeLeadsSubSection
  useEffect(() => {
  }, [activeLeadsSubSection, activeClienteInteressadoSubSection]);

  // Obter lista de corretores únicos dos leads
  const corretoresUnicos = useMemo(() => {
    const corretores = leads
      .map(lead => lead.corretor_responsavel)
      .filter(corretor => corretor && corretor.trim() !== '' && corretor !== 'Não atribuído')
      .filter((corretor, index, array) => array.indexOf(corretor) === index) // Remove duplicatas
      .sort();
    
    return corretores;
  }, [leads]);

  // Função para filtrar leads por data
  const filterLeadsByDate = useCallback((leadsToFilter: ProcessedLead[]) => {
    if (dateFilter === 'all') return leadsToFilter;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return leadsToFilter.filter(lead => {
      const leadDate = new Date(lead.data_entrada);
      
      switch (dateFilter) {
        case 'today':
          const leadDay = new Date(leadDate.getFullYear(), leadDate.getMonth(), leadDate.getDate());
          return leadDay.getTime() === today.getTime();
        
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return leadDate >= weekAgo;
        
        case 'month':
          // Filtrar por mês e ano específicos selecionados
          return leadDate.getMonth() === selectedMonth && leadDate.getFullYear() === selectedYear;
        
        case 'year':
          // Filtrar por ano específico selecionado
          return leadDate.getFullYear() === selectedYear;
        
        case 'custom':
          if (!customStartDate || !customEndDate) return true;
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          return leadDate >= start && leadDate <= end;
        
        default:
          return true;
      }
    });
  }, [dateFilter, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Função para filtrar leads baseado na sub-seção ativa
  const getFilteredLeads = useMemo(() => {
    
    if (activeSection !== 'leads') {
      return leads || [];
    }

    if (!leads || leads.length === 0) {
      return [];
    }

    const filteredLeads = leads.filter(lead => {
      const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
      const tipoLead = lead.tipo_lead?.toLowerCase() || '';
      
      let match = false;
      
      // Se estiver em PRÉ-ATENDIMENTO ou ATENDIMENTO, usar o filtro activeLeadsSubSection
      // IMPORTANTE: Incluir leads sem tipo definido para garantir que apareçam nos funis
      if (activeClienteInteressadoSubSection === 'pre-atendimento' || activeClienteInteressadoSubSection === 'atendimento') {
        const semTipoDefinido = !tipoNegocio && !tipoLead;
        
        if (activeLeadsSubSection === 'venda') {
          // Leads que querem COMPRAR (Venda = Compradores) + leads sem tipo definido
          match = tipoNegocio.includes('compra') || 
                 tipoLead.includes('comprador') ||
                 semTipoDefinido ||
                 // Incluir leads que não são explicitamente de locação
                 (!tipoNegocio.includes('locação') && !tipoNegocio.includes('locacao') && 
                  !tipoLead.includes('locatário') && !tipoLead.includes('locatario') && 
                  !tipoLead.includes('inquilino'));
        } else if (activeLeadsSubSection === 'locacao') {
          // Leads que querem ALUGAR (Locação = Locatários)
          match = tipoNegocio.includes('locação') || 
                 tipoNegocio.includes('locacao') ||
                 tipoLead.includes('locatário') || 
                 tipoLead.includes('locatario') ||
                 tipoLead.includes('inquilino');
        } else {
          // Todos os leads
          match = true;
        }
      }
      // Se estiver na aba VENDA tradicional (com sub-tab comprador/vendedor)
      else if (activeLeadsSubSection === 'venda') {
        if (currentVendaSubTab === 'comprador') {
          // Leads que querem COMPRAR
          match = tipoNegocio.includes('compra') || 
                 tipoLead.includes('comprador');
        } else if (currentVendaSubTab === 'vendedor') {
          // Leads que querem VENDER (proprietários) - filtro mais amplo
          match = tipoNegocio.includes('venda') || 
                 tipoNegocio.includes('vender') ||
                 tipoLead.includes('vendedor') ||
                 tipoLead.includes('proprietário') ||
                 tipoLead.includes('proprietario') ||
                 // Incluir todos os leads que não são explicitamente compradores ou locação
                 (!tipoNegocio.includes('compra') && !tipoNegocio.includes('locação') && !tipoNegocio.includes('locacao') && !tipoLead.includes('comprador'));
        } else {
          // Fallback: todos de venda
          match = true;
        }
      } 
      // Se estiver em LOCAÇÃO
      else if (activeLeadsSubSection === 'locacao') {
        match = tipoNegocio.includes('locação') || 
               tipoNegocio.includes('locacao') ||
               tipoLead.includes('locatário') || 
               tipoLead.includes('locatario') ||
               tipoLead.includes('inquilino');
      } 
      // Outras abas
      else {
        match = true;
      }
      
      return match;
    });

    
    // Aplicar filtros específicos da aba Atendimento
    let atendimentoFilteredLeads = filteredLeads;
    
    if (activeClienteInteressadoSubSection === 'atendimento') {
      // Filtro por Equipe
      if (atendimentoEquipeFilter !== 'todas') {
        // Mapear equipes para corretores (baseado nos dados do useAuth)
        const equipeCorretores: Record<string, string[]> = {
          'verde': ['Alexandra Niero', 'Ana Cristina Delgado Fontes', 'Bárbara Fabrício', 'Edna Silva', 'Felipe Martins', 'Jeferson Santos', 'Renato Faraco', 'André Coelho', 'Pâmela Hashimoto'],
          'vermelha': ['Alexandre Faggian', 'Ana Giglio', 'Catia Oliveira', 'Emerson Pavan', 'Gabriele Fávaro', 'Karla Paulovic', 'Rose Braga', 'Felipe', 'Isabel Cristina'],
          'amarela': ['André Marcondes', 'Ana Lucia Brito', 'Celina Yamamoto', 'Felipe Camargo', 'Gustavo Teo', 'Jose Rosalem', 'Wilson Peres', 'Jeniffer Arcos', 'Julia Castro'],
          'azul': ['Andrea Abrao', 'Angelica Andrade', 'Caio Zomignani', 'Fernanda Cristina Lanfranchi Sanchez', 'Vanessa', 'Mariana Mamede', 'Josismar de Barros', 'Paulo Inacio', 'contato']
        };
        
        const corretoresDaEquipe = equipeCorretores[atendimentoEquipeFilter] || [];
        atendimentoFilteredLeads = atendimentoFilteredLeads.filter(lead => 
          corretoresDaEquipe.includes(lead.corretor_responsavel)
        );
      }
      
      // Filtro por Corretor
      if (atendimentoCorretorFilter !== 'todos') {
        atendimentoFilteredLeads = atendimentoFilteredLeads.filter(lead => 
          lead.corretor_responsavel === atendimentoCorretorFilter
        );
      }
    }
    
    // Aplicar filtro de data
    const finalFiltered = filterLeadsByDate(atendimentoFilteredLeads);
    
    return finalFiltered;
  }, [leads, activeSection, activeLeadsSubSection, currentVendaSubTab, activeClienteInteressadoSubSection, filterLeadsByDate, dateFilter, atendimentoEquipeFilter, atendimentoCorretorFilter]);

  // Calcular métricas dinâmicas baseadas na seção ativa
  const dynamicMetrics = useMemo(() => {
    // Filtrar leads baseado no geralBusinessFilter quando estiver na aba GERAL
    let allLeads = leads || [];
    
    // Se estiver na aba GERAL (Cliente Interessado), aplicar filtro de tipo de negócio
    if (activeClienteInteressadoSubSection === 'geral' && geralBusinessFilter !== 'todos') {
      allLeads = allLeads.filter(lead => {
        const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
        const tipoLead = lead.tipo_lead?.toLowerCase() || '';
        
        if (geralBusinessFilter === 'venda') {
          return tipoNegocio.includes('compra') || tipoNegocio.includes('venda') || 
                 tipoNegocio.includes('vender') || tipoLead.includes('comprador') ||
                 tipoLead.includes('vendedor') || tipoLead.includes('proprietário') ||
                 tipoLead.includes('proprietario');
        } else if (geralBusinessFilter === 'locacao') {
          return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao') ||
                 tipoLead.includes('inquilino') || tipoLead.includes('locatário') ||
                 tipoLead.includes('locatario');
        }
        return true;
      });
    }
    
    // Se estiver na aba CLIENTE PROPRIETÁRIO, aplicar filtro de Vendedor/Locatário
    if (activeSection === 'proprietarios' && activeProprietariosSubSection && activeProprietariosSubSection !== 'estudo-mercado') {
      allLeads = allLeads.filter(lead => {
        const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
        const tipoLead = lead.tipo_lead?.toLowerCase() || '';
        
        if (activeProprietariosSubSection === 'vendedor') {
          // Proprietários que querem vender - critério mais amplo
          return tipoNegocio.includes('venda') || 
                 tipoNegocio.includes('vender') || 
                 tipoNegocio.includes('compra') || // Pode ser proprietário vendendo para comprador
                 tipoLead.includes('vendedor') || 
                 tipoLead.includes('proprietário') ||
                 tipoLead.includes('proprietario') ||
                 tipoLead.includes('owner') ||
                 // Se não tem tipo específico de locação, pode ser venda
                 (!tipoNegocio.includes('locação') && !tipoNegocio.includes('locacao') && !tipoLead.includes('inquilino') && !tipoLead.includes('locatário'));
        } else if (activeProprietariosSubSection === 'locatario') {
          return tipoNegocio.includes('locação') || 
                 tipoNegocio.includes('locacao') ||
                 tipoNegocio.includes('aluguel') ||
                 tipoLead.includes('locatário') || 
                 tipoLead.includes('locatario') ||
                 tipoLead.includes('inquilino');
        }
        return true;
      });
      
    }
    
    
    if (!allLeads || allLeads.length === 0) {
      // Retornar métricas zeradas com labels apropriados
      const emptyLabel = activeSection === 'proprietarios' 
        ? (activeProprietariosSubSection === 'locatario' ? 'Clientes Locatários' : 'Clientes Proprietários')
        : 'Leads';
      
      const emptyEncaminhadosLabel = activeSection === 'proprietarios'
        ? (activeProprietariosSubSection === 'locatario' ? 'Locatários Encaminhados Aos Corretores' : 'Proprietários Encaminhados Aos Corretores')
        : 'Leads no Sistema';
      
      // Para proprietários, retornar todas as 6 métricas
      if (activeSection === 'proprietarios') {
        return {
          metric1: { value: 0, label: activeProprietariosSubSection === 'vendedor' ? 'Vendedores' : 'Locatários', color: 'green' },
          metric2: { value: 0, label: 'LIA (Leads Captados pela LIA)', color: 'blue' },
          metric3: { value: 0, label: 'Não Exclusivos', color: 'purple' },
          metric4: { value: 0, label: 'Exclusivos', color: 'orange' },
          metric5: { value: 0, label: 'Propostas', color: 'pink' },
          metric6: { value: 0, label: 'Estudos', color: 'emerald' }
        };
      }
      
      return {
        metric1: { value: 0, label: emptyLabel, color: 'green' },
        metric2: { value: 0, label: 'Interações', color: 'purple' },
        metric3: { value: 0, label: 'Visitas', color: 'blue' },
        metric4: { value: 0, label: emptyEncaminhadosLabel, color: 'orange' }
      };
    }

    // MÉTRICAS TOTAIS - SEMPRE baseadas em TODOS os leads
    const totalLeads = allLeads.length;
    const interacoes = allLeads.filter(lead => 
      lead.etapa_atual === 'Interação' ||
      lead.etapa_atual === 'Interacao' ||
      lead.etapa_atual === 'Em Atendimento'
    ).length;
    const visitasAgendadas = allLeads.filter(lead => 
      lead.Data_visita && lead.Data_visita.trim() !== ""
    ).length;
    
    // Leads no Sistema = todos os leads cadastrados no CRM (todos que estão na tabela)
    // Assumindo que todos os leads vindos do Supabase já estão cadastrados no sistema
    const leadsNoSistema = allLeads.length; // Todos os leads são "leads no sistema"
    
    const quentes = allLeads.filter(lead => 
      lead.status_temperatura === 'Quente'
    ).length;
    const negociacoes = allLeads.filter(lead => 
      lead.etapa_atual === 'Em Negociação' || lead.etapa_atual === 'Negociação'
    ).length;
    
    // Nova métrica: Negócios Fechados - TOTAL GERAL
    const negociosFechados = allLeads.filter(lead => 
      lead.etapa_atual === 'Negócio Fechado' || 
      lead.etapa_atual === 'Finalizado' ||
      (lead.valor_final_venda && lead.valor_final_venda > 0)
    ).length;
    
    // Pré-Atendimento - leads aguardando triagem/primeiro contato
    const preAtendimento = allLeads.filter(lead => 
      lead.etapa_atual === 'Pré-Atendimento' ||
      lead.etapa_atual === 'Aguardando Atendimento' ||
      lead.etapa_atual === 'Novo Lead' ||
      lead.etapa_atual === 'Interação' ||
      lead.etapa_atual === 'Interacao'
    ).length;
    
    // Leads Encaminhados - TODOS os leads foram encaminhados ao sistema
    const leadsEncaminhados = totalLeads;
    
    // Pipeline de negócios fechados (valor total) - USANDO TODOS OS LEADS
    const pipelineFechado = allLeads
      .filter(lead => 
        lead.etapa_atual === 'Negócio Fechado' || 
        lead.etapa_atual === 'Finalizado' ||
        (lead.valor_final_venda && lead.valor_final_venda > 0)
      )
      .reduce((acc, lead) => acc + (lead.valor_final_venda || lead.valor_imovel || 0), 0);
    
    // Taxa de conversão geral - BASEADA EM TODOS OS LEADS
    const taxaConversao = totalLeads > 0 ? (negociosFechados / totalLeads * 100) : 0;

    // Corretores - TOTAL GERAL
    const corretoresUnicos = [...new Set(allLeads
      .filter(lead => lead.corretor_responsavel && lead.corretor_responsavel.trim() !== "")
      .map(lead => lead.corretor_responsavel))];
    const corretoresAtivos = corretoresUnicos.length;
    const pipelineTotal = allLeads.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0);

    // Imóveis - TOTAL GERAL
    const imoveisUnicos = [...new Set(allLeads
      .filter(lead => lead.codigo_imovel && lead.codigo_imovel.trim() !== "")
      .map(lead => lead.codigo_imovel))];
    const valorMedio = totalLeads > 0 ? pipelineTotal / totalLeads : 0;

    // Métricas mensais - TOTAL GERAL
    const currentMonth = new Date().toISOString().slice(0, 7);
    const leadsDoMes = allLeads.filter(lead => 
      new Date(lead.data_entrada).toISOString().slice(0, 7) === currentMonth
    ).length;
    const visitasDoMes = allLeads.filter(lead => {
      const leadMonth = new Date(lead.data_entrada).toISOString().slice(0, 7);
      return leadMonth === currentMonth && lead.Data_visita && lead.Data_visita.trim() !== "";
    }).length;

    // Label dinâmico para o primeiro card baseado na aba ativa
    const getLeadsLabel = () => {
      // Se estiver na aba GERAL, usar geralBusinessFilter
      if (activeClienteInteressadoSubSection === 'geral') {
        if (geralBusinessFilter === 'venda') {
          return 'Vendedores';
        } else if (geralBusinessFilter === 'locacao') {
          return 'Inquilinos';
        }
        return 'Clientes Interessados';
      }
      
      // Se estiver em outras abas (pré-atendimento, atendimento), usar currentVendaSubTab
      if (currentVendaSubTab === 'comprador') {
        return 'Clientes Compradores';
      } else if (currentVendaSubTab === 'vendedor') {
        return 'Clientes Inquilinos';
      }
      return 'Clientes Interessados';
    };

    // Label dinâmico para o quarto card (Encaminhados Aos Corretores)
    const getEncaminhadosLabel = () => {
      // Se estiver na aba GERAL, usar geralBusinessFilter
      if (activeClienteInteressadoSubSection === 'geral') {
        if (geralBusinessFilter === 'venda') {
          return 'Vendedores Encaminhados Aos Corretores';
        } else if (geralBusinessFilter === 'locacao') {
          return 'Inquilinos Encaminhados Aos Corretores';
        }
        return 'Encaminhados Aos Corretores';
      }
      
      // Se estiver em outras abas (pré-atendimento, atendimento), usar currentVendaSubTab
      if (currentVendaSubTab === 'comprador') {
        return 'Compradores Encaminhados Aos Corretores';
      } else if (currentVendaSubTab === 'vendedor') {
        return 'Inquilinos Encaminhados Aos Corretores';
      }
      return 'Encaminhados Aos Corretores';
    };

    switch (activeSection) {
      case 'leads':
        // PRÉ-ATENDIMENTO: novas métricas com Pré-Atendimento e Leads Encaminhados
        if (activeClienteInteressadoSubSection === 'pre-atendimento') {
          return {
            metric1: { 
              value: totalLeads, 
              label: getLeadsLabel(), 
              color: 'green'
            },
            metric2: { 
              value: preAtendimento, 
              label: 'Pré-Atendimento', 
              color: 'yellow'
            },
            metric3: { 
              value: visitasAgendadas, 
              label: 'Visitas', 
              color: 'blue'
            },
            metric4: { 
              value: leadsEncaminhados, 
              label: getEncaminhadosLabel(), 
              color: 'emerald'
            }
          };
        }
        
        // ATENDIMENTO: métricas originais (com Interações e Negócios Fechados)
        if (activeClienteInteressadoSubSection === 'atendimento') {
          return {
            metric1: { 
              value: totalLeads, 
              label: getLeadsLabel(), 
              color: 'green'
            },
            metric2: { 
              value: interacoes, 
              label: 'Interações', 
              color: 'purple'
            },
            metric3: { 
              value: visitasAgendadas, 
              label: 'Visitas', 
              color: 'blue'
            },
            metric4: { 
              value: negociosFechados, 
              label: 'Negócios Fechados', 
              color: 'emerald'
            }
          };
        }
        
        // Métricas específicas para VENDEDOR (proprietários) - SEMPRE TOTAIS
        if (currentVendaSubTab === 'vendedor' && activeLeadsSubSection === 'venda') {
          // Buscar TODOS os proprietários (não apenas filtrados)
          const todosProprietarios = allLeads.filter(lead => {
            const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
            const tipoLead = lead.tipo_lead?.toLowerCase() || '';
            return tipoNegocio.includes('venda') || 
                   tipoNegocio.includes('vender') ||
                   tipoLead.includes('vendedor') ||
                   tipoLead.includes('proprietário') ||
                   tipoLead.includes('proprietario');
          });
          
          const primeiraVisita = todosProprietarios.filter(lead => 
            lead.etapa_atual === 'Primeira Visita' ||
            lead.etapa_atual === 'Visita Agendada' ||
            (lead.Data_visita && lead.Data_visita.trim() !== "")
          ).length;
          
          const estudoMercado = todosProprietarios.filter(lead => 
            lead.etapa_atual === 'Apresentação do Estudo de Mercado' ||
            lead.etapa_atual === 'Estudo de Mercado' ||
            lead.etapa_atual === 'Avaliação' ||
            lead.etapa_atual === 'Análise'
          ).length;
          
          const valorMedioVendedores = todosProprietarios.length > 0 ? 
            todosProprietarios.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0) / todosProprietarios.length : 0;
          
          const imoveisAvaliados = todosProprietarios.filter(lead => 
            lead.valor_imovel && lead.valor_imovel > 0
          ).length;

          return {
            metric1: { 
              value: todosProprietarios.length, 
              label: activeProprietariosSubSection === 'vendedor' ? 'Vendedores' : 'Locatários', 
              color: 'green'
            },
            metric2: { 
              value: primeiraVisita, 
              label: 'Primeira Visita', 
              color: 'orange'
            },
            metric3: { 
              value: estudoMercado, 
              label: 'Apresentação Estudo', 
              color: 'red'
            },
            metric4: { 
              value: Math.round(valorMedioVendedores / 1000), 
              label: 'Valor Médio (K)', 
              color: 'blue'
            }
          };
        }
        
        // Métricas padrão para VENDA (comprador tab)
        return {
          metric1: { 
            value: totalLeads, 
            label: getLeadsLabel(), 
            color: 'green'
          },
          metric2: { 
            value: preAtendimento, 
            label: 'Pré-Atendimento', 
            color: 'yellow'
          },
          metric3: { 
            value: visitasAgendadas, 
            label: 'Visitas', 
            color: 'blue'
          },
          metric4: { 
            value: leadsEncaminhados, 
            label: getEncaminhadosLabel(), 
            color: 'emerald'
          }
        };

      case 'corretores':
        return {
          metric1: { 
            value: corretoresAtivos, 
            label: 'Corretores Ativos', 
            color: 'green'
          },
          metric2: { 
            value: leadsNoSistema, 
            label: 'Leads Atribuídos', 
            color: 'purple'
          },
          metric3: { 
            value: negociacoes, 
            label: 'Em Negociação', 
            color: 'blue'
          },
          metric4: { 
            value: Math.round(pipelineTotal / 1000000 * 10) / 10, 
            label: 'Pipeline (R$ M)', 
            color: 'orange'
          }
        };

      case 'imoveis':
        return {
          metric1: { 
            value: imoveisUnicos.length, 
            label: 'Imóveis Únicos', 
            color: 'green'
          },
          metric2: { 
            value: Math.round(valorMedio / 1000), 
            label: 'Valor Médio (R$ K)', 
            color: 'purple'
          },
          metric3: { 
            value: Math.round(pipelineTotal / 1000000 * 10) / 10, 
            label: 'Valor Total (R$ M)', 
            color: 'blue'
          },
          metric4: { 
            value: visitasAgendadas, 
            label: 'Visitas Realizadas', 
            color: 'orange'
          }
        };


      case 'proprietarios':
        // Métricas específicas para Cliente Proprietário - 5 cards em layout 3x2
        const proprietariosTotal = totalLeads;
        
        // LIA - Leads Captados pela LIA (IA)
        const leadsCaptadosLIA = allLeads.filter(lead => 
          lead.origem_lead?.toLowerCase().includes('lia') ||
          lead.origem_lead?.toLowerCase().includes('ia') ||
          lead.origem_lead?.toLowerCase().includes('inteligência artificial')
        ).length;
        
        // Estudos de Mercado - leads que passaram pela etapa de estudo
        const estudosMercado = allLeads.filter(lead => 
          lead.etapa_atual === 'Estudo de Mercado' ||
          lead.etapa_atual === 'Apresentação do Estudo de Mercado' ||
          lead.etapa_atual === 'Criação do Estudo de Mercado' ||
          lead.etapa_atual === 'Avaliação' ||
          lead.etapa_atual === 'Análise'
        ).length;
        
        // Não Exclusivos - imóveis sem exclusividade
        const naoExclusivos = allLeads.filter(lead => 
          lead.etapa_atual === 'Não Exclusivo' ||
          lead.etapa_atual === 'Nao Exclusivo' ||
          lead.etapa_atual === 'Sem Exclusividade'
        ).length;
        
        // Exclusivos - imóveis com exclusividade
        const exclusivos = allLeads.filter(lead => 
          lead.etapa_atual === 'Exclusivo' ||
          lead.etapa_atual === 'Exclusividade' ||
          lead.etapa_atual === 'Com Exclusividade'
        ).length;
        
        // Propostas - leads com propostas enviadas/recebidas
        const propostas = allLeads.filter(lead => 
          lead.etapa_atual === 'Proposta Enviada' ||
          lead.etapa_atual === 'Proposta Criada' ||
          lead.etapa_atual === 'Proposta' ||
          lead.etapa_atual === 'Propostas Respondidas'
        ).length;
        
        return {
          metric1: { 
            value: proprietariosTotal, 
            label: activeProprietariosSubSection === 'vendedor' ? 'Vendedores' : 'Locatários', 
            color: 'green'
          },
          metric2: { 
            value: leadsCaptadosLIA, 
            label: 'LIA (Leads Captados pela LIA)', 
            color: 'blue'
          },
          metric3: { 
            value: naoExclusivos, 
            label: 'Não Exclusivos', 
            color: 'purple'
          },
          metric4: { 
            value: exclusivos, 
            label: 'Exclusivos', 
            color: 'orange'
          },
          metric5: { 
            value: propostas, 
            label: 'Propostas', 
            color: 'pink'
          },
          metric6: { 
            value: estudosMercado, 
            label: 'Estudos', 
            color: 'emerald'
          }
        };

      case 'geral':
        const visitasRealizadas = allLeads.filter(lead => 
          lead.etapa_atual === 'Visita Realizada' || 
          (lead.Data_visita && lead.Data_visita.trim() !== "" && lead.etapa_atual !== 'Visita Agendada')
        ).length;
        
        const propostasAssinadas = allLeads.filter(lead => 
          lead.etapa_atual === 'Proposta Assinada' || 
          lead.etapa_atual === 'Negócio Fechado' ||
          lead.etapa_atual === 'Finalizado'
        ).length;
        
        const imoveisAtivos = allLeads.filter(lead => 
          lead.codigo_imovel && lead.codigo_imovel.trim() !== "" && lead.Exists
        ).length;
        
        return {
          metric1: { 
            value: totalLeads, 
            label: 'Total de Leads', 
            color: 'blue'
          },
          metric2: { 
            value: visitasRealizadas, 
            label: 'Visitas Realizadas', 
            color: 'green'
          },
          metric3: { 
            value: propostasAssinadas, 
            label: 'Propostas Assinadas', 
            color: 'purple'
          },
          metric4: { 
            value: imoveisAtivos, 
            label: 'Imóveis Ativos', 
            color: 'orange'
          }
        };

      default:
        return {
          metric1: { value: totalLeads, label: 'Leads', color: 'green' },
          metric2: { value: interacoes, label: 'Interações', color: 'purple' },
          metric3: { value: visitasAgendadas, label: 'Visitas', color: 'blue' },
          metric4: { value: leadsNoSistema, label: 'Leads no Sistema', color: 'orange' }
        };
    }
  }, [leads, activeSection, getFilteredLeads, activeClienteInteressadoSubSection, currentVendaSubTab, geralBusinessFilter, activeProprietariosSubSection]);




  const renderSectionContent = () => {
    switch (activeSection) {
      case 'proprietarios':
        return <SectionMetrics leads={leads} activeSection={activeSection} />;

      case 'corretores':
        return <SectionMetrics leads={leads} activeSection={activeSection} />;

      case 'imoveis':
        return <SectionMetrics leads={leads} activeSection={activeSection} />;

      case 'geral':
        return <MonthlyReport leads={leads} />;

      default:
        // Caso 'leads' ou default - mostrar layout original
        return null;
    }
  };


  return (
    <section className="space-y-3 transition-all duration-500 ease-in-out w-full overflow-hidden">
      
      {/* ========== BARRA DE FILTROS - Acima dos Cards ========== */}
      {!(activeSection === 'proprietarios' && activeProprietariosSubSection === 'estudo-mercado') && (
        <div className="px-4 py-2">
          <div className="bg-bg-card/60 dark:bg-neutral-800/40 backdrop-blur-md rounded-xl border border-border dark:border-gray-600/40 shadow-sm dark:shadow-lg p-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              
              {/* Filtros de Equipe e Corretor - apenas em Atendimento (Cliente Interessado) */}
              {activeSection === 'leads' && activeClienteInteressadoSubSection === 'atendimento' && (
                <div className="flex gap-2">
                  {/* Filtro por Equipe */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 border-accent-purple/40 hover:from-accent-purple/60 hover:to-accent-blue/60 hover:border-accent-blue/60 transition-all duration-300 shadow-lg px-3 py-2 h-auto"
                      >
                        <Users2 className="h-4 w-4 mr-2 flex-shrink-0" />
                        <div className="flex flex-col items-start text-left">
                          <span className="text-[10px] font-medium text-white/70 leading-tight">Equipe</span>
                          <span className="text-xs font-semibold text-white leading-tight">
                            {atendimentoEquipeFilter === 'todas' ? 'Todas' :
                             atendimentoEquipeFilter === 'verde' ? '🟢 Verde' :
                             atendimentoEquipeFilter === 'vermelha' ? '🔴 Vermelha' :
                             atendimentoEquipeFilter === 'amarela' ? '🟡 Amarela' :
                             atendimentoEquipeFilter === 'azul' ? '🔵 Azul' : 'Todas'}
                          </span>
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 bg-popover border border-border p-3 shadow-xl dark:bg-neutral-900 dark:border-gray-700/50 dark:shadow-2xl" align="start">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground dark:text-white mb-2">Filtrar por Equipe</div>
                        {[
                          { value: 'todas', label: 'Todas Equipes', emoji: '👥' },
                          { value: 'verde', label: 'Verde', emoji: '🟢' },
                          { value: 'vermelha', label: 'Vermelha', emoji: '🔴' },
                          { value: 'amarela', label: 'Amarela', emoji: '🟡' },
                          { value: 'azul', label: 'Azul', emoji: '🔵' }
                        ].map((equipe) => (
                          <button
                            key={equipe.value}
                            onClick={() => setAtendimentoEquipeFilter(equipe.value as any)}
                            className={`w-full px-3 py-2 rounded text-sm font-medium transition-all text-left ${
                              atendimentoEquipeFilter === equipe.value
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : 'bg-bg-secondary/40 text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60 border border-transparent'
                            }`}
                          >
                            <span className="mr-2">{equipe.emoji}</span>
                            {equipe.label}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Filtro por Corretor */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 border-accent-purple/40 hover:from-accent-purple/60 hover:to-accent-blue/60 hover:border-accent-blue/60 transition-all duration-300 shadow-lg px-3 py-2 h-auto"
                      >
                        <User className="h-4 w-4 mr-2 flex-shrink-0" />
                        <div className="flex flex-col items-start text-left">
                          <span className="text-[10px] font-medium text-white/70 leading-tight">Corretor</span>
                          <span className="text-xs font-semibold text-white leading-tight">
                            {atendimentoCorretorFilter === 'todos' ? 'Todos' : 
                             atendimentoCorretorFilter.length > 12 ? 
                             atendimentoCorretorFilter.substring(0, 12) + '...' : 
                             atendimentoCorretorFilter}
                          </span>
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 bg-popover border border-border p-3 shadow-xl dark:bg-neutral-900 dark:border-gray-700/50 dark:shadow-2xl" align="start">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground dark:text-white mb-2">Filtrar por Corretor</div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                          <button
                            onClick={() => setAtendimentoCorretorFilter('todos')}
                            className={`w-full px-3 py-2 rounded text-sm font-medium transition-all text-left ${
                              atendimentoCorretorFilter === 'todos'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : 'bg-bg-secondary/40 text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60 border border-transparent'
                            }`}
                          >
                            👥 Todos os Corretores
                          </button>
                          {corretoresUnicos.map((corretor) => (
                            <button
                              key={corretor}
                              onClick={() => setAtendimentoCorretorFilter(corretor)}
                              className={`w-full px-3 py-2 rounded text-sm font-medium transition-all text-left ${
                                atendimentoCorretorFilter === corretor
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                  : 'bg-bg-secondary/40 text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60 border border-transparent'
                              }`}
                            >
                              👤 {corretor}
                            </button>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Botões Venda/Locação - Cliente Interessado (Pré-Atendimento e Atendimento) */}
              {activeSection === 'leads' && (activeClienteInteressadoSubSection === 'pre-atendimento' || activeClienteInteressadoSubSection === 'atendimento') && (
                <div className="flex-1 flex justify-center">
                  <NotionTabs
                    tabs={[
                      { id: 'venda', label: 'Venda', icon: Building2, count: leads.filter(l => {
                        const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
                        const tipoLead = l.tipo_lead?.toLowerCase() || '';
                        return tipoNegocio.includes('compra') || tipoLead.includes('comprador');
                      }).length },
                      { id: 'locacao', label: 'Locação', icon: Home, count: leads.filter(l => {
                        const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
                        const tipoLead = l.tipo_lead?.toLowerCase() || '';
                        return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao') || 
                               tipoLead.includes('locatário') || tipoLead.includes('locatario') ||
                               tipoLead.includes('inquilino');
                      }).length }
                    ]}
                    activeTab={activeLeadsSubSection}
                    onTabChange={(tab) => handleLeadsSubSectionChange(tab as 'venda' | 'locacao')}
                    size="md"
                    variant="default"
                  />
                </div>
              )}

              {/* Botões Vendedor/Locatário - Cliente Proprietário */}
              {activeSection === 'proprietarios' && activeProprietariosSubSection !== 'estudo-mercado' && (
                <div className="flex-1 flex justify-center">
                  <NotionTabs
                    tabs={[
                      { id: 'vendedor', label: 'Vendedor', icon: Home, count: leads.filter(l => {
                        const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
                        const tipoLead = l.tipo_lead?.toLowerCase() || '';
                        return tipoNegocio.includes('venda') || tipoNegocio.includes('vender') || 
                               tipoLead.includes('vendedor') || tipoLead.includes('proprietário');
                      }).length },
                      { id: 'locatario', label: 'Locatário', icon: Key, count: leads.filter(l => {
                        const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
                        return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao');
                      }).length }
                    ]}
                    activeTab={activeProprietariosSubSection}
                    onTabChange={(tab) => {
                      if (onProprietariosSubSectionChange) {
                        onProprietariosSubSectionChange(tab as 'vendedor' | 'locatario');
                      }
                    }}
                    size="md"
                    variant="default"
                  />
                </div>
              )}

              {/* Botões Todos/Venda/Locação - Cliente Interessado Geral */}
              {activeSection === 'leads' && activeClienteInteressadoSubSection === 'geral' && (
                <div className="flex-1 flex justify-center">
                  <NotionTabs
                    tabs={[
                      { id: 'todos', label: 'Todos', icon: LayoutGrid, count: leads.length },
                      { id: 'venda', label: 'Venda', icon: Building2, count: leads.filter(l => {
                        const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
                        return tipoNegocio.includes('compra') || tipoNegocio.includes('venda') || tipoNegocio.includes('vender');
                      }).length },
                      { id: 'locacao', label: 'Locação', icon: Home, count: leads.filter(l => {
                        const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
                        return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao');
                      }).length }
                    ]}
                    activeTab={geralBusinessFilter}
                    onTabChange={(tab) => setGeralBusinessFilter(tab as 'todos' | 'venda' | 'locacao')}
                    size="md"
                    variant="default"
                  />
                </div>
              )}

              {/* Filtro de Data - Para todas as abas de Cliente Interessado */}
              {activeSection === 'leads' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 border-accent-purple/40 hover:from-accent-purple/60 hover:to-accent-blue/60 hover:border-accent-blue/60 transition-all duration-300 shadow-lg px-3 py-2 h-auto"
                    >
                      <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                      <div className="flex flex-col items-start text-left">
                        <span className="text-[10px] font-medium text-white/70 leading-tight">Período</span>
                        <span className="text-xs font-semibold text-white leading-tight">
                          {dateFilter === 'all' ? 'Todo Período' :
                           dateFilter === 'today' ? 'Hoje' :
                           dateFilter === 'week' ? 'Últimos 7 dias' :
                           dateFilter === 'month' ? `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][selectedMonth]}/${selectedYear}` :
                           dateFilter === 'year' ? `${selectedYear}` :
                           'Personalizado'}
                        </span>
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 bg-popover border border-border p-3 shadow-xl dark:bg-neutral-900 dark:border-gray-700/50 dark:shadow-2xl" align="end">
                    <div className="space-y-3">
                      {/* Filtros Rápidos */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { value: 'all', label: 'Tudo' },
                          { value: 'today', label: 'Hoje' },
                          { value: 'week', label: '7 dias' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setDateFilter(option.value as any)}
                            className={`px-2 py-1.5 rounded text-xs font-semibold transition-all duration-300 ${
                              dateFilter === option.value
                                ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-lg scale-105'
                                : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      {/* Seletor de Mês */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-text-secondary">Selecionar Mês</label>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              if (selectedMonth === 0) {
                                setSelectedMonth(11);
                                setSelectedYear(selectedYear - 1);
                              } else {
                                setSelectedMonth(selectedMonth - 1);
                              }
                              setDateFilter('month');
                            }}
                            className="p-1.5 rounded bg-bg-secondary/40 hover:bg-bg-secondary/60 text-text-secondary hover:text-text-primary transition-all"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDateFilter('month')}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-all duration-300 ${
                              dateFilter === 'month'
                                ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-lg'
                                : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white'
                            }`}
                          >
                            {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][selectedMonth]} {selectedYear}
                          </button>
                          <button
                            onClick={() => {
                              if (selectedMonth === 11) {
                                setSelectedMonth(0);
                                setSelectedYear(selectedYear + 1);
                              } else {
                                setSelectedMonth(selectedMonth + 1);
                              }
                              setDateFilter('month');
                            }}
                            className="p-1.5 rounded bg-bg-secondary/40 hover:bg-bg-secondary/60 text-text-secondary hover:text-text-primary transition-all"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Seletor de Ano */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-text-secondary">Selecionar Ano</label>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedYear(selectedYear - 1);
                              setDateFilter('year');
                            }}
                            className="p-1.5 rounded bg-bg-secondary/40 hover:bg-bg-secondary/60 text-text-secondary hover:text-text-primary transition-all"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDateFilter('year')}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-all duration-300 ${
                              dateFilter === 'year'
                                ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-lg'
                                : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white'
                            }`}
                          >
                            {selectedYear}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedYear(selectedYear + 1);
                              setDateFilter('year');
                            }}
                            className="p-1.5 rounded bg-bg-secondary/40 hover:bg-bg-secondary/60 text-text-secondary hover:text-text-primary transition-all"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Período Personalizado */}
                      <div className="space-y-1.5 border-t border-gray-700/30 pt-2.5">
                        <label className="text-xs text-text-secondary">Período Personalizado</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => {
                              setCustomStartDate(e.target.value);
                              if (e.target.value && customEndDate) setDateFilter('custom');
                            }}
                            className="px-2 py-1.5 bg-bg-secondary/40 border border-gray-700/50 rounded text-xs text-text-primary focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                          />
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => {
                              setCustomEndDate(e.target.value);
                              if (customStartDate && e.target.value) setDateFilter('custom');
                            }}
                            className="px-2 py-1.5 bg-bg-secondary/40 border border-gray-700/50 rounded text-xs text-text-primary focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                          />
                        </div>
                        {customStartDate && customEndDate && dateFilter === 'custom' && (
                          <div className="text-xs text-purple-300 bg-purple-500/10 px-2 py-1.5 rounded border border-purple-500/20">
                            {new Date(customStartDate).toLocaleDateString('pt-BR')} - {new Date(customEndDate).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Cards de métricas dinâmicas - mudam conforme a aba ativa (não mostrar em estudo-mercado) */}
      {!(activeSection === 'proprietarios' && activeProprietariosSubSection === 'estudo-mercado') && (
        <div className={`grid gap-2 relative z-20 px-4 ${
          activeSection === 'proprietarios' 
            ? 'grid-cols-3 md:grid-cols-3' // 3x2 layout para proprietários
            : 'grid-cols-2 md:grid-cols-4' // Layout original para outras seções
        }`}>
          {(() => {
            // Para proprietários, usar todas as 6 métricas
            const metricsToShow = activeSection === 'proprietarios' 
              ? [dynamicMetrics.metric1, dynamicMetrics.metric2, dynamicMetrics.metric3, dynamicMetrics.metric4, dynamicMetrics.metric5, dynamicMetrics.metric6]
              : [dynamicMetrics.metric1, dynamicMetrics.metric2, dynamicMetrics.metric3, dynamicMetrics.metric4];
            
            return metricsToShow.filter(m => m !== undefined).map((metric, index) => {
              const colorClasses = {
                green: 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-400/60 hover:shadow-emerald-500/15 hover:bg-emerald-100/60 dark:border-gray-500/60 dark:bg-neutral-800/25 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/8',
                purple: 'border-purple-200 bg-purple-50/60 hover:border-purple-400/60 hover:shadow-purple-500/15 hover:bg-purple-100/60 dark:border-gray-500/60 dark:bg-neutral-800/25 dark:hover:border-purple-400/50 dark:hover:bg-purple-500/8',
                blue: 'border-blue-200 bg-blue-50/60 hover:border-blue-400/60 hover:shadow-blue-500/15 hover:bg-blue-100/60 dark:border-gray-500/60 dark:bg-neutral-800/25 dark:hover:border-blue-400/50 dark:hover:bg-blue-500/8',
                orange: 'border-orange-200 bg-orange-50/60 hover:border-orange-400/60 hover:shadow-orange-500/15 hover:bg-orange-100/60 dark:border-gray-500/60 dark:bg-neutral-800/25 dark:hover:border-orange-400/50 dark:hover:bg-orange-500/8',
                pink: 'border-pink-200 bg-pink-50/60 hover:border-pink-400/60 hover:shadow-pink-500/15 hover:bg-pink-100/60 dark:border-gray-500/60 dark:bg-neutral-800/25 dark:hover:border-pink-400/50 dark:hover:bg-pink-500/8',
                emerald: 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-400/60 hover:shadow-emerald-500/15 hover:bg-emerald-100/60 dark:border-gray-500/60 dark:bg-neutral-800/25 dark:hover:border-emerald-400/50 dark:hover:bg-emerald-500/8'
              };
              
              const colorClass = colorClasses[metric.color as keyof typeof colorClasses] || colorClasses.green;
            
            return (
              <Card 
                key={`${activeSection}-${index}`}
                className={`backdrop-blur-sm border shadow-sm transition-all duration-500 rounded-xl transform hover:scale-[1.02] hover:shadow-lg hover:z-50 relative z-10 ${colorClass}`}
              >
                <CardContent className="p-5">
                  <div className="text-center space-y-2">
                    <AnimatedNumber
                      value={metric.value}
                      className={`text-2xl font-bold transition-all duration-500 ${
                        metric.color === 'green' ? 'text-emerald-600 dark:text-emerald-400' :
                        metric.color === 'purple' ? 'text-purple-600 dark:text-purple-400' :
                        metric.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                        metric.color === 'orange' ? 'text-orange-600 dark:text-orange-400' :
                        metric.color === 'pink' ? 'text-pink-600 dark:text-pink-400' :
                        metric.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    />
                    <p className="text-text-secondary dark:text-gray-300 text-sm font-semibold">{metric.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
            });
          })()}
        </div>
      )}

      {/* Seção integrada com botões e conteúdo (não mostrar em estudo-mercado) */}
      {!(activeSection === 'proprietarios' && activeProprietariosSubSection === 'estudo-mercado') && (
        <div className="bg-bg-card/60 dark:bg-neutral-800/30 backdrop-blur-md rounded-2xl border border-border dark:border-gray-500/60 shadow-sm dark:shadow-xl dark:shadow-black/20 py-4 max-w-full overflow-hidden mx-4">

        {/* Conteúdo Dinâmico */}
        <div className="transition-all duration-500 ease-in-out">
          
          {/* Layout Otimizado 2x2 - Gráficos Compactos para LEADS (NÃO mostrar quando estiver em Geral) */}
          {activeSection === 'leads' && activeClienteInteressadoSubSection !== 'geral' && (
            <div className="w-full space-y-4 px-4">
              {/* Gráficos - sempre renderizar (usarão dados de fallback se necessário) */}
              {(() => {
                // Log para debug
                return (
                  <>
                  {/* Em ATENDIMENTO: Funil de Atendimento (Bolsão → Proposta Assinada) */}
                  {activeClienteInteressadoSubSection === 'atendimento' ? (
                    <>
                      {/* Linha Superior - Funil de Atendimento (6 etapas: Bolsão → Proposta Assinada) */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 transition-all duration-300 ease-in-out">
                        {/* 1. Funil de Atendimento - 6 Etapas (começa em Bolsão) */}
                        <div className="w-full h-[780px] overflow-visible transition-all duration-300 ease-in-out">
                          <ErrorBoundary fallbackTitle="Funil de Atendimento">
                            <AtendimentoFunnelChart key={`atendimento-funnel-${activeLeadsSubSection}-${getFilteredLeads.length}`} leads={getFilteredLeads} />
                          </ErrorBoundary>
                        </div>

                        {/* 2. Performance de Conversão com Gráfico de Bolhas */}
                        <div className="w-full h-[780px] overflow-visible transition-all duration-300 ease-in-out">
                          <ErrorBoundary fallbackTitle="Performance de Conversão">
                            <FunnelStagesBubbleChart key={`atendimento-bubble-${activeLeadsSubSection}-${getFilteredLeads.length}`} leads={getFilteredLeads} funnelType="comprador" subSection="atendimento" />
                          </ErrorBoundary>
                        </div>
                      </div>
                    </>
                  ) : activeClienteInteressadoSubSection === 'pre-atendimento' ? (
                    <>
                      {/* Linha Superior - Funil de Pré-Atendimento (3 etapas: Novos Leads → Visita Agendada) */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 transition-all duration-300 ease-in-out">
                        {/* 1. Funil de Pré-Atendimento - 3 Etapas (termina em Visita Agendada) */}
                        <div className="w-full h-[680px] overflow-visible transition-all duration-300 ease-in-out">
                          <ErrorBoundary fallbackTitle="Funil de Pré-Atendimento">
                            <PreAtendimentoFunnelChart key={`pre-atendimento-funnel-${activeLeadsSubSection}-${getFilteredLeads.length}`} leads={getFilteredLeads} />
                          </ErrorBoundary>
                        </div>

                        {/* 2. Performance de Conversão com Gráfico de Bolhas */}
                        <div className="w-full h-[680px] overflow-visible transition-all duration-300 ease-in-out">
                          <ErrorBoundary fallbackTitle="Performance de Conversão">
                            <FunnelStagesBubbleChart key={`pre-atendimento-bubble-${activeLeadsSubSection}-${getFilteredLeads.length}`} leads={getFilteredLeads} funnelType="comprador" subSection="pre-atendimento" />
                          </ErrorBoundary>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Layout para aba VENDA: diferenciar entre Comprador e Vendedor */
                    <>
                      {/* Se for tab VENDEDOR na aba VENDA, mostrar funil de proprietários */}
                      {(currentVendaSubTab === 'vendedor' && activeLeadsSubSection === 'venda') ? (
                        <>
                          {/* Linha Superior - Layout 2x2 para Vendedores */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 transition-all duration-300 ease-in-out">
                            {/* 1. Funil de Vendedores */}
                            <div className="w-full h-[850px] overflow-visible transition-all duration-300 ease-in-out">
                              <ErrorBoundary fallbackTitle="Funil de Vendedores">
                                <VendedoresFunnelChart leads={getFilteredLeads} />
                              </ErrorBoundary>
                            </div>

                            {/* 2. Performance de Conversão com Gráfico de Bolhas */}
                            <div className="w-full h-[850px] overflow-visible transition-all duration-300 ease-in-out">
                              <ErrorBoundary fallbackTitle="Performance de Conversão">
                                <FunnelStagesBubbleChart leads={getFilteredLeads} funnelType="vendedor" subSection="geral" />
                              </ErrorBoundary>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Layout padrão para COMPRADOR */
                        <>
                          {/* Linha Superior - Altura ajustada (-15px total) - TRANSIÇÃO HARMÔNICA */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 transition-all duration-300 ease-in-out">
                            {/* 1. Funil de Conversão - Padrão */}
                            <div className="w-full h-[735px] overflow-visible transition-all duration-300 ease-in-out">
                              <ErrorBoundary fallbackTitle="Funil de Leads">
                                <LeadsFunnelChart leads={getFilteredLeads} />
                              </ErrorBoundary>
                            </div>

                            {/* 2. Performance de Conversão com Gráfico de Bolhas */}
                            <div className="w-full h-[735px] overflow-visible transition-all duration-300 ease-in-out">
                              <ErrorBoundary fallbackTitle="Performance de Conversão">
                                <FunnelStagesBubbleChart leads={getFilteredLeads} funnelType="comprador" subSection="geral" />
                              </ErrorBoundary>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
                );
              })()}
            </div>
          )}

          {/* Layout Otimizado 2x2 - Gráficos para PROPRIETÁRIOS (mesmos do Funil Cliente Interessado) */}
          {activeSection === 'proprietarios' && activeProprietariosSubSection !== 'estudo-mercado' && (
            <div className="w-full space-y-4 px-4">
              {/* Filtrar leads baseado na sub-aba ativa */}
              {(() => {
                
                const filteredProprietariosLeads = leads.filter(l => {
                  const tipoNegocio = l.tipo_negocio?.toLowerCase() || '';
                  const tipoLead = l.tipo_lead?.toLowerCase() || '';
                  if (activeProprietariosSubSection === 'vendedor') {
                    return tipoNegocio.includes('venda') || tipoNegocio.includes('vender') || 
                           tipoLead.includes('vendedor') || tipoLead.includes('proprietário');
                  } else {
                    return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao');
                  }
                });
                

                // Se não houver leads, criar um lead de exemplo
                let leadsParaExibir = filteredProprietariosLeads;
                if (filteredProprietariosLeads.length === 0) {
                  const baseDate = new Date().toISOString().split('T')[0];
                  
                  const leadExemplo: ProcessedLead = {
                    id_lead: 99999,
                    nome_lead: "João Silva (Exemplo)",
                    telefone: "(11) 99999-9999",
                    origem_lead: "Site Direto",
                    data_entrada: baseDate,
                    status_temperatura: "Quente",
                    etapa_atual: "Primeira Visita",
                    codigo_imovel: "AP-EX001",
                    valor_imovel: activeProprietariosSubSection === 'vendedor' ? 850000 : 4500,
                    tipo_negocio: activeProprietariosSubSection === 'vendedor' ? 'Venda' : 'Locação',
                    tipo_lead: activeProprietariosSubSection === 'vendedor' ? 'Proprietário' : 'Locatário',
                    corretor_responsavel: "Ana Costa",
                    Data_visita: baseDate,
                    Imovel_visitado: "Não",
                    Arquivamento: "Não",
                    observacoes: `Lead de exemplo - ${activeProprietariosSubSection === 'vendedor' ? 'Proprietário quer vender apartamento 3 quartos' : 'Proprietário quer alugar imóvel'}`,
                    data_finalizacao: undefined,
                    valor_final_venda: undefined,
                    link_imovel: undefined,
                    motivo_arquivamento: undefined,
                    Preferencias_lead: "3 quartos, 2 banheiros, garagem",
                    Conversa: "Cliente interessado em avaliar imóvel"
                  };
                  
                  leadsParaExibir = [leadExemplo];
                }

                // Métricas específicas para Cliente Proprietário
                const proprietariosMetrics = {
                  totalImoveis: leadsParaExibir.length,
                  imoveisVenda: leadsParaExibir.filter(l => l.tipo_negocio?.toLowerCase().includes('venda')).length,
                  imoveisLocacao: leadsParaExibir.filter(l => l.tipo_negocio?.toLowerCase().includes('locação') || l.tipo_negocio?.toLowerCase().includes('locacao')).length,
                  avaliacoesRealizadas: leadsParaExibir.filter(l => l.Imovel_visitado === 'Sim').length,
                  exclusividades: leadsParaExibir.filter(l => l.observacoes?.toLowerCase().includes('exclusiv')).length,
                  valorMedioVenda: Math.round(leadsParaExibir.filter(l => l.tipo_negocio?.toLowerCase().includes('venda') && l.valor_imovel).reduce((acc, l) => acc + (l.valor_imovel || 0), 0) / (leadsParaExibir.filter(l => l.tipo_negocio?.toLowerCase().includes('venda') && l.valor_imovel).length || 1)),
                  valorMedioLocacao: Math.round(leadsParaExibir.filter(l => (l.tipo_negocio?.toLowerCase().includes('locação') || l.tipo_negocio?.toLowerCase().includes('locacao')) && l.valor_imovel).reduce((acc, l) => acc + (l.valor_imovel || 0), 0) / (leadsParaExibir.filter(l => (l.tipo_negocio?.toLowerCase().includes('locação') || l.tipo_negocio?.toLowerCase().includes('locacao')) && l.valor_imovel).length || 1)),
                  contratosFechados: leadsParaExibir.filter(l => l.etapa_atual?.toLowerCase().includes('fechamento')).length,
                  taxaConversao: leadsParaExibir.length > 0 ? Math.round((leadsParaExibir.filter(l => l.etapa_atual?.toLowerCase().includes('fechamento')).length / leadsParaExibir.length) * 100) : 0
                };

                return (
                  <>
                    {/* Linha Superior - Funil de Proprietários */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                      {/* 1. Funil de Proprietários (usando VendedoresFunnelChart) */}
                      <div className="w-full h-[850px] overflow-visible">
                        <ErrorBoundary fallbackTitle="Funil de Proprietários">
                          <VendedoresFunnelChart leads={leadsParaExibir} />
                        </ErrorBoundary>
                      </div>

                      {/* 2. Performance de Conversão com Gráfico de Bolhas */}
                      <div className="w-full h-[850px] overflow-visible">
                        <ErrorBoundary fallbackTitle="Performance de Conversão">
                          <FunnelStagesBubbleChart leads={leadsParaExibir} funnelType="vendedor" proprietarioType={activeProprietariosSubSection as 'vendedor' | 'locatario'} />
                        </ErrorBoundary>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}


          {/* Layout Otimizado 2x2 - Gráficos Avançados para IMÓVEIS */}
          {activeSection === 'imoveis' && (
            <div className="w-full space-y-4 px-4">
              {/* Linha Superior - Altura otimizada para visualização compacta */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1. Portfolio de Imóveis - Compacto e responsivo */}
                <div className="w-full h-[520px] overflow-visible">
                  <ErrorBoundary fallbackTitle="Portfolio de Imóveis">
                    <ImoveisPortfolioChart leads={leads} />
                  </ErrorBoundary>
                </div>

                {/* Removido: Análise de Mercado Imobiliário (backup em branch backup/analise-mercado-imobiliario) */}
              </div>
            </div>
          )}


          {/* Layout Otimizado 3x2 - 6 Gráficos para RELATÓRIO GERAL */}
          {activeSection === 'leads' && activeClienteInteressadoSubSection === 'geral' && (() => {
            // Aplicar filtro de tipo de negócio aos leads antes de passar para os gráficos
            const filteredLeadsGeral = geralBusinessFilter === 'todos' ? leads : leads.filter(lead => {
              const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
              if (geralBusinessFilter === 'venda') {
                return tipoNegocio.includes('compra') || tipoNegocio.includes('venda') || tipoNegocio.includes('vender');
              } else if (geralBusinessFilter === 'locacao') {
                return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao');
              }
              return true;
            });
            
            return (
            <div className="w-full space-y-4 px-4">
              {/* Grid - 6 Gráficos com Espaçamento Adequado: 2 Leads + 1 Corretor + 3 Imóveis */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full mb-6 transition-all duration-300 ease-in-out">
                {/* Linha 1 - MÉTRICAS DE LEADS - Altura aumentada para mostrar todas as 9 etapas */}
                <div className="w-full h-[850px] min-h-[850px] overflow-visible transition-all duration-300 ease-in-out">
                  <ErrorBoundary fallbackTitle="Funil de Leads">
                    <EnhancedFunnelChart leads={filterLeadsByDate(filteredLeadsGeral)} />
                  </ErrorBoundary>
                </div>

                <div className="w-full h-[850px] min-h-[850px] overflow-visible transition-all duration-300 ease-in-out">
                  <ErrorBoundary fallbackTitle="Performance de Conversão">
                    <FunnelStagesBubbleChart leads={filteredLeadsGeral} funnelType="comprador" subSection="geral" />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
            );
          })()}
        </div>
      </div>
      )}
    </section>
  );
};

