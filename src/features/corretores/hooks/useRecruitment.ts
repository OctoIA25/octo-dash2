import { useState, useEffect, useCallback, useMemo } from 'react';
import { recruitmentService, type CandidatoComEtapas, type RecruitmentMetrics, type SearchParams } from '../services/recruitmentService';
import { filtrarCandidatos, recorteCanalPeriodo, temFiltroAtivo, type FiltrosCandidato } from '../domain/filtrarCandidatos';

export interface UseRecruitmentOptions {
  tenantId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  initialParams?: Omit<SearchParams, 'tenantId'>;
}

export interface UseRecruitmentReturn {
  // Data
  candidatos: CandidatoComEtapas[];
  candidatoSelecionado: CandidatoComEtapas | null;
  metrics: RecruitmentMetrics | null;
  monthlyMetrics: any[];

  // Loading states
  isLoading: boolean;
  isLoadingMetrics: boolean;
  isRefreshing: boolean;

  // Pagination
  currentPage: number;
  totalPages: number;
  totalCount: number;
  itemsPerPage: number;

  // Search and filters
  searchTerm: string;
  filtroStatus: string;
  filtroCargo: string;
  filtroExperiencia: string;
  filtroCanal: string;
  filtroCondicao: string;
  periodoDe: string;
  periodoAte: string;

  // Actions
  refresh: () => Promise<void>;
  loadCandidatos: (params?: SearchParams) => Promise<void>;
  loadCandidatoById: (id: string) => Promise<CandidatoComEtapas | null>;
  createCandidato: (candidato: any) => Promise<void>;
  updateCandidato: (id: string, updates: any) => Promise<void>;
  deleteCandidato: (id: string) => Promise<void>;
  changeCandidateStatus: (id: string, status: string, responsavel?: string, notas?: string) => Promise<void>;

  // Pagination actions
  setCurrentPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;

  // Filter actions
  setSearchTerm: (term: string) => void;
  setFiltroStatus: (status: string) => void;
  setFiltroCargo: (cargo: string) => void;
  setFiltroExperiencia: (experiencia: string) => void;
  setFiltroCanal: (canal: string) => void;
  setFiltroCondicao: (condicao: string) => void;
  setPeriodoDe: (data: string) => void;
  setPeriodoAte: (data: string) => void;
  candidatosNoRecorte: CandidatoComEtapas[];
  /** Os oito filtros num objeto só — o Kanban aplica os mesmos sobre a carga completa. */
  filtros: FiltrosCandidato;
  clearFilters: () => void;

  // Selection
  selectCandidato: (candidato: CandidatoComEtapas | null) => void;

  // Computed values
  candidatosFiltrados: CandidatoComEtapas[];
  candidatosPorStatus: Record<string, number>;
  candidatosPorCargo: Record<string, number>;
  candidateSources: Record<string, number>;
  isLoadingSources: boolean;
  filtrosAtivos: boolean;
}

export const useRecruitment = ({ tenantId, autoRefresh = false, refreshInterval = 60000, initialParams }: UseRecruitmentOptions): UseRecruitmentReturn => {

  // State
  const [candidatos, setCandidatos] = useState<CandidatoComEtapas[]>([]);
  const [candidatoSelecionado, setCandidatoSelecionado] = useState<CandidatoComEtapas | null>(null);
  const [metrics, setMetrics] = useState<RecruitmentMetrics | null>(null);
  const [monthlyMetrics, setMonthlyMetrics] = useState<any[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroCargo, setFiltroCargo] = useState('todos');
  const [filtroExperiencia, setFiltroExperiencia] = useState('todos');
  const [filtroCanal, setFiltroCanal] = useState('todos');
  const [filtroCondicao, setFiltroCondicao] = useState('todas');
  const [periodoDe, setPeriodoDe] = useState('');
  const [periodoAte, setPeriodoAte] = useState('');

  // Computed values
  const totalPages = useMemo(() => Math.ceil(totalCount / itemsPerPage), [totalCount, itemsPerPage]);

  const filtros = useMemo<FiltrosCandidato>(() => ({
    searchTerm, filtroStatus, filtroCargo, filtroExperiencia, filtroCanal, filtroCondicao, periodoDe, periodoAte,
  }), [searchTerm, filtroStatus, filtroCargo, filtroExperiencia, filtroCanal, filtroCondicao, periodoDe, periodoAte]);

  /**
   * Recorte de PERÍODO e CANAL: vale para o funil, os indicadores e a lista.
   * Fica separado dos demais filtros de propósito — filtrar o funil por estágio
   * faria cada barra mostrar só quem está nela, que é o bug que ele corrige.
   * A regra mora em domain/filtrarCandidatos, junto com a do Kanban.
   */
  const candidatosNoRecorte = useMemo(() => recorteCanalPeriodo(candidatos, filtros), [candidatos, filtros]);

  const candidatosFiltrados = useMemo(() => filtrarCandidatos(candidatos, filtros), [candidatos, filtros]);

  const candidatosPorStatus = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    candidatos.forEach(candidato => {
      statusCounts[candidato.status] = (statusCounts[candidato.status] || 0) + 1;
    });
    return statusCounts;
  }, [candidatos]);

  const candidatosPorCargo = useMemo(() => {
    const cargoCounts: Record<string, number> = {};
    candidatos.forEach(candidato => {
      cargoCounts[candidato.cargo] = (cargoCounts[candidato.cargo] || 0) + 1;
    });
    return cargoCounts;
  }, [candidatos]);

  // Fontes de Candidatos
  const [candidateSources, setCandidateSources] = useState<Record<string, number>>({});
  const [isLoadingSources, setIsLoadingSources] = useState(false);

  const loadCandidateSources = useCallback(async () => {
    setIsLoadingSources(true);
    try {
      const sources = await recruitmentService.getCandidateSources(tenantId);
      setCandidateSources(sources);
    } catch (error) {
      console.error('Error loading candidate sources:', error);
    } finally {
      setIsLoadingSources(false);
    }
  }, [tenantId]);

  // Carregar fontes quando candidatos mudarem
  useEffect(() => {
    if (candidatos.length > 0) {
      loadCandidateSources();
    }
  }, [candidatos.length, loadCandidateSources]);

  const filtrosAtivos = useMemo(() => temFiltroAtivo(filtros), [filtros]);

  // API calls
  const loadCandidatos = useCallback(async (params?: SearchParams) => {
    try {
      setIsLoading(true);

      const searchParams: SearchParams = {
        tenantId,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
        ...params
      };

      // Apply filters
      if (searchTerm) searchParams.query = searchTerm;
      if (filtroStatus !== 'todos') searchParams.status = filtroStatus;
      if (filtroCargo !== 'todos') searchParams.cargo = filtroCargo;
      if (filtroExperiencia !== 'todos') searchParams.experiencia = filtroExperiencia;

      const { data, count } = await recruitmentService.getCandidatos(searchParams);
      setCandidatos(data);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading candidates:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, itemsPerPage, searchTerm, filtroStatus, filtroCargo, filtroExperiencia]);

  const loadCandidatoById = useCallback(async (id: string) => {
    try {
      const candidato = await recruitmentService.getCandidatoById(id, tenantId);
      setCandidatoSelecionado(candidato);
      return candidato;
    } catch (error) {
      console.error('Error loading candidate by ID:', error);
      return null;
    }
  }, [tenantId]);

  const loadMetrics = useCallback(async () => {
    try {
      setIsLoadingMetrics(true);
      const [metricsData, monthlyData] = await Promise.all([
        recruitmentService.getAdvancedMetrics(tenantId),
        recruitmentService.getMonthlyMetrics(tenantId)
      ]);
      setMetrics(metricsData);
      setMonthlyMetrics(monthlyData);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [tenantId]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadCandidatos(),
        loadMetrics()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadCandidatos, loadMetrics, tenantId]);

  // CRUD operations
  const createCandidato = useCallback(async (candidatoData: any) => {
    try {
      await recruitmentService.createCandidato(candidatoData, tenantId);
      await refresh();
    } catch (error) {
      console.error('Error creating candidate:', error);
      throw error;
    }
  }, [refresh, tenantId]);

  const updateCandidato = useCallback(async (id: string, updates: any) => {
    try {
      await recruitmentService.updateCandidato(id, updates, tenantId);
      await refresh();

      // Update selected candidate if it's the one being edited
      if (candidatoSelecionado?.id === id) {
        await loadCandidatoById(id);
      }
    } catch (error) {
      console.error('Error updating candidate:', error);
      throw error;
    }
  }, [refresh, candidatoSelecionado, loadCandidatoById, tenantId]);

  const deleteCandidato = useCallback(async (id: string) => {
    try {
      await recruitmentService.deleteCandidato(id, tenantId);
      await refresh();

      // Clear selection if deleted candidate was selected
      if (candidatoSelecionado?.id === id) {
        setCandidatoSelecionado(null);
      }
    } catch (error) {
      console.error('Error deleting candidate:', error);
      throw error;
    }
  }, [refresh, candidatoSelecionado, tenantId]);

  const changeCandidateStatus = useCallback(async (
    id: string,
    status: string,
    responsavel?: string,
    notas?: string
  ) => {
    try {
      await recruitmentService.changeCandidateStatus(id, status, responsavel, notas);
      await refresh();

      // Update selected candidate if it's the one being updated
      if (candidatoSelecionado?.id === id) {
        await loadCandidatoById(id);
      }
    } catch (error) {
      console.error('Error changing candidate status:', error);
      throw error;
    }
  }, [refresh, candidatoSelecionado, loadCandidatoById, tenantId]);

  // Pagination actions
  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  const previousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  // Filter actions
  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFiltroStatus('todos');
    setFiltroCargo('todos');
    setFiltroExperiencia('todos');
    setFiltroCanal('todos');
    setFiltroCondicao('todas');
    setPeriodoDe('');
    setPeriodoAte('');
    setCurrentPage(1);
  }, []);

  // Selection actions
  const selectCandidato = useCallback((candidato: CandidatoComEtapas | null) => {
    setCandidatoSelecionado(candidato);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filtroStatus, filtroCargo, filtroExperiencia]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        loadCandidatos({ ...initialParams, tenantId }),
        loadMetrics()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, [tenantId]); // Only run once on mount

  // Load candidates when pagination or filters change
  useEffect(() => {
    if (!isLoading) { // Avoid double loading on initial mount
      loadCandidatos();
    }
  }, [currentPage, searchTerm, filtroStatus, filtroCargo, filtroExperiencia, tenantId]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refresh();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refresh]);

  return {
    // Data
    candidatos,
    candidatoSelecionado,
    metrics,
    monthlyMetrics,

    // Loading states
    isLoading,
    isLoadingMetrics,
    isRefreshing,

    // Pagination
    currentPage,
    totalPages,
    totalCount,
    itemsPerPage,

    // Search and filters
    searchTerm,
    filtroStatus,
    filtroCargo,
    filtroExperiencia,

    // Actions
    refresh,
    loadCandidatos,
    loadCandidatoById,
    createCandidato,
    updateCandidato,
    deleteCandidato,
    changeCandidateStatus,

    // Pagination actions
    setCurrentPage,
    nextPage,
    previousPage,

    // Filter actions
    setSearchTerm,
    setFiltroStatus,
    setFiltroCargo,
    setFiltroExperiencia,
    filtroCanal,
    filtroCondicao,
    periodoDe,
    periodoAte,
    setFiltroCanal,
    setFiltroCondicao,
    setPeriodoDe,
    setPeriodoAte,
    clearFilters,

    // Selection
    selectCandidato,

    // Computed values
    candidatosNoRecorte,
    filtros,
    candidatosFiltrados,
    candidatosPorStatus,
    candidatosPorCargo,
    candidateSources,
    isLoadingSources,
    filtrosAtivos
  };
};
