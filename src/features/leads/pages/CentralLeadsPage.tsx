/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * CentralLeadsPage - Área de Leads das Integrações
 * 
 * Esta página exibe os leads que chegam via integrações (Kenlo, etc.)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users,
  Phone,
  Mail,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  Download,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  Clock,
  ExternalLink,
  Plus,
  User,
  MessageSquare,
  Home,
  Loader2,
  Star,
  CheckSquare,
  CalendarCheck2,
  Clock3,
  List,
  Archive
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useAuth } from "@/hooks/useAuth";
import { fetchKenloLeads, KenloLead, arquivarKenloLead } from '@/features/imoveis/services/kenloLeadsService';
import { addLeadListener } from '@/features/imoveis/services/kenloPollingService';
import { getTenantCorretores, TenantCorretor, searchImoveisByCodigo, getImovelByCodigo, getCorretorByCodigoImovel, getTenantImoveis, getCorretoresFromImoveis } from '@/features/imoveis/services/imoveisXmlService';
import { Imovel } from '@/features/imoveis/services/kenloService';

const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';

// Interface para lead da integração
export interface IntegrationLead {
  _id: string;
  client: {
    name: string;
    phone: string;
    email: string;
  };
  timestamp: string;
  portal?: string;
  chavenamao?: string;
  origem?: string;
  // Detalhes extras do Ingaia
  interest?: any;
  message?: string;
  attendedBy?: any;
  raw_data?: any;
}

// Componente principal da página
interface CentralLeadsPageProps {
  embedded?: boolean;
}

export const CentralLeadsPage: React.FC<CentralLeadsPageProps> = ({ embedded = false }) => {
  const { tenantId } = useAuth();
  
  const FAVORITES_KEY = tenantId ? `central-leads-favorites:${tenantId}` : 'central-leads-favorites';
  const AF_SUBAREA_KEY = tenantId ? `central-leads-a-fazer-subarea:${tenantId}` : 'central-leads-a-fazer-subarea';

  type LeadsTab = 'a_fazer' | 'visitas' | 'futura' | 'favoritos' | 'todos';

  const [leads, setLeads] = useState<IntegrationLead[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const leadsPerPage = 10;
  
  const [activeTab, setActiveTab] = useState<LeadsTab>('a_fazer');

  type AFazerSubArea = 'nao_respondidas' | 'atividades_hoje' | 'pendentes';
  const [aFazerSubArea, setAFazerSubArea] = useState<AFazerSubArea>(() => {
    try {
      const raw = localStorage.getItem(AF_SUBAREA_KEY);
      const parsed = raw ? String(raw) : '';
      if (!parsed) return 'nao_respondidas';
      if (parsed === 'nao_respondidas' || parsed === 'atividades_hoje' || parsed === 'pendentes') {
        return parsed as AFazerSubArea;
      }
      // Compat: valor antigo
      if (parsed === 'pendentes') return 'nao_respondidas';
      return 'nao_respondidas';
    } catch {
      return 'nao_respondidas';
    }
  });
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) return new Set(parsed.map((x) => String(x)));
      return new Set();
    } catch {
      return new Set();
    }
  });
  
  // Filtros de data
  const [dataInicial, setDataInicial] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dataFinal, setDataFinal] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Filtro de portal
  const [portalFilter, setPortalFilter] = useState('todos');
  
  // Modal de detalhes
  const [selectedLead, setSelectedLead] = useState<IntegrationLead | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Arquivamento
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiveMotivo, setArchiveMotivo] = useState('');
  const [arquivando, setArquivando] = useState(false);
  
  // Modal de criar lead
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newLead, setNewLead] = useState({
    name: '',
    phone: '',
    email: '',
    interest_reference: '',
    is_exclusive: 'nao',
    portal: 'Manual',
    message: '',
    attended_by: ''
  });
  const [corretores, setCorretores] = useState<TenantCorretor[]>([]);
  
  // Estado para autocomplete de imóveis
  const [imovelSuggestions, setImovelSuggestions] = useState<Imovel[]>([]);
  const [showImovelSuggestions, setShowImovelSuggestions] = useState(false);
  const [selectedImovel, setSelectedImovel] = useState<Imovel | null>(null);
  const [corretorAutoAtribuido, setCorretorAutoAtribuido] = useState<string | null>(null);

  // Carregar corretores dos imóveis ao abrir modal
  useEffect(() => {
    if (showCreateModal && tenantId) {
      // Buscar corretores únicos diretamente dos imóveis
      const corretoresFromImoveis = getCorretoresFromImoveis(tenantId);
      setCorretores(corretoresFromImoveis);
      if (DEBUG_LOGS) console.log(`📋 ${corretoresFromImoveis.length} corretores únicos carregados dos imóveis`);
      // Resetar estado do imóvel selecionado
      setSelectedImovel(null);
      setCorretorAutoAtribuido(null);
      setImovelSuggestions([]);
    }
  }, [showCreateModal, tenantId]);

  // Buscar sugestões de imóveis ao digitar código
  const handleCodigoImovelChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setNewLead({ ...newLead, interest_reference: upperValue });
    
    if (tenantId && upperValue.length >= 2) {
      const suggestions = searchImoveisByCodigo(tenantId, upperValue, 8);
      setImovelSuggestions(suggestions);
      setShowImovelSuggestions(suggestions.length > 0);
    } else {
      setImovelSuggestions([]);
      setShowImovelSuggestions(false);
    }
    
    // Se limpar o campo, resetar seleção
    if (!upperValue) {
      setSelectedImovel(null);
      setCorretorAutoAtribuido(null);
      setNewLead(prev => ({ ...prev, attended_by: '', is_exclusive: 'nao' }));
    }
  };

  // Selecionar imóvel da lista de sugestões
  const handleSelectImovel = (imovel: Imovel) => {
    setSelectedImovel(imovel);
    setNewLead(prev => ({ 
      ...prev, 
      interest_reference: imovel.referencia,
      is_exclusive: ((imovel as any).exclusivo ?? (imovel as any).exclusividade) ? 'sim' : 'nao'
    }));
    setShowImovelSuggestions(false);
    setImovelSuggestions([]);
    
    // Auto-atribuir corretor responsável pelo imóvel
    if (imovel.corretor_nome) {
      setCorretorAutoAtribuido(imovel.corretor_nome);
      setNewLead(prev => ({ ...prev, attended_by: imovel.corretor_nome || '' }));
      if (DEBUG_LOGS) console.log(`✅ Corretor auto-atribuído: ${imovel.corretor_nome}`);
    }
  };

  // Buscar corretor do lead para exibir no drawer
  const getCorretorDoLead = (lead: IntegrationLead): { nome: string; imovel?: Imovel } | null => {
    // Primeiro verifica se já tem attendedBy
    if (lead.attendedBy?.name) {
      return { nome: lead.attendedBy.name };
    }
    
    // Buscar pelo código do imóvel de interesse
    const codigoImovel = lead.interest?.referenceLead || lead.interest?.reference;
    if (codigoImovel && tenantId) {
      const imovel = getImovelByCodigo(tenantId, codigoImovel);
      if (imovel?.corretor_nome) {
        return { nome: imovel.corretor_nome, imovel };
      }
    }
    
    return null;
  };
  
  const openLeadDetails = (lead: IntegrationLead) => {
    setSelectedLead(lead);
    setShowModal(true);
  };
  
  const closeModal = () => {
    setShowModal(false);
    setSelectedLead(null);
  };

  // Carregar leads do Supabase
  const loadLeadsFromSupabase = useCallback(async () => {
    if (!tenantId) return;
    
    setIsLoading(true);
    try {
      const { leads: kenloLeads, error } = await fetchKenloLeads(tenantId);
      if (error) {
        console.error('Erro ao buscar leads:', error);
        setLeads([]);
      } else {
        setLeads(kenloLeads);
        if (DEBUG_LOGS) console.log(`✅ ${kenloLeads.length} leads carregados do Supabase`);
      }
    } catch (e) {
      console.error('Erro ao buscar leads:', e);
      setLeads([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  // Carregar leads ao montar ou quando tenantId mudar
  useEffect(() => {
    loadLeadsFromSupabase();
  }, [loadLeadsFromSupabase]);

  // Escutar novos leads do polling global e atualizar automaticamente
  useEffect(() => {
    const unsubscribe = addLeadListener((newLeadsCount) => {
      if (DEBUG_LOGS) console.log(`🔔 [CentralLeads] ${newLeadsCount} novos leads detectados, recarregando...`);
      loadLeadsFromSupabase();
    });

    return () => unsubscribe();
  }, [loadLeadsFromSupabase]);

  // Auto-refresh a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      if (DEBUG_LOGS) console.log('🔄 [CentralLeads] Auto-refresh...');
      loadLeadsFromSupabase();
    }, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, [loadLeadsFromSupabase]);

  // Obter lista de portais únicos
  const portaisUnicos = useMemo(() => {
    const portais = leads
      .map(lead => lead.portal)
      .filter(portal => portal && portal.trim() !== '')
      .filter((portal, index, array) => array.indexOf(portal) === index)
      .sort();
    return portais;
  }, [leads]);

  // Filtrar leads pela busca e portal
  const getLeadVisitDate = (lead: IntegrationLead): Date | null => {
    const raw = (lead as any)?.raw_data;
    const candidates = [
      raw?.data_visita,
      raw?.dataVisita,
      raw?.visit_date,
      raw?.visitDate,
      raw?.visita_agendada,
      raw?.visitaAgendada,
      raw?.visita_agendada_em,
      raw?.visitaAgendadaEm,
      raw?.scheduled_visit_at,
      raw?.scheduledVisitAt,
      raw?.schedule_visit_at,
      raw?.scheduleVisitAt,
      raw?.appointment_at,
      raw?.appointmentAt,
      raw?.data_retorno,
      raw?.dataRetorno,
      raw?.follow_up_at,
      raw?.followUpAt,
    ];

    for (const c of candidates) {
      if (!c) continue;
      const d = new Date(String(c));
      if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
  };

  const isLeadAttended = (lead: IntegrationLead) => {
    const attendedBy = (lead as any)?.attendedBy;
    if (attendedBy?.name) return true;
    if (Array.isArray(attendedBy) && attendedBy[0]?.name) return true;
    if ((lead as any)?.raw_data?.attendedBy?.name) return true;
    return false;
  };

  const filteredLeads = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();

    const base = leads.filter((lead) => {
      const matchesSearch = (
        lead.client.name?.toLowerCase().includes(searchLower) ||
        lead.client.email?.toLowerCase().includes(searchLower) ||
        lead.client.phone?.includes(searchTerm)
      );

      const matchesPortal = portalFilter === 'todos' || lead.portal === portalFilter;
      return matchesSearch && matchesPortal;
    });

    const now = Date.now();

    const byTab = base.filter((lead) => {
      if (activeTab === 'todos') return true;
      const id = String(lead._id);
      const isFav = favoriteIds.has(id);
      if (activeTab === 'favoritos') return isFav;

      const attended = isLeadAttended(lead);
      const visitDt = getLeadVisitDate(lead);
      const hasVisit = Boolean(visitDt);
      const isFuture = visitDt ? visitDt.getTime() > now : false;

      if (activeTab === 'visitas') return hasVisit;
      if (activeTab === 'futura') return isFuture;

      // A fazer: sem visita cadastrada e ainda não atendido
      return !hasVisit && !attended;
    });

    if (activeTab !== 'a_fazer') return byTab;

    const todayStr = new Date().toDateString();
    const pending = byTab;
    if (aFazerSubArea === 'nao_respondidas') return pending;
    if (aFazerSubArea === 'atividades_hoje') {
      return pending.filter((lead) => new Date(lead.timestamp).toDateString() === todayStr);
    }
    if (aFazerSubArea === 'pendentes') {
      return pending.filter((lead) => new Date(lead.timestamp).toDateString() !== todayStr);
    }
    return pending;
  }, [leads, searchTerm, portalFilter, activeTab, favoriteIds, aFazerSubArea]);

  const aFazerSubAreas = useMemo(() => {
    const todayStr = new Date().toDateString();
    const pending = leads.filter((lead) => {
      const attended = isLeadAttended(lead);
      const visitDt = getLeadVisitDate(lead);
      const hasVisit = Boolean(visitDt);
      return !hasVisit && !attended;
    });

    const atividadesHoje = pending.filter((lead) => new Date(lead.timestamp).toDateString() === todayStr).length;
    const pendentes = pending.length - atividadesHoje;

    return [
      { id: 'nao_respondidas' as AFazerSubArea, label: 'Não respondidas', count: pending.length },
      { id: 'atividades_hoje' as AFazerSubArea, label: 'Atividades para hoje', count: atividadesHoje },
      { id: 'pendentes' as AFazerSubArea, label: 'Pendentes', count: pendentes },
    ];
  }, [leads]);

  const tabCounts = useMemo(() => {
    const now = Date.now();
    let aFazer = 0;
    let visitas = 0;
    let futura = 0;
    let favoritos = 0;
    for (const lead of leads) {
      const id = String(lead._id);
      if (favoriteIds.has(id)) favoritos += 1;
      const visitDt = getLeadVisitDate(lead);
      const attended = isLeadAttended(lead);
      const hasVisit = Boolean(visitDt);
      if (hasVisit) visitas += 1;
      if (visitDt && visitDt.getTime() > now) futura += 1;
      if (!hasVisit && !attended) aFazer += 1;
    }
    return {
      a_fazer: aFazer,
      visitas,
      futura,
      favoritos,
      todos: leads.length,
    } as Record<LeadsTab, number>;
  }, [leads, favoriteIds]);

  // Paginação
  const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
  const startIndex = (currentPage - 1) * leadsPerPage;
  const paginatedLeads = filteredLeads.slice(startIndex, startIndex + leadsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, portalFilter, aFazerSubArea]);

  useEffect(() => {
    try {
      localStorage.setItem(AF_SUBAREA_KEY, String(aFazerSubArea));
    } catch {
      // ignore
    }
  }, [AF_SUBAREA_KEY, aFazerSubArea]);

  useEffect(() => {
    if (activeTab !== 'a_fazer') return;
    const known = new Set(aFazerSubAreas.map((x) => x.id));
    if (!known.has(aFazerSubArea)) {
      setAFazerSubArea('nao_respondidas');
    }
  }, [activeTab, aFazerSubAreas, aFazerSubArea]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favoriteIds)));
    } catch {
      // ignore
    }
  }, [FAVORITES_KEY, favoriteIds]);

  const toggleFavorite = (leadId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  // Formatar data
  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  const getLeadAssignedDate = (lead: IntegrationLead): Date | null => {
    const raw = (lead as any)?.raw_data;
    const candidates = [
      raw?.data_atribuicao,
      raw?.dataAtribuicao,
      raw?.assigned_at,
      raw?.assignedAt,
      raw?.assignment_at,
      raw?.assignmentAt,
      raw?.attended_at,
      raw?.attendedAt,
      raw?.attended_by_at,
      raw?.attendedByAt,
      raw?.attendedBy?.assigned_at,
      raw?.attendedBy?.assignedAt,
      raw?.attendedBy?.timestamp,
      raw?.attendedBy?.date,
      raw?.updated_at,
      raw?.updatedAt,
      lead.timestamp,
    ];

    for (const c of candidates) {
      if (!c) continue;
      const d = new Date(String(c));
      if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
  };

  const formatElapsed = (from: Date, to: Date) => {
    const ms = Math.max(0, to.getTime() - from.getTime());
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Formatar telefone
  const formatPhone = (phone: string) => {
    if (!phone) return '-';
    // Remove caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');
    
    // Detectar e remover DDD duplicado
    // Padrão: DDD foi concatenado ao telefone que já tinha DDD
    // Ex: "11" + "11982918424" = "1111982918424" (13 dígitos)
    // Ex: "35" + "35999606968" = "3535999606968" (13 dígitos)
    if (cleaned.length >= 13) {
      const first2 = cleaned.slice(0, 2);
      const next2 = cleaned.slice(2, 4);
      // Se os primeiros 4 dígitos são DDD duplicado (ex: 1111, 3535)
      if (first2 === next2) {
        // Remove os primeiros 2 dígitos (o DDD duplicado)
        cleaned = cleaned.slice(2);
      }
    }
    
    // Se ainda tem mais de 11 dígitos, pega os últimos 11 (celular com DDD)
    if (cleaned.length > 11) {
      cleaned = cleaned.slice(-11);
    }
    
    // Celular com DDD (11 dígitos): (XX) 9XXXX-XXXX
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    // Fixo com DDD (10 dígitos): (XX) XXXX-XXXX
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    // Celular sem DDD (9 dígitos): 9XXXX-XXXX
    if (cleaned.length === 9) {
      return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
    }
    // Fixo sem DDD (8 dígitos): XXXX-XXXX
    if (cleaned.length === 8) {
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
    }
    return phone;
  };

  // Atualizar leads (recarregar do Supabase)
  const handleRefresh = () => {
    loadLeadsFromSupabase();
  };

  // Criar novo lead via API
  const handleCreateLead = async () => {
    if (!newLead.name.trim() || !newLead.phone.trim()) {
      setCreateError('Nome e telefone são obrigatórios');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      // Buscar API Key do tenant
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      if (!url || !anonKey) {
        throw new Error('Configuração inválida: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY não encontrados no build.');
      }

      const supabase = createClient(url, anonKey);

      const { data: apiKeyData } = await supabase
        .from('tenant_api_keys')
        .select('api_key')
        .eq('tenant_id', tenantId)
        .eq('provider', 'crm')
        .eq('status', 'active')
        .maybeSingle();

      if (!apiKeyData?.api_key) {
        setCreateError('API Key não encontrada. Gere uma chave em Configurações > Integrações > API');
        setIsCreating(false);
        return;
      }

      // Chamar API para criar lead
      const response = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyData.api_key}`
        },
        body: JSON.stringify({
          name: newLead.name.trim(),
          phone: newLead.phone.trim(),
          email: newLead.email.trim() || undefined,
          interest_reference: newLead.interest_reference.trim() || undefined,
          is_exclusive: newLead.is_exclusive === 'sim',
          portal: newLead.portal || 'Manual',
          message: newLead.message.trim() || undefined,
          attended_by: newLead.attended_by.trim() || undefined
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || 'Erro ao criar lead');
      }

      // Sucesso - fechar modal e recarregar leads
      setShowCreateModal(false);
      setNewLead({
        name: '',
        phone: '',
        email: '',
        interest_reference: '',
        is_exclusive: 'nao',
        portal: 'Manual',
        message: '',
        attended_by: ''
      });
      loadLeadsFromSupabase();

      if (DEBUG_LOGS) console.log('✅ Lead criado com sucesso:', result.data);
    } catch (error: any) {
      console.error('Erro ao criar lead:', error);
      setCreateError(error.message || 'Erro ao criar lead');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className={embedded ? 'w-full' : 'min-h-screen flex'}
      style={embedded ? undefined : { backgroundColor: 'var(--bg-secondary, #f8fafc)' }}
    >
      {/* Conteúdo Principal */}
      <div
        className={embedded ? 'w-full transition-all duration-300 ease-in-out' : 'flex-1 p-6 transition-all duration-300 ease-in-out'}
        style={{ marginRight: showModal ? '400px' : '0' }}
      >
        {!embedded && (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Central de Leads</h1>
                  <p className="text-sm text-muted-foreground mt-1">Leads recebidos via integrações</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    style={{ color: '#ffffff' }}
                  >
                    <Plus className="w-4 h-4" style={{ color: '#ffffff' }} />
                    Criar Lead
                  </button>
                  <button
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
                </div>
              </div>
            </div>

            {/* Cards de Métricas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-background border border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total de Leads</p>
                <p className="text-2xl font-bold text-foreground">{leads.length}</p>
              </div>
              <div className="p-4 bg-background border border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Leads Hoje</p>
                <p className="text-2xl font-bold text-foreground">
                  {leads.filter((l) => {
                    const today = new Date().toDateString();
                    return new Date(l.timestamp).toDateString() === today;
                  }).length}
                </p>
              </div>
              <div className="p-4 bg-background border border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Com E-mail</p>
                <p className="text-2xl font-bold text-foreground">{leads.filter((l) => l.client.email).length}</p>
              </div>
            </div>
          </>
        )}

        {embedded && (
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Central de Leads</h2>
              <p className="text-xs text-muted-foreground">Leads recebidos via integrações</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                style={{ color: '#ffffff' }}
              >
                <Plus className="w-4 h-4" style={{ color: '#ffffff' }} />
                Criar Lead
              </button>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>
          </div>
        )}

      {/* Container da Tabela */}
      <div className="bg-background border border-border/40 rounded-lg overflow-hidden shadow-sm">
        {/* Barra de Filtros */}
        <div className="px-4 py-4 border-b border-border/30">
          {/* Linha: Busca + Filtros de Data */}
          <div className="flex gap-4 items-end">
            {/* Busca */}
            <div className="relative w-96">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, email ou telefone..."
                className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-border/40 rounded-lg text-sm focus:ring-1 focus:ring-border/40 outline-none"
              />
            </div>

            {/* Data Inicial */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                De
              </label>
              <input
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
                className="h-10 px-3 rounded-lg border border-border/40 bg-muted/50 text-sm text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Data Final */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Até
              </label>
              <input
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                className="h-10 px-3 rounded-lg border border-border/40 bg-muted/50 text-sm text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Filtro de Portal */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                Portal
              </label>
              <select
                value={portalFilter}
                onChange={(e) => {
                  setPortalFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 px-3 rounded-lg border border-border/40 bg-muted/50 text-sm text-foreground focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value="todos">Todos</option>
                {portaisUnicos.map(portal => (
                  <option key={portal} value={portal}>{portal}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="px-4 pt-3 border-b border-border/30">
          <div className="grid grid-cols-5 w-full">
            {(
              [
                { id: 'a_fazer', label: 'A fazer', Icon: CheckSquare },
                { id: 'visitas', label: 'Visitas', Icon: CalendarCheck2 },
                { id: 'futura', label: 'Futura', Icon: Clock3 },
                { id: 'favoritos', label: 'Favoritos', Icon: Star },
                { id: 'todos', label: 'Todos', Icon: List },
              ] as Array<{ id: LeadsTab; label: string; Icon: React.ComponentType<{ className?: string }> }>
            ).map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  data-active={isActive ? 'true' : 'false'}
                  className={`central-leads-tab group relative w-full inline-flex items-center justify-center gap-3 px-3 pb-5 text-xl font-semibold transition-colors ${
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-blue-600" />
                  )}
                  <t.Icon
                    className={`w-7 h-7 ${
                      isActive ? 'text-blue-600' : 'text-muted-foreground group-hover:text-blue-600'
                    }`}
                  />
                  <span>{t.label}</span>
                  <span
                    className={`text-base px-3 py-1 rounded-full border ${
                      isActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-border bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    {tabCounts[t.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'a_fazer' && aFazerSubAreas.length > 0 && (
          <div className="px-4 py-3 border-b border-border/30">
            <div className="rounded-lg border border-border/40 overflow-hidden bg-background">
              <div className="grid grid-cols-3">
                {aFazerSubAreas.map((s) => {
                  const isActive = aFazerSubArea === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setAFazerSubArea(s.id)}
                      className={`min-w-0 flex items-center gap-2 justify-between px-4 py-3 text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      }`}
                    >
                      <span className="min-w-0 font-medium truncate">{s.label}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          isActive ? 'border-blue-200 bg-white text-blue-700' : 'border-border bg-background text-muted-foreground'
                        }`}
                      >
                        {s.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo da Tabela */}
        {leads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum lead recebido</h3>
            <p className="text-sm text-muted-foreground">
              Os leads aparecerão aqui quando você conectar uma integração
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/30">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Telefone
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      E-mail
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Data
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Portal
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {paginatedLeads.map((lead) => (
                    <tr 
                      key={lead._id} 
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => openLeadDetails(lead)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-foreground font-medium text-sm">
                            {lead.client.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{lead.client.name || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground">ID: {lead._id.slice(-8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{formatPhone(lead.client.phone)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground">{lead.client.email || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{formatDate(lead.timestamp)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.portal ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-muted text-foreground">
                            {lead.portal}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavorite(String(lead._id));
                            }}
                            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                            title={favoriteIds.has(String(lead._id)) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                          >
                            <Star
                              className={`w-4 h-4 ${favoriteIds.has(String(lead._id)) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`}
                            />
                          </button>
                          <button className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando {startIndex + 1} a {Math.min(startIndex + leadsPerPage, filteredLeads.length)} de {filteredLeads.length} leads
                </p>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-border/40 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                  
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 border border-border/40 rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
      {/* Drawer Lateral de Detalhes */}
      {showModal && selectedLead && (
        <>
          {/* Drawer */}
          <div 
            className="fixed top-0 right-0 h-full w-[400px] z-50 overflow-hidden border-l border-border bg-muted/70 backdrop-blur-md"
            style={{ animation: 'slideIn 0.2s ease-out' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">Detalhes do Lead</h2>
                <button
                  type="button"
                  onClick={() => toggleFavorite(String(selectedLead._id))}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  title={favoriteIds.has(String(selectedLead._id)) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                >
                  <Star
                    className={`w-4 h-4 ${favoriteIds.has(String(selectedLead._id)) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`}
                  />
                </button>
              </div>
              <button 
                onClick={closeModal}
                className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Conteúdo */}
            <div className="overflow-y-auto h-[calc(100vh-57px)] p-4">
              {/* Avatar e Nome */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center text-foreground text-lg font-medium">
                  {selectedLead.client.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{selectedLead.client.name || 'Sem nome'}</h3>
                  <p className="text-sm text-muted-foreground">{formatDate(selectedLead.timestamp)}</p>
                </div>
              </div>
              
              {/* Contato */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{formatPhone(selectedLead.client.phone)}</span>
                </div>
                {selectedLead.client.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">{selectedLead.client.email}</span>
                  </div>
                )}
              </div>
              
              {/* Divider */}
              <div className="border-t border-border my-5" />
              
              {/* Mensagem */}
              {selectedLead.message && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Mensagem</h4>
                  <p className="text-sm text-foreground leading-relaxed">{selectedLead.message}</p>
                </div>
              )}
              
              {/* Imóvel */}
              {selectedLead.interest && typeof selectedLead.interest === 'object' && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Imóvel de Interesse</h4>
                  
                  {/* Card do Imóvel */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    {selectedLead.interest.image && (
                      <img 
                        src={selectedLead.interest.image} 
                        alt="Imóvel"
                        className="w-full h-40 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="p-4">
                      {(selectedLead.interest.referenceLead || selectedLead.interest.reference) && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2.5 py-1 bg-foreground text-background text-xs font-semibold rounded-lg">
                            {selectedLead.interest.referenceLead || selectedLead.interest.reference}
                          </span>
                          {selectedLead.interest.isSale && (
                            <span className="px-2 py-0.5 bg-muted text-foreground text-xs font-medium rounded-lg">Venda</span>
                          )}
                          {selectedLead.interest.isRent && (
                            <span className="px-2 py-0.5 bg-muted text-foreground text-xs font-medium rounded-lg">Aluguel</span>
                          )}
                        </div>
                      )}
                      {selectedLead.interest.type && (
                        <p className="text-sm text-foreground capitalize">{selectedLead.interest.type}</p>
                      )}
                      {(selectedLead.interest.neighborhood || selectedLead.interest.city) && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {[selectedLead.interest.neighborhood, selectedLead.interest.city].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Portal */}
              <div className="mb-6">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Origem</h4>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{selectedLead.portal || 'Não informado'}</span>
                </div>
              </div>
              
              {/* Corretor Responsável - Busca pelo imóvel ou attendedBy */}
              {(() => {
                const corretorInfo = getCorretorDoLead(selectedLead);
                if (corretorInfo) {
                  const assignedAt = getLeadAssignedDate(selectedLead);
                  const tempoComCorretor = assignedAt ? formatElapsed(assignedAt, new Date()) : null;
                  return (
                    <div className="mb-6">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Corretor Responsável
                        {corretorInfo.imovel && (
                          <span className="ml-2 text-green-600 font-normal dark:text-green-400">(via imóvel)</span>
                        )}
                      </h4>
                      <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg dark:bg-green-950/40 dark:border-green-900">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-700 text-sm font-semibold dark:bg-green-950/60 dark:text-green-300">
                          {corretorInfo.nome?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">{corretorInfo.nome}</p>
                          {tempoComCorretor && (
                            <p className="text-xs text-green-600 mt-0.5 dark:text-green-400">Com o lead há {tempoComCorretor}</p>
                          )}
                          {corretorInfo.imovel && (
                            <p className="text-xs text-green-600 dark:text-green-400">
                              Responsável pelo imóvel {corretorInfo.imovel.referencia}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // Fallback - attendedBy como objeto
                if (selectedLead.attendedBy && typeof selectedLead.attendedBy === 'object') {
                  return (
                    <div className="mb-6">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Atendido por</h4>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-foreground text-sm font-medium">
                          {selectedLead.attendedBy.name?.charAt(0) || '?'}
                        </div>
                        <span className="text-sm text-foreground">{selectedLead.attendedBy.name || 'Não informado'}</span>
                      </div>
                    </div>
                  );
                }
                
                // Sem corretor - mostrar mensagem
                return (
                  <div className="mb-6">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Corretor Responsável</h4>
                    <p className="text-sm text-muted-foreground italic">Nenhum corretor atribuído</p>
                  </div>
                );
              })()}

              {/* Botão de arquivar */}
              <div className="pb-4 pt-2 border-t border-border mt-2">
                <button
                  type="button"
                  onClick={() => { setShowArchiveConfirm(true); setArchiveMotivo(''); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors text-sm font-medium dark:text-orange-400"
                >
                  <Archive className="w-4 h-4" />
                  Arquivar lead
                </button>
              </div>
            </div>
          </div>

          {/* Confirmação de arquivamento */}
          {showArchiveConfirm && selectedLead && (
            <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/40 pb-4 px-4">
              <div className="w-full bg-white rounded-xl shadow-xl p-5 space-y-4 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <Archive className="h-5 w-5 text-orange-500" />
                  <span className="font-semibold text-gray-900 dark:text-slate-100">Arquivar lead</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Arquivando: <strong>{selectedLead.client.name}</strong>
                </p>
                <textarea
                  rows={3}
                  placeholder="Motivo do arquivamento (opcional)..."
                  value={archiveMotivo}
                  onChange={(e) => setArchiveMotivo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 dark:border-slate-800"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(false)}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={arquivando}
                    onClick={async () => {
                      if (!selectedLead) return;
                      setArquivando(true);
                      try {
                        const result = await arquivarKenloLead(
                          String(selectedLead._id),
                          archiveMotivo || 'Arquivado pelo usuário'
                        );
                        if (result.success) {
                          setLeads(prev => prev.filter(l => String(l._id) !== String(selectedLead._id)));
                          setShowArchiveConfirm(false);
                          setShowModal(false);
                          setSelectedLead(null);
                        }
                      } finally {
                        setArquivando(false);
                      }
                    }}
                    className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    {arquivando ? 'Arquivando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* CSS Animation */}
          <style>{`
            @keyframes slideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}

      {/* Modal de Criar Lead */}
      {showCreateModal && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowCreateModal(false)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="bg-background rounded-xl shadow-2xl w-[360px] max-w-[92vw] border border-border max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center dark:bg-blue-950/60">
                    <Plus className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Criar Lead</h2>
                    <p className="text-xs text-muted-foreground">Cadastre um novo lead manualmente</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              
              {/* Form */}
              <div className="px-4 py-3 space-y-2 overflow-y-auto">
                {/* Nome */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={newLead.name}
                    onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                    placeholder="Nome do cliente"
                    className="w-full px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                
                {/* Telefone */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    Telefone *
                  </label>
                  <input
                    type="tel"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                
                {/* Email */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={newLead.email}
                    onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                
                {/* Código do Imóvel - Com autocomplete */}
                <div className="relative">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Home className="w-4 h-4 text-muted-foreground" />
                    Código do Imóvel
                  </label>
                  <input
                    type="text"
                    value={newLead.interest_reference}
                    onChange={(e) => handleCodigoImovelChange(e.target.value)}
                    onBlur={() => setTimeout(() => setShowImovelSuggestions(false), 200)}
                    onFocus={() => {
                      if (imovelSuggestions.length > 0) setShowImovelSuggestions(true);
                    }}
                    placeholder="Digite o código (ex: CA0117, AP0929)"
                    className="w-full px-3 py-1.5 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono"
                  />
                  
                  {/* Lista de sugestões de imóveis */}
                  {showImovelSuggestions && imovelSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {imovelSuggestions.map((imovel, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectImovel(imovel)}
                          className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono font-semibold text-foreground">{imovel.referencia}</span>
                              <span className="text-muted-foreground text-xs ml-2">
                                {imovel.tipo || imovel.tipoSimplificado}
                              </span>
                            </div>
                            {imovel.corretor_nome && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1 dark:bg-green-950/60 dark:text-green-300">
                                <User className="w-3 h-3" />
                                {imovel.corretor_nome}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {[imovel.bairro, imovel.cidade].filter(Boolean).join(' - ')}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Imóvel selecionado */}
                  {selectedImovel && (
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg dark:bg-green-950/40 dark:border-green-900">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono font-semibold text-green-800 dark:text-green-300">{selectedImovel.referencia}</span>
                          <span className="text-green-600 text-xs ml-2 dark:text-green-400">{selectedImovel.tipo}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImovel(null);
                            setCorretorAutoAtribuido(null);
                            setNewLead(prev => ({ ...prev, interest_reference: '', attended_by: '', is_exclusive: 'nao' }));
                          }}
                          className="text-green-600 hover:text-green-800 dark:text-green-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-green-600 mt-1 dark:text-green-400">
                        {[selectedImovel.bairro, selectedImovel.cidade].filter(Boolean).join(' - ')}
                      </p>
                      {selectedImovel.corretor_nome && (
                        <p className="text-xs text-green-700 mt-1 font-medium dark:text-green-300">
                          ✓ Corretor: {selectedImovel.corretor_nome}
                        </p>
                      )}
                      <p className="text-xs text-green-700 mt-1 font-medium dark:text-green-300">
                        ✓ Exclusividade: {newLead.is_exclusive === 'sim' ? 'Exclusivo' : 'Não exclusivo'}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <CheckSquare className="w-4 h-4 text-muted-foreground" />
                    Exclusividade do imóvel
                  </label>
                  <select
                    value={newLead.is_exclusive}
                    onChange={(e) => setNewLead({ ...newLead, is_exclusive: e.target.value as 'sim' | 'nao' })}
                    className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="nao">Não exclusivo</option>
                    <option value="sim">Exclusivo</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Se um imóvel for selecionado, a exclusividade é preenchida automaticamente pelo cadastro do imóvel.
                  </p>
                </div>
                
                {/* Corretor Responsável */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    Corretor Responsável
                    {corretorAutoAtribuido && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-2 dark:bg-green-950/60 dark:text-green-300">
                        ✓ Auto-atribuído
                      </span>
                    )}
                  </label>
                  <select
                    value={newLead.attended_by}
                    onChange={(e) => {
                      setNewLead({ ...newLead, attended_by: e.target.value });
                      // Se mudou manualmente, remover indicação de auto-atribuição
                      if (e.target.value !== corretorAutoAtribuido) {
                        setCorretorAutoAtribuido(null);
                      }
                    }}
                    className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${
                      corretorAutoAtribuido 
                        ? 'bg-green-50 border-green-300' 
                        : 'bg-muted/50 border-border'
                    }`}
                  >
                    <option value="">Selecione um corretor</option>
                    {corretores.map((corretor, idx) => (
                      <option key={idx} value={corretor.nome}>
                        {corretor.nome} {corretor.imoveisCount > 0 ? `(${corretor.imoveisCount} imóveis)` : ''}
                      </option>
                    ))}
                  </select>
                  {corretores.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Nenhum corretor encontrado. Sincronize os imóveis em Integrações.
                    </p>
                  )}
                </div>
                
                {/* Portal */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    Origem
                  </label>
                  <select
                    value={newLead.portal}
                    onChange={(e) => setNewLead({ ...newLead, portal: e.target.value })}
                    className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="Manual">Manual</option>
                    <option value="Site">Site</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Telefone">Telefone</option>
                    <option value="Indicação">Indicação</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                
                {/* Mensagem */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    Mensagem / Observações
                  </label>
                  <textarea
                    value={newLead.message}
                    onChange={(e) => setNewLead({ ...newLead, message: e.target.value })}
                    placeholder="Observações sobre o lead..."
                    rows={3}
                    className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                  />
                </div>
                
                {/* Erro */}
                {createError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/40 dark:border-red-900">
                    <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
                  </div>
                )}
              </div>
              
              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateLead}
                  disabled={isCreating || !newLead.name.trim() || !newLead.phone.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Criar Lead
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CentralLeadsPage;
