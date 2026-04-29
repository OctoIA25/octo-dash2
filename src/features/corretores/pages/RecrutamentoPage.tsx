/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Recrutamento
 * Rota: /recrutamento
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RecrutamentoFunnelChart } from '../components/RecrutamentoFunnelChart';
import { RecrutamentoPerformanceChart } from '../components/RecrutamentoPerformanceChart';
import { useRecruitment } from '../hooks/useRecruitment';
import { useAuth } from '@/hooks/useAuth';
import {
  Users,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Filter,
  Calendar,
  Mail,
  Phone,
  Briefcase,
  TrendingUp,
  BarChart3,
  UserPlus,
  Clock,
  Award,
  X,
  ExternalLink,
  FileDown,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface RecrutamentoPageProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface Candidato {
  id: string | number;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  status: 'Lead' | 'Interação' | 'Reunião' | 'Onboard' | 'Aprovado' | 'Rejeitado';
  dataInscricao: string;
  experiencia: string;
  linkedin?: string;
  curriculo?: string;
  observacoes?: string;
  etapas?: {
    etapa: string;
    data: string;
    responsavel: string;
    notas: string;
  }[];
}

export const RecrutamentoPage = ({ leads, onRefresh, isRefreshing }: RecrutamentoPageProps) => {
  const { user } = useAuth();

  // Use recruitment hook with real data
  const {
    candidatos,
    candidatoSelecionado,
    metrics,
    monthlyMetrics,
    isLoading,
    isLoadingMetrics,
    isRefreshing: hookIsRefreshing,
    currentPage,
    totalPages,
    totalCount,
    itemsPerPage,
    searchTerm,
    filtroStatus,
    filtroCargo,
    filtroExperiencia,
    refresh,
    createCandidato,
    updateCandidato,
    deleteCandidato,
    changeCandidateStatus,
    setCurrentPage,
    nextPage,
    previousPage,
    setSearchTerm: setHookSearchTerm,
    setFiltroStatus: setHookFiltroStatus,
    setFiltroCargo: setHookFiltroCargo,
    setFiltroExperiencia: setHookFiltroExperiencia,
    clearFilters,
    selectCandidato,
    candidatosFiltrados,
    candidatosPorStatus,
    candidatosPorCargo,
    candidateSources,
    isLoadingSources,
    filtrosAtivos
  } = useRecruitment({ autoRefresh: true, refreshInterval: 30000 });

  // Local state for modals and forms
  const [modalOpen, setModalOpen] = useState(false);
  const [novoModalOpen, setNovoModalOpen] = useState(false);
  const [novoFormData, setNovoFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cargo: 'Corretor Júnior',
    experiencia: '',
    linkedin: '',
    observacoes: '',
    fonte: ''
  } as {
    nome: string;
    email: string;
    telefone: string;
    cargo: string;
    experiencia: string;
    linkedin: string;
    observacoes: string;
    fonte: string;
  });
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'recrutamento');
  }, []);

  // Wrapper functions for local state
  const setSearchTerm = (term: string) => {
    setHookSearchTerm(term);
  };

  const setFiltroStatus = (status: string) => {
    setHookFiltroStatus(status);
  };

  const setFiltroCargo = (cargo: string) => {
    setHookFiltroCargo(cargo);
  };

  const setFiltroExperiencia = (experiencia: string) => {
    setHookFiltroExperiencia(experiencia);
  };

  // Handle candidate selection
  const handleVerDetalhes = (candidato: any) => {
    selectCandidato(candidato);
    setModalOpen(true);
  };

  // Handle status change
  const handleMudarStatus = async (novoStatus: string) => {
    if (candidatoSelecionado) {
      try {
        await changeCandidateStatus(candidatoSelecionado.id, novoStatus, user?.email);
        selectCandidato(null);
        setModalOpen(false);
      } catch (error) {
        console.error('Error changing status:', error);
      }
    }
  };

  const formatTelefone = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    
    if (cleaned.length === 0) return '';
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    
    // Lógica corrigida: detectar DDD baseado no tamanho total
    if (cleaned.length === 10) {
      // 10 dígitos = (XX) XXXX-XXXX
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6, 10)}`;
    } else if (cleaned.length === 11) {
      // 11 dígitos = (XX) XXXXX-XXXX
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
    } else {
      if (cleaned.length > 6) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6, 10)}`;
      }
      return cleaned;
    }
  };

  // Handle new candidate creation
  const handleNovoCandidato = async () => {
    try {
      // Validações completas antes de criar candidato
      const errors: Record<string, string> = {};

      // Validaçoes de nome
      if (!novoFormData.nome || novoFormData.nome.trim().length < 3) {
        errors.nome = 'Nome é obrigatório e deve ter pelo menos 3 caracteres';
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!novoFormData.email || !emailRegex.test(novoFormData.email)) {
        errors.email = 'Email inválido';
      }

      const cleanedTelefone = novoFormData.telefone.replace(/\D/g, '');
      
      if (!novoFormData.telefone || cleanedTelefone.length < 10 || cleanedTelefone.length > 11) {
        errors.telefone = 'Telefone deve ter 10 ou 11 dígitos';
      } else {
        const telefoneRegex = /^\(\d{2}\)\s?\d{4,5}-\d{4}$/;
        if (!telefoneRegex.test(novoFormData.telefone)) {
          errors.telefone = 'Telefone inválido. Use formato: (11) 98765-4321';
        }
      }

      if (!novoFormData.cargo || novoFormData.cargo === '') {
        errors.cargo = 'Cargo é obrigatório';
      }

      if (!novoFormData.experiencia || novoFormData.experiencia === '') {
        errors.experiencia = 'Experiência é obrigatória';
      }

      if (!novoFormData.fonte || novoFormData.fonte === '') {
        errors.fonte = 'Fonte é obrigatória';
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      const newCandidato = {
        nome: novoFormData.nome.trim(),
        email: novoFormData.email.trim().toLowerCase(),
        telefone: novoFormData.telefone,
        cargo: novoFormData.cargo,
        experiencia: novoFormData.experiencia,
        linkedin: novoFormData.linkedin?.trim() || undefined,
        observacoes: novoFormData.observacoes?.trim() || undefined,
        fonte: novoFormData.fonte
      };

      await createCandidato(newCandidato);


      // Reset form
      setNovoFormData({
        nome: '',
        email: '',
        telefone: '',
        cargo: 'Corretor Júnior',
        experiencia: '',
        linkedin: '',
        observacoes: '',
        fonte: ''
      });
      setValidationErrors([]);
      setFieldErrors({});
      setNovoModalOpen(false);
    } catch (error) {
      console.error('Error creating candidate:', error);
    }
  };

  // Get paginated candidates
  const candidatosPaginados = candidatosFiltrados.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Clear filters function
  const limparFiltros = () => {
    clearFilters();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Lead':
        return 'bg-[#88C0E5]/10 text-[#88C0E5] dark:bg-[#88C0E5]/20 dark:text-[#88C0E5]';
      case 'Interação':
        return 'bg-[#598DC6]/10 text-[#598DC6] dark:bg-[#598DC6]/20 dark:text-[#88C0E5]';
      case 'Reunião':
        return 'bg-[#234992]/10 text-[#234992] dark:bg-[#234992]/20 dark:text-[#598DC6]';
      case 'Onboard':
        return 'bg-[#324F74]/10 text-[#324F74] dark:bg-[#324F74]/20 dark:text-[#598DC6]';
      case 'Aprovado':
        return 'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 dark:bg-green-900/30 dark:text-green-400';
      case 'Rejeitado':
        return 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  return (
    <div className="w-full h-full overflow-auto">
      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-2">
                Recrutamento
              </h1>
              <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 font-normal">
                Gestão de processos de recrutamento e seleção de novos corretores
              </p>
            </div>
            <Button
              className="novo-candidato-button gap-2 !bg-blue-600 hover:!bg-blue-700 shadow-sm hover:shadow-md transition-all [&_svg]:!text-white"
              onClick={() => setNovoModalOpen(true)}
              style={{ color: '#ffffff' }}
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span className="novo-candidato-button-text">Novo Candidato</span>
            </Button>
          </div>
        </div>

        {/* Seção de Métricas */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-gray-900 dark:text-slate-100 dark:text-white" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white">Métricas de Recrutamento</h2>
          </div>

          {/* Grid de Métricas Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-300 dark:text-blue-400" />
                  Tempo Médio de Processo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
                  {metrics?.tempoMedioProcesso > 0 ? `${metrics.tempoMedioProcesso} dias` : 'N/A'}
                </p>
                <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                  Do primeiro contato à contratação
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Award className="h-4 w-4 text-green-600 dark:text-green-300 dark:text-green-400" />
                  Taxa de Retenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
                  {metrics?.taxaRetencao ? `${metrics.taxaRetencao}%` : 'Calculando...'}
                </p>
                <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                  Corretores ativos após 6 meses
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-300 dark:text-purple-400" />
                  Custo por Contratação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 dark:text-white mb-2">
                  {metrics?.custoPorContratacao ? `R$ ${metrics.custoPorContratacao}k` : 'Calculando...'}
                </p>
                <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                  Investimento médio por contratação
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Grid de Cards de Métricas de Candidatos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-1">
                      Candidatos Ativos
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 dark:text-white">{candidatos.length}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-300 dark:text-green-400" />
                      <span className="text-xs text-green-600 dark:text-green-300 dark:text-green-400 font-medium">
                        {candidatos.length > 0
                          ? `${Math.round((candidatos.filter(c => ['Interação', 'Reunião', 'Onboard', 'Aprovado'].includes(c.status)).length / candidatos.length) * 100)}%`
                          : '0%'
                        }
                      </span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[#88C0E5]/10 dark:bg-[#88C0E5]/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-[#88C0E5] dark:text-[#88C0E5]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-1">
                      Em Avaliação
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 dark:text-white">
                      {candidatos.filter(c => c.status === 'Interação' || c.status === 'Reunião').length}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400 font-medium">Em análise</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[#598DC6]/10 dark:bg-[#598DC6]/20 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-[#598DC6] dark:text-[#88C0E5]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-1">
                      Em Onboard
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 dark:text-white">
                      {candidatos.filter(c => c.status === 'Onboard').length}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400 font-medium">Este mês</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950/60 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-300 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-1">
                      Taxa de Conversão
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 dark:text-white">
                      {candidatos.length > 0 ? Math.round((candidatos.filter(c => c.status === 'Onboard').length / candidatos.length) * 100) : 0}%
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400 font-medium">Média</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[#234992]/10 dark:bg-[#234992]/20 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-[#234992] dark:text-[#598DC6]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Layout 2 Colunas: Funil à Esquerda, Performance à Direita */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Coluna Esquerda - Funil de Recrutamento */}
            <div className="h-[735px]">
              <RecrutamentoFunnelChart candidatos={candidatos} />
            </div>

            {/* Coluna Direita - Performance de Conversão */}
            <div className="h-[735px]">
              <RecrutamentoPerformanceChart candidatos={candidatos} />
            </div>
          </div>

          {/* Métricas por Período */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Performance Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {monthlyMetrics && monthlyMetrics.length > 0 ? (
                    monthlyMetrics.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-100 dark:text-white">{item.mes}</p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                            {item.candidatos} candidatos • {item.contratados} contratados
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 px-4">
                      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                        <Users className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                      </div>
                      <p className="text-lg font-light text-gray-900 dark:text-slate-100 dark:text-white">
                        Nenhum dado de performance mensal disponível
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200/60 dark:border-gray-700/60">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Fontes de Candidatos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(candidateSources).length > 0 ? Object.entries(candidateSources).map(([fonte, quantidade], idx) => {
                    const percentual = candidatos.length > 0 ? Math.round((quantidade / candidatos.length) * 100) : 0;
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300">{fonte}</span>
                          <span className="text-gray-600 dark:text-slate-400 dark:text-gray-400">{quantidade} ({percentual}%)</span>
                        </div>
                        <div className="relative w-full h-2 bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                            style={{ width: `${percentual}%` }}
                          />
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">Nenhuma fonte de candidatos encontrada</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Seção de Candidatos */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <UserPlus className="h-5 w-5 text-gray-900 dark:text-slate-100 dark:text-white" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white">Candidatos</h2>
          </div>

          {/* Filtros e Busca */}
          <Card className="mb-6 border-gray-200/60 dark:border-gray-700/60">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
                  <Input
                    placeholder="Buscar candidatos por nome, email ou cargo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Popover open={filtrosOpen} onOpenChange={setFiltrosOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={`gap-2 ${filtrosAtivos ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 dark:bg-blue-900/20' : ''}`}>
                      <Filter className="h-4 w-4" />
                      Filtros
                      {filtrosAtivos && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                          {[filtroStatus !== 'todos', filtroCargo !== 'todos', filtroExperiencia !== 'todos'].filter(Boolean).length}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-900 dark:text-slate-100 dark:text-white">Filtros</h4>
                        {filtrosAtivos && (
                          <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-xs text-blue-600 dark:text-blue-300 hover:text-blue-700">
                            Limpar todos
                          </Button>
                        )}
                      </div>

                      {/* Filtro por Status */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300">Status</label>
                        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todos os status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os status</SelectItem>
                            <SelectItem value="Lead">Lead</SelectItem>
                            <SelectItem value="Interação">Interação</SelectItem>
                            <SelectItem value="Reunião">Reunião</SelectItem>
                            <SelectItem value="Onboard">Onboard</SelectItem>
                            <SelectItem value="Aprovado">Aprovado</SelectItem>
                            <SelectItem value="Rejeitado">Rejeitado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Filtro por Cargo */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300">Cargo</label>
                        <Select value={filtroCargo} onValueChange={setFiltroCargo}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todos os cargos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os cargos</SelectItem>
                            <SelectItem value="Corretor Júnior">Corretor Júnior</SelectItem>
                            <SelectItem value="Corretor Pleno">Corretor Pleno</SelectItem>
                            <SelectItem value="Corretor Sênior">Corretor Sênior</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Filtro por Experiência */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300">Experiência</label>
                        <Select value={filtroExperiencia} onValueChange={setFiltroExperiencia}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas as experiências" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todas as experiências</SelectItem>
                            <SelectItem value="0-2 anos">0-2 anos</SelectItem>
                            <SelectItem value="1-3 anos">1-3 anos</SelectItem>
                            <SelectItem value="2 anos">2 anos</SelectItem>
                            <SelectItem value="3-5 anos">3-5 anos</SelectItem>
                            <SelectItem value="3-6 anos">3-6 anos</SelectItem>
                            <SelectItem value="5 anos">5 anos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        className="w-full mt-2"
                        onClick={() => setFiltrosOpen(false)}
                      >
                        Aplicar Filtros
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Indicador de filtros ativos */}
              {filtrosAtivos && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400">Filtros ativos:</span>
                  {filtroStatus !== 'todos' && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      Status: {filtroStatus}
                      <button onClick={() => setFiltroStatus('todos')} className="ml-1 hover:text-red-500">×</button>
                    </Badge>
                  )}
                  {filtroCargo !== 'todos' && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      Cargo: {filtroCargo}
                      <button onClick={() => setFiltroCargo('todos')} className="ml-1 hover:text-red-500">×</button>
                    </Badge>
                  )}
                  {filtroExperiencia !== 'todos' && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      Exp: {filtroExperiencia}
                      <button onClick={() => setFiltroExperiencia('todos')} className="ml-1 hover:text-red-500">×</button>
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lista de Candidatos */}
          <Card className="border-gray-200/60 dark:border-gray-700/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-medium">Candidatos</CardTitle>
              <span className="text-sm text-gray-500 dark:text-slate-400 dark:text-gray-400">
                {candidatosFiltrados.length} candidato{candidatosFiltrados.length !== 1 ? 's' : ''} encontrado{candidatosFiltrados.length !== 1 ? 's' : ''}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {candidatosPaginados.length > 0 ? (
                <>
                  <div className="divide-y divide-gray-200 dark:divide-slate-800 dark:divide-gray-700">
                    {candidatosPaginados.map((candidato) => (
                      <div
                        key={candidato.id}
                        className="p-4 hover:bg-gray-50 dark:hover:bg-slate-800/60 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onClick={() => handleVerDetalhes(candidato)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                              {candidato.nome.charAt(0)}
                            </div>

                            {/* Informações */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium text-gray-900 dark:text-slate-100 dark:text-white">
                                  {candidato.nome}
                                </h3>
                                <Badge className={`text-xs ${getStatusColor(candidato.status)}`}>
                                  {candidato.status}
                                </Badge>
                                <span className="text-xs text-gray-400 dark:text-slate-500">
                                  {new Date(candidato.data_inscricao).toLocaleDateString('pt-BR')}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                                <div className="flex items-center gap-2">
                                  <Briefcase className="h-3.5 w-3.5" />
                                  <span>{candidato.cargo}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-3.5 w-3.5" />
                                  <span>Experiência: {candidato.experiencia}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3.5 w-3.5" />
                                  <span className="truncate">{candidato.email}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3.5 w-3.5" />
                                  <span>{candidato.telefone}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Ações */}
                          <div className="flex gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVerDetalhes(candidato);
                              }}
                            >
                              Ver Detalhes
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Paginação */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                      <div className="text-sm text-gray-500 dark:text-slate-400 dark:text-gray-400">
                        Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, candidatosFiltrados.length)} de {candidatosFiltrados.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={previousPage}
                          disabled={currentPage === 1}
                          className="gap-1"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>

                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }

                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(pageNum)}
                                className="w-8 h-8 p-0"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={nextPage}
                          disabled={currentPage === totalPages}
                          className="gap-1"
                        >
                          Próximo
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                  </div>
                  <h3 className="text-lg font-light text-gray-900 dark:text-slate-100 dark:text-white mb-2">
                    {filtrosAtivos || searchTerm ? 'Nenhum candidato encontrado' : 'Nenhum candidato no momento'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 dark:text-gray-400 font-light max-w-md mx-auto">
                    Comece a adicionar candidatos para gerenciar o processo de recrutamento
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Modal de Detalhes do Candidato */}
        {modalOpen && candidatoSelecionado && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Modal */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-800 dark:border-gray-700">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-2xl">
                    {candidatoSelecionado.nome.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                      {candidatoSelecionado.nome}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                      {candidatoSelecionado.cargo}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
                </button>
              </div>

              {/* Conteúdo do Modal */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {/* Status e Ações Rápidas */}
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300">Status atual:</span>
                    <Badge className={`${getStatusColor(candidatoSelecionado.status)}`}>
                      {candidatoSelecionado.status}
                    </Badge>
                  </div>

                  {/* Botões de Mudança de Status */}
                  <div className="flex flex-wrap gap-2">
                    {['Lead', 'Interação', 'Reunião', 'Onboard', 'Aprovado', 'Rejeitado'].map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={candidatoSelecionado.status === status ? 'default' : 'outline'}
                        onClick={() => handleMudarStatus(status as Candidato['status'])}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Informações de Contato */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg font-medium">Informações de Contato</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                      <a href={`mailto:${candidatoSelecionado.email}`} className="text-blue-600 dark:text-blue-300 dark:text-blue-400 hover:underline">
                        {candidatoSelecionado.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                      <a href={`tel:${candidatoSelecionado.telefone}`} className="text-gray-900 dark:text-slate-100 dark:text-white">
                        {candidatoSelecionado.telefone}
                      </a>
                    </div>
                    {candidatoSelecionado.linkedin && (
                      <div className="flex items-center gap-3">
                        <ExternalLink className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                        <a
                          href={`https://${candidatoSelecionado.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-300 dark:text-blue-400 hover:underline"
                        >
                          {candidatoSelecionado.linkedin}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Informações Profissionais */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg font-medium">Informações Profissionais</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">Experiência:</span>
                      <span className="font-medium text-gray-900 dark:text-slate-100 dark:text-white">{candidatoSelecionado.experiencia}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">Data de Inscrição:</span>
                      <span className="font-medium text-gray-900 dark:text-slate-100 dark:text-white">
                        {new Date(candidatoSelecionado.data_inscricao).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {candidatoSelecionado.curriculo && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">Currículo:</span>
                        <Button size="sm" variant="outline" className="gap-2">
                          <FileDown className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Observações */}
                {candidatoSelecionado.observacoes && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="text-lg font-medium">Observações</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 dark:text-slate-300 dark:text-gray-300">
                        {candidatoSelecionado.observacoes}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Histórico de Etapas */}
                {candidatoSelecionado.etapas && candidatoSelecionado.etapas.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-medium">Histórico do Processo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {candidatoSelecionado.etapas.map((etapa, idx) => (
                          <div key={idx} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                                }`} />
                              {idx < candidatoSelecionado.etapas!.length - 1 && (
                                <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 my-1" />
                              )}
                            </div>
                            <div className="flex-1 pb-6">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="font-medium text-gray-900 dark:text-slate-100 dark:text-white">{etapa.etapa}</h4>
                                <span className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400">
                                  {new Date(etapa.data).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mb-1">
                                Responsável: {etapa.responsavel}
                              </p>
                              <p className="text-sm text-gray-700 dark:text-slate-300 dark:text-gray-300">
                                {etapa.notas}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Footer do Modal */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Fechar
                </Button>
                <Button>
                  Salvar Alterações
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Novo Candidato */}
        {novoModalOpen && createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onMouseDown={() => setNovoModalOpen(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 dark:bg-gray-900 rounded-2xl shadow-2xl w-[360px] max-w-[92vw] max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header do Modal */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-800 dark:border-gray-700">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                    Novo Candidato
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mt-1">
                    Preencha os dados do candidato
                  </p>
                </div>
                <button
                  onClick={() => setNovoModalOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
                </button>
              </div>

              {/* Conteúdo do Modal */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                <div className="space-y-4">
                  {/* Nome */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                      Nome Completo *
                    </label>
                    <Input
                      placeholder="Ex: João Silva"
                      value={novoFormData.nome}
                      onChange={(e) => {
                        setNovoFormData({ ...novoFormData, nome: e.target.value });
                        // Limpar erro do campo quando usuário digitar
                        if (fieldErrors.nome) {
                          setFieldErrors({ ...fieldErrors, nome: '' });
                        }
                      }}
                      className={fieldErrors.nome ? 'border-red-500 focus:border-red-500' : ''}
                    />
                    {fieldErrors.nome && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        {fieldErrors.nome}
                      </p>
                    )}
                  </div>

                  {/* Email e Telefone */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                        Email *
                      </label>
                      <Input
                        type="email"
                        placeholder="joao.silva@email.com"
                        value={novoFormData.email}
                        onChange={(e) => {
                          setNovoFormData({ ...novoFormData, email: e.target.value });
                          // Limpar erro do campo quando usuário digitar
                          if (fieldErrors.email) {
                            setFieldErrors({ ...fieldErrors, email: '' });
                          }
                        }}
                        className={fieldErrors.email ? 'border-red-500 focus:border-red-500' : ''}
                      />
                      {fieldErrors.email && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.email}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                        Telefone *
                      </label>
                      <Input
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={novoFormData.telefone}
                        onChange={(e) => {
                          const formattedValue = formatTelefone(e.target.value);
                          setNovoFormData({ ...novoFormData, telefone: formattedValue });
                          // Limpar erro do campo quando usuário digitar
                          if (fieldErrors.telefone) {
                            setFieldErrors({ ...fieldErrors, telefone: '' });
                          }
                        }}
                        className={fieldErrors.telefone ? 'border-red-500 focus:border-red-500' : ''}
                      />
                      {fieldErrors.telefone && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.telefone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cargo e Experiência */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                        Cargo *
                      </label>
                      <Select
                        value={novoFormData.cargo}
                        onValueChange={(value) => {
                          setNovoFormData({ ...novoFormData, cargo: value });
                          // Limpar erro do campo quando usuário selecionar
                          if (fieldErrors.cargo) {
                            setFieldErrors({ ...fieldErrors, cargo: '' });
                          }
                        }}
                      >
                        <SelectTrigger className={fieldErrors.cargo ? 'border-red-500 focus:border-red-500' : ''}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Corretor Júnior">Corretor Júnior</SelectItem>
                          <SelectItem value="Corretor Pleno">Corretor Pleno</SelectItem>
                          <SelectItem value="Corretor Sênior">Corretor Sênior</SelectItem>
                          <SelectItem value="Gerente de Vendas">Gerente de Vendas</SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldErrors.cargo && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.cargo}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                        Experiência *
                      </label>
                      <Input
                        placeholder="Ex: 5 anos"
                        value={novoFormData.experiencia}
                        onChange={(e) => {
                          setNovoFormData({ ...novoFormData, experiencia: e.target.value });
                          // Limpar erro do campo quando usuário digitar
                          if (fieldErrors.experiencia) {
                            setFieldErrors({ ...fieldErrors, experiencia: '' });
                          }
                        }}
                        className={fieldErrors.experiencia ? 'border-red-500 focus:border-red-500' : ''}
                      />
                      {fieldErrors.experiencia && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.experiencia}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* LinkedIn */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                      LinkedIn
                    </label>
                    <Input
                      placeholder="linkedin.com/in/joaosilva"
                      value={novoFormData.linkedin}
                      onChange={(e) => setNovoFormData({ ...novoFormData, linkedin: e.target.value })}
                    />
                  </div>

                  {/* Fonte e Observações */}
                  <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                        Fonte *
                      </label>
                      <Select
                        value={novoFormData.fonte}
                        onValueChange={(value) => {
                          setNovoFormData({ ...novoFormData, fonte: value });
                          // Limpar erro do campo quando usuário selecionar
                          if (fieldErrors.fonte) {
                            setFieldErrors({ ...fieldErrors, fonte: '' });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a fonte" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                          <SelectItem value="Indicação">Indicação</SelectItem>
                          <SelectItem value="Site Institucional">Site Institucional</SelectItem>
                          <SelectItem value="Email Marketing">Email Marketing</SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldErrors.fonte && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {fieldErrors.fonte}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                        Observações
                      </label>
                      <Textarea
                        placeholder="Adicione observações sobre o candidato..."
                        rows={4}
                        value={novoFormData.observacoes}
                        onChange={(e) => setNovoFormData({ ...novoFormData, observacoes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer do Modal */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-slate-800 dark:border-gray-700">
                <Button variant="outline" onClick={() => setNovoModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleNovoCandidato}>
                  Adicionar Candidato
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
};
