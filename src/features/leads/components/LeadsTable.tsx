/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, MessageCircle, Calendar, Home, ExternalLink, Database, RefreshCw, UserPlus, Check, X, Users } from "lucide-react";
import { ProcessedLead } from "@/data/realLeadsProcessor";
// import { ExportButton } from "@/components/ExportButton"; // Removido - usando apenas ExportSpreadsheet
import { formatCurrency } from "@/utils/metrics";
import { ExportSpreadsheet } from "@/components/ExportSpreadsheet";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLeadsData } from "../hooks/useLeadsData";
import { getCorretoresFromLeads } from "@/features/corretores/services/teamService";
import { updateLeadCorretor } from "../services/updateLeadService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// 📋 Consulte context.md para: estrutura do Supabase, campos de leads, cores de status
interface LeadsTableProps {
  leads: ProcessedLead[];
  newLeadsCount?: number;
  showGetAllButton?: boolean; // Controla se mostra o botão Get All
  showCorretorAssignment?: boolean; // Controla se mostra dropdown para atribuir corretor
}

const getStatusBadge = (etapa: string) => {
  const getColorClass = (etapaText: string) => {
    const etapaLower = etapaText.toLowerCase();
    if (etapaLower.includes('interação') || etapaLower.includes('interacao')) {
      return 'bg-purple-500/20 text-purple-300 border-purple-400/40 shadow-sm';
    }
    if (etapaLower.includes('visita') || etapaLower.includes('agendada')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-sm';
    }
    if (etapaLower.includes('negociação') || etapaLower.includes('negociacao')) {
      return 'bg-blue-500/20 text-blue-300 border-blue-400/40 shadow-sm';
    }
    if (etapaLower.includes('fechado') || etapaLower.includes('finalizado')) {
      return 'bg-green-500/20 text-green-300 border-green-400/40 shadow-sm';
    }
    if (etapaLower.includes('proposta')) {
      return 'bg-pink-500/20 text-pink-300 border-pink-400/40 shadow-sm';
    }
    return 'bg-gray-700/20 text-gray-300 border-gray-600/30 shadow-sm';
  };

  return (
    <Badge variant="outline" className={`${getColorClass(etapa)} font-semibold text-xs px-3 py-1`}>
      {etapa || ''}
    </Badge>
  );
};

const getTemperatureBadge = (temperatura: string) => {
  const getColorClass = (tempText: string) => {
    const tempLower = tempText.toLowerCase();
    if (tempLower.includes('quente')) {
      return 'bg-red-500/20 text-red-300 border-red-400/40 shadow-sm'; // Vermelho - Alta conversão
    }
    if (tempLower.includes('morno')) {
      return 'bg-orange-500/20 text-orange-300 border-orange-400/40 shadow-sm'; // Laranja - Esquentando
    }
    if (tempLower.includes('frio')) {
      return 'bg-blue-500/20 text-blue-300 border-blue-400/40 shadow-sm'; // Azul - Novos leads
    }
    return 'bg-gray-700/20 text-gray-300 border-gray-600/30 shadow-sm';
  };

  return (
    <Badge variant="outline" className={`${getColorClass(temperatura)} font-semibold text-xs px-3 py-1`}>
      {temperatura || ''}
    </Badge>
  );
};

const getTipoBadge = (tipo: string) => {
  const getColorClass = (tipoText: string) => {
    const tipoLower = tipoText?.toLowerCase() || '';
    if (tipoLower.includes('venda') || tipoLower.includes('compra')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-sm';
    }
    if (tipoLower.includes('locação') || tipoLower.includes('aluguel')) {
      return 'bg-blue-500/20 text-blue-300 border-blue-400/40 shadow-sm';
    }
    if (tipoLower.includes('investimento')) {
      return 'bg-violet-500/20 text-violet-300 border-violet-400/40 shadow-sm';
    }
    if (tipoLower.includes('comercial')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-400/40 shadow-sm';
    }
    return 'bg-gray-700/20 text-gray-300 border-gray-600/30 shadow-sm';
  };

  return (
    <Badge variant="outline" className={`${getColorClass(tipo)} font-semibold text-xs px-3 py-1`}>
      {tipo || 'N/A'}
    </Badge>
  );
};

const getTipoLeadBadge = (tipoLead: string) => {
  const getColorClass = (tipoText: string) => {
    const tipoLower = tipoText?.toLowerCase() || '';
    if (tipoLower.includes('comprador') || tipoLower.includes('buyer')) {
      return 'bg-blue-500/20 text-blue-300 border-blue-400/40 shadow-sm';
    }
    if (tipoLower.includes('proprietário') || tipoLower.includes('proprietario') || tipoLower.includes('owner')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-sm';
    }
    if (tipoLower.includes('investidor') || tipoLower.includes('investor')) {
      return 'bg-purple-500/20 text-purple-300 border-purple-400/40 shadow-sm';
    }
    if (tipoLower.includes('corretor') || tipoLower.includes('broker')) {
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40 shadow-sm';
    }
    return 'bg-gray-700/20 text-gray-300 border-gray-600/30 shadow-sm';
  };

  return (
    <Badge variant="outline" className={`${getColorClass(tipoLead)} font-semibold text-xs px-3 py-1`}>
      {tipoLead || 'N/A'}
    </Badge>
  );
};

export const LeadsTable = ({ leads, newLeadsCount = 0, showGetAllButton = false, showCorretorAssignment = false }: LeadsTableProps) => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);
  const { toast } = useToast();

  // Hook para dados do Supabase - APENAS se showGetAllButton for true
  // Usar hook condicionalmente pode causar problemas, então sempre usar mas ignorar se não necessário
  const supabaseHook = useLeadsData();
  const shouldUseSupabaseData = showGetAllButton;

  const leadsPerPage = 9;

  // Proteção contra arrays vazios ou nulos
  const safeLeads = leads || [];
  const finalLeads = (shouldUseSupabaseData && supabaseHook?.leads && supabaseHook.leads.length > 0) ? supabaseHook.leads : safeLeads;

  const activeLeads = useMemo(() => {
    // SEMPRE retornar array, mesmo que vazio
    if (!finalLeads.length) return [];

    return finalLeads
      .sort((a, b) => {
        // Ordenar por data de entrada (mais recentes primeiro)
        const dateA = new Date(a.data_entrada);
        const dateB = new Date(b.data_entrada);
        return dateB.getTime() - dateA.getTime();
      });
  }, [finalLeads]);

  // Extrair lista de corretores disponíveis
  const corretoresDisponiveis = useMemo(() => {
    return getCorretoresFromLeads(finalLeads);
  }, [finalLeads]);

  // Calcular quantos leads cada corretor tem
  const corretorLeadsCount = useMemo(() => {
    const counts: Record<string, number> = {};
    finalLeads.forEach(lead => {
      if (lead.corretor_responsavel && lead.corretor_responsavel !== 'Não atribuído') {
        counts[lead.corretor_responsavel] = (counts[lead.corretor_responsavel] || 0) + 1;
      }
    });
    return counts;
  }, [finalLeads]);

  // Função para atribuir ou remover corretor de um lead - MELHORADA COM FEEDBACK
  const handleAtribuirCorretor = async (leadId: number, novoCorretor: string, leadNome: string) => {
    // Encontrar o lead atual para reverter em caso de erro
    const leadOriginal = finalLeads.find(l => l.id_lead === leadId);
    const corretorAnterior = leadOriginal?.corretor_responsavel;
    
    // Normalizar o valor de "Não atribuído"
    const valorNormalizado = novoCorretor === 'Não atribuído' ? 'Não atribuído' : novoCorretor;
    
    // Se o valor é o mesmo, não fazer nada
    if (corretorAnterior === valorNormalizado) {
      return;
    }
    
    try {
      setUpdatingLeadId(leadId);
      
      const isRemoving = valorNormalizado === 'Não atribuído';
      
      // Log específico para remoção ou atribuição
      if (isRemoving) {
      } else {
      }
      
      // Atualizar no Supabase com o valor normalizado
      const resultado = await updateLeadCorretor(leadId, valorNormalizado);
      
      
      // Feedback visual minimalista
      toast({
        title: isRemoving ? "✓ Corretor removido" : "✓ Corretor atribuído",
        description: isRemoving 
          ? `${leadNome} disponível` 
          : `${leadNome} → ${valorNormalizado}`,
        variant: "default",
        className: "bg-neutral-900/95 border-gray-800/60 text-gray-200",
        duration: 2500,
      });
      
      // Aguardar um pouco antes de atualizar para garantir que o Supabase processou
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Refetch IMEDIATO dos dados para refletir a mudança
      if (supabaseHook?.refetch) {
        await (supabaseHook.refetch as (immediate?: boolean) => Promise<void>)(true);
      }
      
    } catch (error) {
      console.error('❌ Erro ao atribuir/remover corretor:', error);
      
      // Notificação de erro minimalista
      toast({
        title: "✗ Erro ao atualizar",
        description: `Não foi possível atualizar o corretor`,
        variant: "destructive",
        className: "bg-neutral-900/95 border-red-700/60",
        duration: 3000,
      });
      
      // Refetch para garantir sincronização em caso de erro
      if (supabaseHook?.refetch) {
        await (supabaseHook.refetch as (immediate?: boolean) => Promise<void>)(true);
      }
    } finally {
      // Dar tempo para o refetch completar antes de remover o loading
      setTimeout(() => {
        setUpdatingLeadId(null);
      }, 800);
    }
  };

  // Função para remover corretor rapidamente
  const handleRemoverCorretor = async (lead: ProcessedLead, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar abrir o select
    await handleAtribuirCorretor(lead.id_lead, 'Não atribuído', lead.nome_lead);
  };

  // Cálculos de paginação
  const totalPages = Math.ceil(activeLeads.length / leadsPerPage);
  const startIndex = (currentPage - 1) * leadsPerPage;
  const endIndex = startIndex + leadsPerPage;
  const currentLeads = activeLeads.slice(startIndex, endIndex);

  // Funções de navegação
  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Navegar para página de detalhes do lead
  const openLeadDetails = (lead: ProcessedLead, tab?: 'geral' | 'conversa' | 'imovel' | 'historico') => {
    
    // Salvar contexto atual da sidebar para restaurar depois
    const currentContext = {
      section: 'cliente-interessado', // Sempre cliente interessado quando vem da tabela
      subSection: 'geral' // Sempre geral quando vem da tabela principal
    };
    localStorage.setItem('leadViewContext', JSON.stringify(currentContext));
    
    const url = tab ? `/lead/${lead.id_lead}?tab=${tab}` : `/lead/${lead.id_lead}`;
    navigate(url);
  };

  // Função para filtrar código do imóvel - apenas os que têm números
  const getValidPropertyCode = (codigo?: string) => {
    if (!codigo || codigo.trim() === '') return null;
    
    // Verificar se contém pelo menos um número
    const hasNumber = /\d/.test(codigo);
    
    // Verificar se não é apenas uma string (como "bairro")
    const isOnlyString = /^[a-zA-ZÀ-ÿ\s]+$/.test(codigo);
    
    if (hasNumber && !isOnlyString) {
      return codigo.trim();
    }
    
    return null;
  };

  // Função para verificar se tem visita agendada
  const hasScheduledVisit = (lead: ProcessedLead) => {
    return lead.Data_visita && lead.Data_visita.trim() !== '';
  };

  // Função para verificar se o imóvel foi visitado
  const wasPropertyVisited = (lead: ProcessedLead) => {
    const hasVisit = hasScheduledVisit(lead);
    const wasVisited = lead.Imovel_visitado && 
      (lead.Imovel_visitado.toLowerCase() === 'sim' || lead.Imovel_visitado.toLowerCase() === 'yes');
    const notVisitedArchived = lead.motivo_arquivamento && 
      lead.motivo_arquivamento.toLowerCase().includes('visita não realizada');
    
    return hasVisit && wasVisited && !notVisitedArchived;
  };

  // Função para determinar o status da visita e cor do calendário
  const getVisitStatus = (lead: ProcessedLead) => {
    const hasVisit = hasScheduledVisit(lead);
    const wasVisited = wasPropertyVisited(lead);
    
    if (wasVisited) {
      return {
        color: 'text-green-400 hover:text-green-300 hover:bg-green-500/10',
        title: 'Visita realizada - Ver detalhes',
        status: 'completed'
      };
    } else if (hasVisit) {
      return {
        color: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10',
        title: 'Visita agendada - Ver detalhes',
        status: 'scheduled'
      };
    } else {
      return {
        color: 'text-red-400 hover:text-red-300 hover:bg-red-500/10',
        title: 'Sem visita agendada',
        status: 'none'
      };
    }
  };

  return (
    <Card className="bg-bg-card/60 backdrop-blur-sm card-neon">
      <div className="px-6 py-5 border-b border-bg-secondary/40">
        <div className="flex justify-between items-center">
          <h3 className="text-[15px] font-semibold flex items-center gap-3">
            <span className="text-slate-900 dark:text-slate-100 tracking-tight">
              Todos os Leads
            </span>
            {newLeadsCount > 0 && (
              <span className="bg-gradient-to-r from-accent-green to-accent-blue text-white px-3 py-1.5 rounded-full text-sm font-bold animate-pulse glow-accent-green">
                +{newLeadsCount} novos
              </span>
            )}
          </h3>
          <div className="flex gap-2">
            {showGetAllButton && supabaseHook && (
              <Button
                onClick={supabaseHook.getAllData}
                disabled={supabaseHook.isGettingAllData}
                variant="outline"
                size="sm"
                className="border-green-500/30 text-green-400 hover:bg-green-500/10 hover:border-green-400/50"
              >
                {supabaseHook.isGettingAllData ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Get All do Banco
                  </>
                )}
              </Button>
            )}
            <ExportSpreadsheet leads={finalLeads} />
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b-2 border-gray-800/60">
              <th className="text-left py-5 px-6 text-gray-300 text-sm font-bold tracking-wider uppercase">Nome</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Origem</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Etapa</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Tipo</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Temperatura</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Finalidade</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Imóvel</th>
              <th className="text-right py-5 px-6 text-gray-300 text-sm font-bold tracking-wider uppercase">Valor</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Visita</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Corretor</th>
              <th className="text-center py-5 px-5 text-gray-300 text-sm font-bold tracking-wider uppercase">Conversa</th>
            </tr>
          </thead>
          <tbody>
            {currentLeads.map((lead, index) => {
              const isNewLead = index < newLeadsCount && currentPage === 1;
              return (
                <tr
                  key={lead.id_lead}
                  className={`border-b border-bg-secondary/50 hover:bg-bg-secondary/30 transition-all duration-500 cursor-pointer ${
                    isNewLead ? 'animate-pulse bg-accent-green/10 border-accent-green/30' : ''
                  }`}
                  onClick={() => {
                    openLeadDetails(lead);
                  }}
                >
                  {/* Nome e Data de Entrada */}
                  <td className="py-5 px-6">
                    <div>
                      <div className={`font-semibold text-[15px] ${isNewLead ? 'text-emerald-400' : 'text-white'}`}>
                        {lead.nome_lead}
                        {isNewLead && (
                          <span className="ml-2 text-xs bg-emerald-500 text-white px-2.5 py-1 rounded-md font-bold shadow-sm">
                            NOVO
                          </span>
                        )}
                      </div>
                      {lead.data_entrada && (
                        <div className="text-gray-400 text-xs mt-1.5 font-medium dark:text-slate-500">
                          Data de Entrada: {new Date(lead.data_entrada).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </td>
                  
                  {/* Origem */}
                  <td className="py-5 px-5 text-center">
                    <span className="text-gray-200 font-medium text-sm">{lead.origem_lead || '-'}</span>
                  </td>
                  
                  {/* Etapa */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex justify-center">
                      {getStatusBadge(lead.etapa_atual)}
                    </div>
                  </td>
                  
                  {/* Tipo (Comprador/Proprietário) */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex justify-center">
                      {getTipoLeadBadge(lead.tipo_lead)}
                    </div>
                  </td>
                  
                  {/* Temperatura */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex justify-center">
                      {getTemperatureBadge(lead.status_temperatura)}
                    </div>
                  </td>
                  
                  {/* Finalidade (Tipo de Negócio) */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex justify-center">
                      {getTipoBadge(lead.tipo_negocio)}
                    </div>
                  </td>
                  
                  {/* Imóvel */}
                  <td className="py-4 px-4 text-center">
                    {getValidPropertyCode(lead.codigo_imovel) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Navegar para página do imóvel
                          navigate(`/imovel/${lead.codigo_imovel}`);
                        }}
                        className="h-auto px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 font-medium group"
                        title={`Ver imóvel ${getValidPropertyCode(lead.codigo_imovel)}`}
                      >
                        <span className="font-mono mr-1">
                          {getValidPropertyCode(lead.codigo_imovel)}
                        </span>
                        <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                      </Button>
                    ) : (
                      <span className="text-xs font-mono text-gray-500 dark:text-slate-400">
                        {lead.codigo_imovel || '-'}
                      </span>
                    )}
                  </td>
                  
                  {/* Valor */}
                  <td className="py-4 px-5 text-right">
                    <span className="text-white font-bold text-sm">
                      {lead.valor_imovel && lead.valor_imovel > 0 ? formatCurrency(lead.valor_imovel) : '-'}
                    </span>
                  </td>
                  
                  {/* Visita */}
                  <td className="py-4 px-4 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLeadDetails(lead, 'historico');
                      }}
                      className={`h-8 w-8 p-0 ${getVisitStatus(lead).color}`}
                      title={getVisitStatus(lead).title}
                    >
                      <Calendar className="h-4 w-4" />
                    </Button>
                  </td>
                  
                  {/* Corretor - ULTRA MINIMALISTA */}
                  <td className="py-4 px-4 text-center">
                    {showCorretorAssignment ? (
                      <div className="flex items-center justify-center gap-2">
                        <Select
                          value={lead.corretor_responsavel || 'Não atribuído'}
                          onValueChange={(value) => handleAtribuirCorretor(lead.id_lead, value, lead.nome_lead)}
                          disabled={updatingLeadId === lead.id_lead}
                        >
                          <SelectTrigger 
                            className={`
                              w-[200px] h-9
                              transition-all duration-200 ease-out
                              ${(!lead.corretor_responsavel || lead.corretor_responsavel === 'Não atribuído')
                                ? 'border border-gray-700/40 hover:border-purple-500/40 text-gray-500'
                                : 'backdrop-blur-sm border border-gray-600/50 hover:border-blue-500/50 text-gray-200'
                              }
                              ${updatingLeadId === lead.id_lead ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                              rounded-lg
                              focus:outline-none focus:ring-2 focus:ring-purple-500/30
                              disabled:opacity-40 disabled:cursor-not-allowed
                              [&>span]:line-clamp-1 [&>span]:text-left
                              shadow-sm hover:shadow-md
                            `}
                          >
                            <div className="flex items-center gap-2.5 text-xs w-full">
                              {updatingLeadId === lead.id_lead ? (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-400 flex-shrink-0" />
                                  <span className="text-gray-400 font-medium dark:text-slate-500">Salvando...</span>
                                </>
                              ) : (!lead.corretor_responsavel || lead.corretor_responsavel === 'Não atribuído') ? (
                                <>
                                  <UserPlus className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 dark:text-slate-400" />
                                  <span className="text-gray-500 font-medium dark:text-slate-400">Não atribuído</span>
                                </>
                              ) : (
                                <>
                                  <Users className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                                  <span className="truncate flex-1 text-gray-100 font-medium">{lead.corretor_responsavel}</span>
                                </>
                              )}
                            </div>
                          </SelectTrigger>
                          
                          <SelectContent 
                            className="
                              backdrop-blur-xl
                              border border-gray-700/50
                              shadow-2xl shadow-black/60
                              rounded-xl
                              min-w-[220px] max-w-[260px]
                              p-2
                            "
                            sideOffset={6}
                            align="center"
                          >
                            {/* Header - Não atribuído em destaque */}
                            <div className="px-2 py-1.5 mb-1">
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold dark:text-slate-400">Atribuir Corretor</p>
                            </div>

                            {/* Opção "Não atribuído" - PRIMEIRO e em destaque */}
                            <SelectItem 
                              value="Não atribuído"
                              className="text-gray-400 text-sm py-2.5 px-3 cursor-pointer bg-neutral-900/30 border border-gray-700/30 hover:bg-neutral-800/50 hover:border-gray-600/50 hover:text-gray-300 focus:bg-neutral-800/60 transition-all duration-200 rounded-lg mx-0.5 mb-2 dark:text-slate-500"
                            >
                              <div className="flex items-center gap-2.5 w-full">
                                {(!lead.corretor_responsavel || lead.corretor_responsavel === 'Não atribuído') && (
                                  <Check className="h-4 w-4 text-purple-400 shrink-0" />
                                )}
                                {!(!lead.corretor_responsavel || lead.corretor_responsavel === 'Não atribuído') && (
                                  <UserPlus className="h-4 w-4 text-gray-500 shrink-0 dark:text-slate-400" />
                                )}
                                <span className="flex-1 font-medium">Não atribuído</span>
                              </div>
                            </SelectItem>

                            {/* Separador elegante */}
                            {corretoresDisponiveis.length > 0 && (
                              <>
                                <div className="h-px bg-gradient-to-r from-transparent via-gray-700/50 to-transparent my-2" />
                                <div className="px-2 py-1 mb-1">
                                  <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold dark:text-slate-400">Corretores Disponíveis</p>
                                </div>
                              </>
                            )}
                            
                            {/* Lista de corretores */}
                            {corretoresDisponiveis.length > 0 ? (
                              <div className="space-y-1">
                                {corretoresDisponiveis.map((corretor) => {
                                  const leadsCount = corretorLeadsCount[corretor] || 0;
                                  const isSelected = lead.corretor_responsavel === corretor;
                                  
                                  return (
                                    <SelectItem 
                                      key={corretor} 
                                      value={corretor}
                                      className="
                                        text-gray-300 text-sm py-2.5 px-3 cursor-pointer
                                        transition-all duration-200
                                        rounded-lg mx-0.5
                                        hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-200
                                        focus:bg-blue-500/20 focus:border-blue-500/40
                                        data-[state=checked]:bg-blue-500/20 data-[state=checked]:border-blue-500/40
                                        border border-transparent
                                      "
                                    >
                                      <div className="flex items-center justify-between gap-3 w-full">
                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                          {isSelected ? (
                                            <Check className="h-4 w-4 text-blue-400 shrink-0" />
                                          ) : (
                                            <Users className="h-4 w-4 text-gray-600 shrink-0 dark:text-slate-400" />
                                          )}
                                          <span className="truncate flex-1 font-medium">{corretor}</span>
                                        </div>
                                        {leadsCount > 0 && (
                                          <Badge 
                                            variant="outline" 
                                            className={`
                                              text-[10px] px-1.5 py-0.5 shrink-0 font-bold
                                              ${leadsCount > 5 
                                                ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' 
                                                : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                              }
                                            `}
                                          >
                                            {leadsCount}
                                          </Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-gray-500 text-xs py-3 px-3 text-center italic dark:text-slate-400">
                                Nenhum corretor cadastrado
                              </div>
                            )}
                          </SelectContent>
                        </Select>

                        {/* Botão de remoção rápida - Ultra minimalista */}
                        {lead.corretor_responsavel && lead.corretor_responsavel !== 'Não atribuído' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleRemoverCorretor(lead, e)}
                            disabled={updatingLeadId === lead.id_lead}
                            className="h-9 w-9 p-0 group hover:bg-red-500/10 border border-gray-700/40 hover:border-red-500/40 text-gray-500 hover:text-red-400 transition-all duration-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md dark:text-slate-400"
                            title="Remover corretor rapidamente"
                          >
                            <X className="h-4 w-4 group-hover:rotate-90 transition-transform duration-200" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        {lead.corretor_responsavel && lead.corretor_responsavel !== 'Não atribuído' ? (
                          <>
                            <Check className="h-3 w-3 text-gray-500 dark:text-slate-400" />
                            <span className="text-gray-300 text-sm">
                              {lead.corretor_responsavel}
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-600 text-sm dark:text-slate-400">
                            Não atribuído
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  
                  {/* Conversa */}
                  <td className="py-4 px-4 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLeadDetails(lead, 'conversa');
                      }}
                      className={`h-8 w-8 p-0 ${
                        lead.Conversa && lead.Conversa.trim()
                          ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                          : 'text-gray-500 opacity-50'
                      }`}
                      title={lead.Conversa && lead.Conversa.trim() ? 'Ver conversa' : 'Ver detalhes do lead'}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginação */}
      {totalPages > 1 && (
        <div className="p-5 border-t border-bg-secondary/40">
          <div className="flex items-center justify-between">
            <div className="text-text-secondary text-sm">
              Exibindo {startIndex + 1} a {Math.min(endIndex, activeLeads.length)} de {activeLeads.length} leads
              {(shouldUseSupabaseData && supabaseHook?.leads && supabaseHook.leads.length > 0) && (
                <span className="ml-2 text-green-400 text-xs">
                  (📡 Supabase ativo)
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={goToPrevious}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
                className="border-bg-secondary/40 text-text-secondary hover:bg-bg-secondary/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Mostrar apenas algumas páginas próximas
                  const showPage = page === 1 || 
                                   page === totalPages || 
                                   (page >= currentPage - 1 && page <= currentPage + 1);
                  
                  if (!showPage) {
                    if (page === currentPage - 2 || page === currentPage + 2) {
                      return <span key={page} className="text-text-secondary px-2">...</span>;
                    }
                    return null;
                  }
                  
                  return (
                    <Button
                      key={page}
                      onClick={() => goToPage(page)}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      className={page === currentPage ? 
                        "bg-gradient-to-r from-accent-green to-accent-blue text-white border-0 glow-accent-green" :
                        "border-bg-secondary/40 text-text-secondary hover:bg-bg-secondary/30"
                      }
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                onClick={goToNext}
                disabled={currentPage === totalPages}
                variant="outline"
                size="sm"
                className="border-bg-secondary/40 text-text-secondary hover:bg-bg-secondary/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

    </Card>
  );
};