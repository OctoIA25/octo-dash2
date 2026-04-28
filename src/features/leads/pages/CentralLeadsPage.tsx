/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * CentralLeadsPage - Área de Leads das Integrações
 * 
 * Esta página exibe os leads que chegam via integrações (Kenlo, etc.)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Phone,
  Mail,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  Clock,
  Plus,
  User,
  Home,
  Loader2,
  CheckCircle2,
  CheckSquare,
  MessageSquare,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import { atualizarStatusLeadCRM } from '@/features/leads/services/leadsService';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';
import type { ProcessedLead } from '@/data/realLeadsProcessor';
import { getImovelByCodigo } from '@/features/imoveis/services/imoveisXmlService';
import type { Imovel } from '@/features/imoveis/services/kenloService';
import { CriarLeadQuickModal } from '@/features/leads/components/CriarLeadQuickModal';

const ETAPAS_INTERESSADO = [
  'Novos Leads',
  'Interação',
  'Visita Agendada',
  'Visita Realizada',
  'Negociação',
  'Proposta Criada',
  'Proposta Enviada',
  'Proposta Assinada',
] as const;

type Etapa = (typeof ETAPAS_INTERESSADO)[number];

const ETAPA_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  'Novos Leads':       { bg: 'bg-cyan-50 dark:bg-cyan-950/40',     text: 'text-cyan-700 dark:text-cyan-300',     ring: 'ring-cyan-200 dark:ring-cyan-900' },
  'Interação':         { bg: 'bg-blue-50 dark:bg-blue-950/40',     text: 'text-blue-700 dark:text-blue-300',     ring: 'ring-blue-200 dark:ring-blue-900' },
  'Visita Agendada':   { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-200 dark:ring-emerald-900' },
  'Visita Realizada':  { bg: 'bg-green-50 dark:bg-green-950/40',   text: 'text-green-700 dark:text-green-300',   ring: 'ring-green-200 dark:ring-green-900' },
  'Negociação':        { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', ring: 'ring-orange-200 dark:ring-orange-900' },
  'Proposta Criada':   { bg: 'bg-amber-50 dark:bg-amber-950/40',   text: 'text-amber-700 dark:text-amber-300',   ring: 'ring-amber-200 dark:ring-amber-900' },
  'Proposta Enviada':  { bg: 'bg-red-50 dark:bg-red-950/40',       text: 'text-red-700 dark:text-red-300',       ring: 'ring-red-200 dark:ring-red-900' },
  'Proposta Assinada': { bg: 'bg-rose-50 dark:bg-rose-950/40',     text: 'text-rose-700 dark:text-rose-300',     ring: 'ring-rose-200 dark:ring-rose-900' },
};

const getEtapaStyle = (etapa: string) => ETAPA_COLORS[etapa] ?? { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', ring: 'ring-slate-200 dark:ring-slate-700' };

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

  // Fonte de dados única, compartilhada com o Kanban — useLeadsMetrics
  // assina leadsEventEmitter, então move-de-card no Kanban re-renderiza aqui.
  const { processedLeads: leads, isLoading } = useLeadsMetrics();

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const leadsPerPage = 10;

  // Filtros de data
  const [dataInicial, setDataInicial] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dataFinal, setDataFinal] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Filtro de portal (origem_lead)
  const [portalFilter, setPortalFilter] = useState('todos');

  // Drawer de detalhes
  const [selectedLead, setSelectedLead] = useState<ProcessedLead | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Atualização de etapa (stage)
  const [updatingEtapa, setUpdatingEtapa] = useState(false);
  const [etapaError, setEtapaError] = useState<string | null>(null);
  
  // Modal de criar lead — reutiliza o mesmo componente do Kanban (sem API key)
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Buscar corretor a partir do código do imóvel (mantido para enriquecer o drawer)
  const getCorretorByImovel = (codigoImovel?: string): { nome: string; imovel: Imovel } | null => {
    if (!codigoImovel || !tenantId) return null;
    const imovel = getImovelByCodigo(tenantId, codigoImovel);
    if (imovel?.corretor_nome) {
      return { nome: imovel.corretor_nome, imovel };
    }
    return null;
  };

  const openLeadDetails = (lead: ProcessedLead) => {
    setSelectedLead(lead);
    setShowModal(true);
    setEtapaError(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedLead(null);
    setEtapaError(null);
  };

  // Atualiza a etapa do lead (compartilha a mesma função usada pelo Kanban)
  // → reflete imediatamente no Kanban via leadsEventEmitter.emit().
  const handleChangeEtapa = async (novaEtapa: Etapa) => {
    if (!selectedLead) return;
    if (selectedLead.etapa_atual === novaEtapa) return;

    setUpdatingEtapa(true);
    setEtapaError(null);
    const leadIdStr = String(selectedLead.id_lead);

    try {
      const result = await atualizarStatusLeadCRM(leadIdStr, novaEtapa);
      if (!result.success) {
        throw new Error(result.message || 'Falha ao atualizar etapa');
      }
      // Update otimista local + dispara re-render global (Kanban + Início + aqui)
      setSelectedLead({ ...selectedLead, etapa_atual: novaEtapa });
      leadsEventEmitter.emit();
    } catch (err) {
      console.error('[CentralLeads] Erro ao atualizar etapa:', err);
      setEtapaError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setUpdatingEtapa(false);
    }
  };

  // Lista de portais (origens) únicos para o filtro
  const portaisUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const lead of leads) {
      const origem = (lead.origem_lead || '').trim();
      if (origem) set.add(origem);
    }
    return Array.from(set).sort();
  }, [leads]);

  // Filtragem: busca (nome/telefone/código imóvel) + período + portal.
  const filteredLeads = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    const start = dataInicial ? new Date(`${dataInicial}T00:00:00`).getTime() : -Infinity;
    const end = dataFinal ? new Date(`${dataFinal}T23:59:59`).getTime() : Infinity;

    return leads.filter((lead) => {
      const nome = (lead.nome_lead || '').toLowerCase();
      const tel = (lead.telefone || '').replace(/\D/g, '');
      const codigo = (lead.codigo_imovel || '').toLowerCase();

      const matchesSearch =
        searchLower === '' ||
        nome.includes(searchLower) ||
        tel.includes(searchTerm.replace(/\D/g, '')) ||
        codigo.includes(searchLower);

      const matchesPortal = portalFilter === 'todos' || lead.origem_lead === portalFilter;

      const entradaTs = lead.data_entrada ? new Date(lead.data_entrada).getTime() : 0;
      const matchesData = entradaTs === 0 || (entradaTs >= start && entradaTs <= end);

      return matchesSearch && matchesPortal && matchesData;
    });
  }, [leads, searchTerm, portalFilter, dataInicial, dataFinal]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / leadsPerPage));
  const startIndex = (currentPage - 1) * leadsPerPage;
  const paginatedLeads = filteredLeads.slice(startIndex, startIndex + leadsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, portalFilter, dataInicial, dataFinal]);

  // Quando os leads são atualizados externamente (ex: kanban moveu um card),
  // re-sincroniza o lead aberto no drawer com a nova versão.
  useEffect(() => {
    if (!selectedLead) return;
    const fresh = leads.find((l) => l.id_lead === selectedLead.id_lead);
    if (fresh && fresh.etapa_atual !== selectedLead.etapa_atual) {
      setSelectedLead(fresh);
    }
  }, [leads, selectedLead]);

  // Formatar data (data_entrada vem como ISO ou yyyy-mm-dd)
  const formatDate = (timestamp: string | undefined) => {
    if (!timestamp) return '-';
    try {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return timestamp;
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
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

  // Atualizar leads (dispara refetch global do useLeadsMetrics)
  const handleRefresh = () => {
    leadsEventEmitter.emit();
  };

  return (
    <div
      key="central-leads"
      className={embedded ? 'w-full' : 'animate-in fade-in-0 slide-in-from-bottom-3 duration-300 ease-out'}
    >
      <div
        className={embedded ? 'w-full transition-all duration-300 ease-in-out' : 'px-6 py-5 transition-all duration-300 ease-in-out'}
        style={{ marginRight: showModal ? '400px' : '0' }}
      >
        <div className={embedded ? 'w-full' : 'max-w-[1400px] mx-auto'}>
        {!embedded && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
              <div>
                <h1 className="text-[22px] font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">
                  Central de Leads
                </h1>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Leads recebidos via integrações
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                  Criar Lead
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 transition-all hover:border-slate-300 hover:shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-[18px] h-[18px] text-slate-700 dark:text-slate-300" strokeWidth={1.6} />
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total de Leads</p>
                </div>
                <p className="text-[26px] font-bold text-slate-900 dark:text-slate-100 leading-none tracking-tight">
                  {leads.length.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 transition-all hover:border-slate-300 hover:shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-[18px] h-[18px] text-slate-700 dark:text-slate-300" strokeWidth={1.6} />
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Leads Hoje</p>
                </div>
                <p className="text-[26px] font-bold text-slate-900 dark:text-slate-100 leading-none tracking-tight">
                  {leads.filter((l) => {
                    if (!l.data_entrada) return false;
                    const today = new Date().toDateString();
                    return new Date(l.data_entrada).toDateString() === today;
                  }).length.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 transition-all hover:border-slate-300 hover:shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-[18px] h-[18px] text-slate-700 dark:text-slate-300" strokeWidth={1.6} />
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Visitas Agendadas</p>
                </div>
                <p className="text-[26px] font-bold text-slate-900 dark:text-slate-100 leading-none tracking-tight">
                  {leads.filter((l) => (l.etapa_atual || '').toLowerCase().includes('visita agendada')).length.toLocaleString('pt-BR')}
                </p>
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
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

        {/* Indicador "Todos" + contagem (substitui as 5 abas antigas) */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[13px] font-semibold">
            <Users className="w-4 h-4" strokeWidth={2} />
            Todos os leads
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 font-semibold">
              {filteredLeads.length}
            </span>
          </span>
          {isLoading && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              carregando...
            </span>
          )}
        </div>

        {/* Conteúdo da Tabela */}
        {leads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 mb-1">
              {isLoading ? 'Carregando leads…' : 'Nenhum lead encontrado'}
            </h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Leads do CRM e das integrações aparecem aqui automaticamente.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Telefone</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Etapa</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data entrada</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Origem</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Imóvel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedLeads.map((lead) => {
                    const etapaStyle = getEtapaStyle(lead.etapa_atual);
                    return (
                      <tr
                        key={lead.id_lead}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                        onClick={() => openLeadDetails(lead)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-[12px]">
                              {lead.nome_lead?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-slate-100 text-[13px] truncate">{lead.nome_lead || 'Sem nome'}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">ID: {lead.id_lead}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[13px] text-slate-700 dark:text-slate-200">{formatPhone(lead.telefone || '')}</span>
                        </td>
                        <td className="px-4 py-3">
                          {lead.etapa_atual ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${etapaStyle.bg} ${etapaStyle.text}`}>
                              {lead.etapa_atual}
                            </span>
                          ) : (
                            <span className="text-[12px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{formatDate(lead.data_entrada)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {lead.origem_lead ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {lead.origem_lead}
                            </span>
                          ) : (
                            <span className="text-[12px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{lead.codigo_imovel || '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
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
      </div>
      {/* Drawer Lateral de Detalhes */}
      {showModal && selectedLead && (() => {
        const etapaStyle = getEtapaStyle(selectedLead.etapa_atual);
        const corretorInfo = getCorretorByImovel(selectedLead.codigo_imovel);
        return (
          <>
            {/* Drawer */}
            <div
              className="fixed top-0 right-0 h-full w-[400px] z-50 overflow-hidden border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl"
              style={{ animation: 'slideIn 0.2s ease-out' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Detalhes do Lead</h2>
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Conteúdo */}
              <div className="overflow-y-auto h-[calc(100vh-56px)] p-4">
                {/* Avatar + nome + etapa atual */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[16px] font-semibold">
                    {selectedLead.nome_lead?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedLead.nome_lead || 'Sem nome'}</h3>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">Entrou em {formatDate(selectedLead.data_entrada)}</p>
                  </div>
                </div>

                {/* Etapa atual + selector */}
                <div className="mb-5">
                  <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                    Etapa atual
                  </h4>
                  {selectedLead.etapa_atual ? (
                    <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-[13px] font-semibold ${etapaStyle.bg} ${etapaStyle.text} ring-1 ${etapaStyle.ring}`}>
                      {selectedLead.etapa_atual}
                    </div>
                  ) : (
                    <p className="text-[13px] text-slate-400 italic">Sem etapa definida</p>
                  )}

                  <p className="mt-3 mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mover para</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ETAPAS_INTERESSADO.map((etapa) => {
                      const isCurrent = selectedLead.etapa_atual === etapa;
                      const s = getEtapaStyle(etapa);
                      return (
                        <button
                          key={etapa}
                          type="button"
                          disabled={updatingEtapa || isCurrent}
                          onClick={() => handleChangeEtapa(etapa)}
                          className={`text-left px-2.5 py-2 rounded-lg text-[12px] font-semibold transition-all border ${
                            isCurrent
                              ? `${s.bg} ${s.text} border-transparent ring-1 ${s.ring} cursor-default`
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                          } disabled:opacity-60`}
                        >
                          {isCurrent && <span className="mr-1">✓</span>}
                          {etapa}
                        </button>
                      );
                    })}
                  </div>
                  {updatingEtapa && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Atualizando…
                    </p>
                  )}
                  {etapaError && (
                    <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">⚠ {etapaError}</p>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-slate-200 dark:border-slate-800 my-4" />

                {/* Contato */}
                <div className="space-y-2.5 mb-5">
                  <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contato</h4>
                  <div className="flex items-center gap-2.5 text-[13px]">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700 dark:text-slate-200">{formatPhone(selectedLead.telefone || '')}</span>
                  </div>
                </div>

                {/* Imóvel + valor */}
                {(selectedLead.codigo_imovel || selectedLead.valor_imovel) && (
                  <div className="mb-5">
                    <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Imóvel de interesse</h4>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/40 space-y-1">
                      {selectedLead.codigo_imovel && (
                        <div className="flex items-center gap-1.5">
                          <Home className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">{selectedLead.codigo_imovel}</span>
                          {selectedLead.tipo_negocio && (
                            <span className="ml-1 text-[10.5px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">{selectedLead.tipo_negocio}</span>
                          )}
                        </div>
                      )}
                      {selectedLead.valor_imovel ? (
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">
                          {selectedLead.valor_imovel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Origem */}
                {selectedLead.origem_lead && (
                  <div className="mb-5">
                    <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Origem</h4>
                    <div className="flex items-center gap-2 text-[13px]">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-700 dark:text-slate-200">{selectedLead.origem_lead}</span>
                    </div>
                  </div>
                )}

                {/* Visita agendada */}
                {selectedLead.Data_visita && (
                  <div className="mb-5">
                    <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Visita</h4>
                    <div className="flex items-center gap-2 text-[13px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-700 dark:text-slate-200">{formatDate(selectedLead.Data_visita)}</span>
                    </div>
                  </div>
                )}

                {/* Corretor */}
                <div className="mb-5">
                  <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Corretor responsável
                    {corretorInfo && <span className="ml-2 text-emerald-600 dark:text-emerald-400 normal-case font-normal">(via imóvel)</span>}
                  </h4>
                  {selectedLead.corretor_responsavel || corretorInfo ? (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-700 dark:text-emerald-300 text-[12px] font-semibold">
                        {(selectedLead.corretor_responsavel || corretorInfo?.nome || '?').charAt(0).toUpperCase()}
                      </div>
                      <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">
                        {selectedLead.corretor_responsavel || corretorInfo?.nome}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-slate-400 italic">Nenhum corretor atribuído</p>
                  )}
                </div>
              </div>
            </div>

            {/* CSS Animation */}
            <style>{`
              @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>
          </>
        );
      })()}

      {/* Modal de Criar Lead — reutiliza o componente do Kanban (Supabase direto, sem API key) */}
      <CriarLeadQuickModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        tenantId={tenantId}
      />
    </div>
  );
};

export default CentralLeadsPage;
