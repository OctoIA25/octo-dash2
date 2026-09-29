/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Recrutamento
 * Rota: /recrutamento
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RecrutamentoFunnelChart } from '../components/RecrutamentoFunnelChart';
import { RelatorioSection } from '../recrutamento/RelatorioSection';
import { useRecruitment } from '../hooks/useRecruitment';
import { ESTAGIOS, ESTAGIO_POR_LABEL, LABEL_ESTAGIO, MOTIVOS_PERDA, classeDoStatus, podeMover, type EstagioId } from '../domain/recruitmentStages';
import { filtrarCandidatos, recorteCanalPeriodo } from '../domain/filtrarCandidatos';
import { RecrutamentoKanban } from '../components/RecrutamentoKanban';
import { useRecrutamentoQuadro } from '../hooks/useRecrutamentoQuadro';
import { aplicarMudancaDeEtapa } from '../services/mudancaDeEtapa';
import { FilaDeAcao } from '../components/FilaDeAcao';
import { CondicoesDeEntrada } from '../components/CondicoesDeEntrada';
import { MarcosDeAtivacao } from '../components/MarcosDeAtivacao';
import { IndicadoresDoProcesso } from '../components/IndicadoresDoProcesso';
import { recruitmentService, type CandidatoComEtapas } from '../services/recruitmentService';
import { fetchTenantMembers } from '../services/tenantMembersService';
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
  ChevronLeft,
  LayoutGrid,
  List
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';

interface Candidato {
  id: string | number;
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  status: string;   // label de `estagio` (domain/recruitmentStages)
  estagio?: string;
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

export const RecrutamentoPage = () => {
  const { user, tenantId } = useAuth();

  // Use recruitment hook with real data
  const {
    candidatos,
    candidatoSelecionado,
    isLoading,
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
    setCurrentPage,
    nextPage,
    previousPage,
    setSearchTerm: setHookSearchTerm,
    setFiltroStatus: setHookFiltroStatus,
    setFiltroCargo: setHookFiltroCargo,
    setFiltroExperiencia: setHookFiltroExperiencia,
    filtroCanal, setFiltroCanal,
    filtroCondicao, setFiltroCondicao,
    periodoDe, setPeriodoDe,
    periodoAte, setPeriodoAte,
    candidatosNoRecorte,
    filtros,
    clearFilters,
    selectCandidato,
    candidatosFiltrados,
    candidatosPorStatus,
    filtrosAtivos
  } = useRecruitment({ tenantId, autoRefresh: true, refreshInterval: 30000 });

  // Local state for modals and forms
  const [modalOpen, setModalOpen] = useState(false);
  // Encerrar exige um motivo da taxonomia — a spec não deixa fechar card sem ele.
  const [encerrando, setEncerrando] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState('');
  const [novoModalOpen, setNovoModalOpen] = useState(false);
  const [novoFormData, setNovoFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    cargo: 'Corretor Júnior',
    experiencia: '',
    linkedin: '',
    observacoes: '',
    fonte: '',
    temCreci: false,
    creci: ''
  } as {
    nome: string;
    email: string;
    telefone: string;
    cargo: string;
    experiencia: string;
    linkedin: string;
    observacoes: string;
    fonte: string;
    temCreci: boolean;
    creci: string;
  });
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Kanban | Lista — Kanban é o padrão; a escolha vive na URL (?view=lista) para
  // sobreviver a recarga e poder ser compartilhada.
  const [searchParams, setSearchParams] = useSearchParams();
  const view: 'kanban' | 'lista' = searchParams.get('view') === 'lista' ? 'lista' : 'kanban';
  const setView = (v: string) => {
    if (v !== 'kanban' && v !== 'lista') return; // o ToggleGroup manda '' ao desmarcar
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('view', v); return n; }, { replace: true });
  };

  // A carga COMPLETA: o hook acima pede 10 por vez ao servidor, que serve à
  // lista paginada e a mais nada. O quadro e o funil precisam de todos.
  const quadro = useRecrutamentoQuadro({ tenantId, usuarioEmail: user?.email });
  const candidatosQuadro = useMemo(() => filtrarCandidatos(quadro.candidatos, filtros), [quadro.candidatos, filtros]);
  // O funil conta todos os candidatos no recorte de canal+período (antes
  // contava só os 10 da página). Se a carga completa falhou, fica com a página.
  const candidatosDoFunil = useMemo(
    () => (quadro.erro ? candidatosNoRecorte : recorteCanalPeriodo(quadro.candidatos, filtros)),
    [quadro.erro, quadro.candidatos, candidatosNoRecorte, filtros],
  );
  const refreshTudo = async () => { await Promise.all([refresh(), quadro.refresh()]); };

  // user_id → e-mail do coordenador, para o rodapé do card (é o que a ficha mostra).
  const [coordenadores, setCoordenadores] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;
    fetchTenantMembers(tenantId)
      .then((ms) => { if (vivo) setCoordenadores(Object.fromEntries(ms.map((m) => [m.user_id, m.email]))); })
      .catch(() => { /* sem nome de coordenador o card continua inteiro */ });
    return () => { vivo = false; };
  }, [tenantId]);

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
  const handleVerDetalhes = (candidato: CandidatoComEtapas) => {
    setEncerrando(false);
    setMotivoPerda('');
    selectCandidato(candidato);
    setModalOpen(true);
  };

  // Soltar o card em Perdido: abre a ficha já com a caixa do motivo — o
  // encerramento nunca acontece sem motivo, arrastando ou clicando.
  const handleEncerrarPeloQuadro = (candidato: CandidatoComEtapas) => {
    selectCandidato(candidato);
    setMotivoPerda('');
    setEncerrando(true);
    setModalOpen(true);
  };

  // Mudança de etapa pelo modal. Os efeitos colaterais (conta em Onboard,
  // desvincular em onboard→perdido) moram em services/mudancaDeEtapa — o
  // MESMO caminho que o arrastar no Kanban usa.
  const handleMudarStatus = async (novoStatus: string) => {
    if (!candidatoSelecionado) return;
    try {
      await aplicarMudancaDeEtapa({
        candidato: candidatoSelecionado,
        novoLabel: novoStatus,
        usuarioEmail: user?.email,
        tenantId,
      });
      selectCandidato(null);
      setModalOpen(false);
      await refreshTudo();
    } catch (error) {
      console.error('❌ Erro ao mudar status:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao processar mudança de status');
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
  const handleNovoCandidato = async (candidateTenantId?: string) => {
    try {
      // Validações completas antes de criar candidato
      const errors: Record<string, string> = {};

      // Validar tenantId
      if (!candidateTenantId) {
        console.error('Tenant ID não encontrado');
        return;
      }

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
        fonte: novoFormData.fonte,
        creci: novoFormData.temCreci ? novoFormData.creci.trim() : undefined,
        tenant_id: candidateTenantId,
      };

      await createCandidato(newCandidato);
      void quadro.refresh();

      // Reset form
      setNovoFormData({
        nome: '',
        email: '',
        telefone: '',
        cargo: 'Corretor Júnior',
        experiencia: '',
        linkedin: '',
        observacoes: '',
        fonte: '',
        temCreci: false,
        creci: ''
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

        {/* A fila vem antes das métricas: é o que se olha primeiro de manhã. */}
        <FilaDeAcao tenantId={tenantId} />

        {/* Indicadores de SLA e conversão por canal (spec §10). */}
        <IndicadoresDoProcesso tenantId={tenantId} />

        {/*
          P0.9 — o bloco antigo saiu daqui em 18/09.

          Esta tela mostrava DUAS leituras do mesmo processo, que se
          contradiziam: no topo o fluxo novo (fila de ação + indicadores do
          método Lotus) dizia "passam nas três condições: 0%", e logo abaixo o
          funil antigo dizia "Qualificado 1 (100%)". Quem abria a tela escolhia
          em qual acreditar.

          O que saiu, e por quê:

            Tempo Médio de Processo · Taxa de Retenção · Custo por Contratação
              O custo era `1.2` CRAVADO no código (recruitmentService.ts:606,
              "placeholder herdado do módulo antigo") e aparecia como
              "R$ 1.2k" para toda imobiliária, em qualquer mês.

            Candidatos Ativos · Em Onboard · Taxa de Conversão
              Contagens do módulo antigo, com recorte próprio — a origem da
              contradição com os indicadores do topo.

            Performance de Conversão · Performance Mensal
              Mesma pergunta que os indicadores do método Lotus respondem,
              com outra conta.

            Fontes de Candidatos
              Duplicava a tabela "Conversão por canal" do IndicadoresDoProcesso,
              logo acima. Mesma pergunta, duas respostas na mesma tela.

          O FUNIL FICOU: é o que o plano manda manter, e é a única visão de
          etapa-a-etapa do recrutamento.
        */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-gray-900 dark:text-slate-100 dark:text-white" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white">Funil de Recrutamento</h2>
          </div>

          <div className="h-[735px]">
            <RecrutamentoFunnelChart candidatos={candidatosDoFunil} />
          </div>
        </div>

        {/* P3.8 — abaixo do fluxo novo, como o plano pede. Responde outra
            pergunta que o funil acima: lá é "onde cada um está"; aqui é
            "quantos CHEGARAM em cada etapa no período", que é o que mostra
            para onde o processo escorre. */}
        <RelatorioSection tenantId={tenantId || ''} />

        {/* Seção de Candidatos */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-gray-900 dark:text-slate-100 dark:text-white" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 dark:text-white">Candidatos</h2>
            </div>
            <ToggleGroup type="single" value={view} onValueChange={setView} variant="outline" size="sm" aria-label="Modo de visualização">
              <ToggleGroupItem value="kanban" aria-label="Kanban" className="gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </ToggleGroupItem>
              <ToggleGroupItem value="lista" aria-label="Lista" className="gap-1.5">
                <List className="h-3.5 w-3.5" /> Lista
              </ToggleGroupItem>
            </ToggleGroup>
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
                          {[filtroStatus !== 'todos', filtroCargo !== 'todos', filtroExperiencia !== 'todos', filtroCanal !== 'todos', filtroCondicao !== 'todas', periodoDe !== '' || periodoAte !== ''].filter(Boolean).length}
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
                            <SelectItem value="todos">Todos os estágios</SelectItem>
                            {ESTAGIOS.map((e) => (
                              <SelectItem key={e.id} value={e.label}>{e.label}</SelectItem>
                            ))}
                            <SelectItem value={LABEL_ESTAGIO.perdido}>{LABEL_ESTAGIO.perdido}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Filtro por Canal */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Canal</label>
                        <Select value={filtroCanal} onValueChange={setFiltroCanal}>
                          <SelectTrigger><SelectValue placeholder="Todos os canais" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os canais</SelectItem>
                            {['Indicação', 'Meta', 'LinkedIn', 'Site Institucional', 'Email Marketing', 'Portal de vagas', 'Instagram', 'Panfletagem', 'Outros'].map((f) => (
                              <SelectItem key={f} value={f}>{f}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Filtro pelas três condições */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Condições de entrada</label>
                        <Select value={filtroCondicao} onValueChange={setFiltroCondicao}>
                          <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">Todas</SelectItem>
                            <SelectItem value="aprovadas">As três aprovadas</SelectItem>
                            <SelectItem value="pendentes">Alguma pendente</SelectItem>
                            <SelectItem value="reprovada">Alguma reprovada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Período da candidatura — vale também para o funil e os indicadores */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Período da candidatura</label>
                        <div className="flex items-center gap-2">
                          <Input type="date" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} />
                          <span className="text-xs text-gray-500 dark:text-slate-400">até</span>
                          <Input type="date" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} />
                        </div>
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

          {/* Kanban: todos os candidatos, filtrados pelos mesmos filtros da lista. */}
          {view === 'kanban' && (
            <>
              {quadro.erro && (
                <p className="mb-3 text-sm text-red-600 dark:text-red-400">Não foi possível carregar o quadro: {quadro.erro}</p>
              )}
              <RecrutamentoKanban
                candidatos={candidatosQuadro}
                coordenadores={coordenadores}
                carregando={quadro.carregando}
                onAbrir={(c) => handleVerDetalhes(c as CandidatoComEtapas)}
                onEncerrar={(c) => handleEncerrarPeloQuadro(c as CandidatoComEtapas)}
                onMover={async (candidato, para) => {
                  const ok = await quadro.moverEstagio(candidato as CandidatoComEtapas, para);
                  // Fila, indicadores e a lista leem pelo hook antigo: só recarrega se gravou.
                  if (ok) await refresh();
                }}
              />
            </>
          )}

          {/* Lista de Candidatos */}
          {view === 'lista' && (
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
                                <Badge className={`text-xs ${classeDoStatus(candidato.status)}`}>
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
          )}
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
                    <Badge className={`${classeDoStatus(candidatoSelecionado.status)}`}>
                      {candidatoSelecionado.status}
                    </Badge>
                  </div>

                  {/* Botões de Mudança de Status */}
                  <div className="flex flex-wrap gap-2">
                    {[...ESTAGIOS.slice(1).map((e) => e.label), LABEL_ESTAGIO.perdido].map((status) => {
                      // A mesma regra do arrastar: para trás, para Lead e a partir de
                      // Perdido o botão nem liga — um clique gravava evento falso na
                      // timeline e carimbava ts_* errado.
                      const mover = podeMover((candidatoSelecionado.estagio ?? 'lead') as EstagioId, ESTAGIO_POR_LABEL[status]);
                      return (
                        <Button
                          key={status}
                          size="sm"
                          variant={candidatoSelecionado.status === status ? 'default' : 'outline'}
                          disabled={mover.ok === false}
                          title={mover.ok === false && mover.motivo ? mover.motivo : undefined}
                          onClick={() => (status === LABEL_ESTAGIO.perdido
                            ? setEncerrando(true)
                            : handleMudarStatus(status))}
                        >
                          {status}
                        </Button>
                      );
                    })}
                  </div>

                  {encerrando && (
                    <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4">
                      <p className="mb-3 text-sm font-medium text-amber-900 dark:text-amber-200">
                        Por que este candidato não seguiu?
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={motivoPerda} onValueChange={setMotivoPerda}>
                          <SelectTrigger className="w-64"><SelectValue placeholder="Escolha o motivo" /></SelectTrigger>
                          <SelectContent>
                            {MOTIVOS_PERDA.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          disabled={!motivoPerda}
                          onClick={async () => {
                            if (!candidatoSelecionado || !tenantId) return;
                            try {
                              await recruitmentService.encerrar(String(candidatoSelecionado.id), tenantId, motivoPerda);
                              toast.success('Candidato encerrado');
                              setEncerrando(false);
                              setMotivoPerda('');
                              selectCandidato(null);
                              setModalOpen(false);
                              await refreshTudo();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Não foi possível encerrar');
                            }
                          }}
                        >
                          Encerrar candidato
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEncerrando(false); setMotivoPerda(''); }}>
                          Cancelar
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-300/70">
                        O motivo alimenta a análise de onde o processo perde gente. Sem ele, o card não fecha.
                      </p>
                    </div>
                  )}
                </div>

                <CondicoesDeEntrada
                  candidato={candidatoSelecionado as unknown as Record<string, unknown>}
                  tenantId={tenantId}
                  onSaved={refreshTudo}
                />

                <MarcosDeAtivacao candidatoId={String(candidatoSelecionado.id)} />

                <div>
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
                    {/*CRECI*/}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">CRECI:</span>
                      <span className="font-medium text-gray-900 dark:text-slate-100 dark:text-white">
                        {candidatoSelecionado.creci || 'Não informado'}
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
                  {/* CRECI */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="tem-creci"
                        checked={novoFormData.temCreci}
                        onCheckedChange={(checked) => {
                          setNovoFormData({ ...novoFormData, temCreci: checked as boolean, creci: '' });
                        }}
                      />
                      <label
                        htmlFor="tem-creci"
                        className="text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 cursor-pointer"
                      >
                        Possui CRECI ativo
                      </label>
                    </div>
                    {novoFormData.temCreci && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-2">
                          Número do CRECI *
                        </label>
                        <Input
                          placeholder="Ex: 123456-SP"
                          value={novoFormData.creci}
                          onChange={(e) => setNovoFormData({ ...novoFormData, creci: e.target.value })}
                        />
                      </div>
                    )}
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
                          <SelectItem value="Meta">Meta</SelectItem>
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
                <Button onClick={() => handleNovoCandidato(tenantId || undefined)}>
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
