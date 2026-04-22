/**
 * Gerenciador de Tarefas para Administrador - Design Moderno
 * Inspirado em ClickUp, Notion e Material Design 3
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminTarefas } from '@/hooks/useAdminTarefas';
import { useAuth } from "@/hooks/useAuth";
import { PrioridadeTarefa, Tarefa } from '@/hooks/useTarefas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  UserPlus, 
  Plus, 
  Users,
  Calendar,
  Flag,
  X,
  Filter,
  Circle,
  CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSidebar } from '@/contexts/SidebarContext';
import { supabase } from '@/integrations/supabase/client';
import { useLateralDrawer } from '@/hooks/useLateralDrawer';

export const AdminTaskManager = () => {
  const { user } = useAuth();
  const { tarefas, isLoading, atribuirTarefa, atribuirTarefaMultiplos, estatisticasPorCorretor } = useAdminTarefas();
  const { setIsSidebarOpen } = useSidebar();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [corretorSelecionado, setCorretorSelecionado] = useState<{ nome: string; email: string } | null>(null);
  const [sidebarMultiplosOpen, setSidebarMultiplosOpen] = useState(false);

  // Sincronizar estado do sidebar com o contexto
  useEffect(() => {
    if (sheetOpen || sidebarMultiplosOpen) {
      setIsSidebarOpen(true);
    } else {
      setIsSidebarOpen(false);
    }
  }, [sheetOpen, sidebarMultiplosOpen, setIsSidebarOpen]);

  useLateralDrawer(sheetOpen || sidebarMultiplosOpen, 560);
  const [activeTabMultiplos, setActiveTabMultiplos] = useState<'tarefa' | 'corretores' | 'configuracoes'>('tarefa');
  const [activeTabCorretor, setActiveTabCorretor] = useState<'tarefa' | 'configuracoes'>('tarefa');
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'media' as PrioridadeTarefa,
    data_vencimento: '',
    categoria: 'geral',
    corretoresSelecionados: [] as string[],
    editavel_por_corretor: true
  });
  const [sheetFormData, setSheetFormData] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'media' as PrioridadeTarefa,
    data_vencimento: '',
    categoria: 'geral',
    editavel_por_corretor: true
  });
  const [filtroCorretor, setFiltroCorretor] = useState<string>('todos');

  // Carrega corretores reais do tenant (filtrando por equipes que o gestor lidera, se aplicável)
  const [corretoresComEmails, setCorretoresComEmails] = useState<
    Array<{ nome: string; email: string; telefone: string; equipe: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.tenantId || user.tenantId === 'owner') return;

      let ledTeamIds: string[] | null = null;
      if (user.systemRole === 'team_leader') {
        const { data: ledTeams } = await (supabase as any)
          .from('teams')
          .select('id')
          .eq('tenant_id', user.tenantId)
          .eq('leader_user_id', user.id);
        ledTeamIds = (ledTeams || []).map((t: any) => t.id);
        if (ledTeamIds.length === 0) {
          if (!cancelled) setCorretoresComEmails([]);
          return;
        }
      }

      const { data: members } = await supabase.rpc('get_tenant_members', {
        p_tenant_id: user.tenantId,
      });

      let filtered = (members as any[] | null) || [];

      if (ledTeamIds && ledTeamIds.length > 0) {
        const { data: ledMemberships } = await (supabase as any)
          .from('tenant_memberships')
          .select('user_id, team_id')
          .eq('tenant_id', user.tenantId)
          .in('team_id', ledTeamIds);
        const allowedUserIds = new Set((ledMemberships || []).map((m: any) => m.user_id));
        filtered = filtered.filter((m: any) => allowedUserIds.has(m.user_id));
      }

      const mapped = filtered
        .filter((m: any) => m.role !== 'owner')
        .map((m: any) => {
          const email = (m.email || '').toLowerCase();
          const nome = m.name || email.split('@')[0] || email;
          const equipe = (m.permissions?.team as string | undefined) || '';
          return { nome, email, telefone: '', equipe };
        })
        .filter((c) => !!c.email);

      if (!cancelled) setCorretoresComEmails(mapped);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.tenantId, user?.systemRole, user?.id]);

  const handleFiltroChange = useCallback((value: string) => {
    setFiltroCorretor(value);
  }, []);

  const resetForm = () => {
    setFormData({
      titulo: '',
      descricao: '',
      prioridade: 'media',
      data_vencimento: '',
      categoria: 'geral',
      corretoresSelecionados: [],
      editavel_por_corretor: true
    });
  };

  const resetSheetForm = () => {
    setSheetFormData({
      titulo: '',
      descricao: '',
      prioridade: 'media',
      data_vencimento: '',
      categoria: 'geral',
      editavel_por_corretor: true
    });
  };

  const handleOpenSidebarMultiplos = () => {
    resetForm();
    setSidebarMultiplosOpen(true);
  };

  const handleCloseSidebarMultiplos = () => {
    setSidebarMultiplosOpen(false);
    setIsSidebarOpen(false);
    setActiveTabMultiplos('tarefa');
    resetForm();
  };

  const handleOpenSheet = (corretor: { nome: string; email: string }) => {
    setCorretorSelecionado(corretor);
    resetSheetForm();
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setIsSidebarOpen(false);
    setCorretorSelecionado(null);
    setActiveTabCorretor('tarefa');
    resetSheetForm();
  };

  const handleSheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!sheetFormData.titulo.trim()) {
      alert('Digite um título para a tarefa');
      return;
    }

    if (!corretorSelecionado) {
      alert('Erro: Corretor não selecionado');
      return;
    }

    try {
      await atribuirTarefa(corretorSelecionado.email, {
        ...sheetFormData,
        concluida: false,
        ordem: 0
      });
      handleCloseSheet();
    } catch (err) {
      console.error('Erro ao atribuir tarefa:', err);
      alert('Erro ao atribuir tarefa. Verifique o console.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.titulo.trim()) {
      alert('Digite um título para a tarefa');
      return;
    }

    if (formData.corretoresSelecionados.length === 0) {
      alert('Selecione pelo menos um corretor');
      return;
    }

    try {
      if (formData.corretoresSelecionados.length === 1) {
        await atribuirTarefa(formData.corretoresSelecionados[0], {
          ...formData,
          concluida: false,
          ordem: 0
        });
      } else {
        await atribuirTarefaMultiplos(formData.corretoresSelecionados, {
          ...formData,
          concluida: false,
          ordem: 0
        });
      }
      handleCloseSidebarMultiplos();
    } catch (err) {
      console.error('Erro ao atribuir tarefa:', err);
      alert('Erro ao atribuir tarefa. Verifique o console.');
    }
  };

  const toggleCorretor = useCallback((email: string) => {
    setFormData(prev => ({
      ...prev,
      corretoresSelecionados: prev.corretoresSelecionados.includes(email)
        ? prev.corretoresSelecionados.filter(e => e !== email)
        : [...prev.corretoresSelecionados, email]
    }));
  }, []);

  const selecionarTodosCorretores = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      corretoresSelecionados: corretoresComEmails.map(c => c.email)
    }));
  }, [corretoresComEmails]);

  const desmarcarTodos = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      corretoresSelecionados: []
    }));
  }, []);

  const getPrioridadeColor = (prioridade: PrioridadeTarefa) => {
    switch (prioridade) {
      case 'urgente':
        return 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 dark:bg-red-500/10 dark:text-red-400';
      case 'alta':
        return 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-300 dark:bg-orange-500/10 dark:text-orange-400';
      case 'media':
        return 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-300 dark:bg-yellow-500/10 dark:text-yellow-400';
      case 'baixa':
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 dark:bg-blue-500/10 dark:text-blue-400';
      default:
        return 'bg-gray-50 dark:bg-slate-950 text-gray-600 dark:text-slate-400 dark:bg-gray-500/10 dark:text-gray-400';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), 'dd MMM', { locale: ptBR });
    } catch {
      return null;
    }
  };

  const tarefasFiltradas = useMemo(() => 
    filtroCorretor === 'todos'
      ? tarefas
      : tarefas.filter(t => t.corretor_email === filtroCorretor)
  , [filtroCorretor, tarefas]);

  const tarefasPorCorretor = useMemo(() => 
    tarefasFiltradas.reduce((acc, tarefa) => {
      if (!acc[tarefa.corretor_email]) {
        acc[tarefa.corretor_email] = [];
      }
      acc[tarefa.corretor_email].push(tarefa);
      return acc;
    }, {} as Record<string, Tarefa[]>)
  , [tarefasFiltradas]);

  const canManageTasks =
    !!user &&
    (user.systemRole === 'admin' ||
      user.systemRole === 'owner' ||
      user.systemRole === 'team_leader');

  if (!canManageTasks) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-400 dark:text-slate-500">
          Apenas gestores e administradores podem acessar esta área
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          <p className="text-sm text-gray-400 dark:text-slate-500">Carregando tarefas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header com botão de ação */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-700 dark:text-slate-300 dark:text-gray-300 font-normal">
            Atribua e gerencie tarefas para os membros da equipe
          </p>
        </div>
        <Button 
          onClick={handleOpenSidebarMultiplos}
          className="bg-gray-300 hover:bg-gray-400 text-black shadow-sm font-medium rounded-lg h-10 px-5"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nova Atribuição
        </Button>
      </div>

      {/* Grade de Corretores - Design Moderno */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Users className="h-5 w-5 text-gray-500 dark:text-slate-400" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-slate-100 dark:text-white">
            Membros da Equipe
          </h2>
          <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 font-normal">
            · {corretoresComEmails.length} membros
          </span>
        </div>
        
        <div className="max-h-[600px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {corretoresComEmails.map((corretor) => {
            const stats = estatisticasPorCorretor[corretor.email] || { total: 0, concluidas: 0, pendentes: 0, atribuidas: 0 };
            return (
              <button
                key={corretor.email}
                onClick={() => handleOpenSheet({ nome: corretor.nome, email: corretor.email })}
                className="group relative p-6 rounded-xl bg-white dark:bg-slate-900 dark:bg-gray-800/50 border border-gray-200 dark:border-slate-800 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-slate-800/60 dark:hover:bg-gray-800/80 hover:shadow-md transition-all duration-200 text-left"
              >
                {/* Avatar e Nome */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium text-lg flex-shrink-0">
                    {corretor.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 dark:text-white truncate mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {corretor.nome}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-slate-400 dark:text-gray-400 truncate font-normal">
                      {corretor.equipe}
                    </p>
                  </div>
                </div>

                {/* Estatísticas */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100/60 dark:border-gray-700/60">
                  {stats.pendentes > 0 ? (
                    <>
                      <span className="text-xs text-gray-700 dark:text-slate-300 dark:text-gray-300 font-medium">
                        {stats.pendentes} pendente{stats.pendentes !== 1 ? 's' : ''}
                      </span>
                      <div className="px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-950/60 dark:bg-orange-500/20">
                        <div className="w-1 h-1 rounded-full bg-orange-500"></div>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-gray-600 dark:text-slate-400 dark:text-gray-400 font-medium">
                        Tudo feito
                      </span>
                      <div className="px-2 py-0.5 rounded-md bg-green-100 dark:bg-green-950/60 dark:bg-green-500/20">
                        <div className="w-1 h-1 rounded-full bg-green-500"></div>
                      </div>
                    </>
                  )}
                </div>

                {/* Ícone de Ação */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950/60 dark:bg-blue-500/20 flex items-center justify-center">
                    <Plus className="h-3 w-3 text-blue-600 dark:text-blue-300 dark:text-blue-400" />
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Filtros - Design Minimalista */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50 border border-gray-200 dark:border-slate-800 dark:border-gray-700">
            <Filter className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            <select
              value={filtroCorretor}
              onChange={(e) => handleFiltroChange(e.target.value)}
              className="bg-transparent border-none text-sm text-gray-700 dark:text-slate-300 dark:text-gray-300 font-medium focus:outline-none focus:ring-0"
            >
              <option value="todos">Todos os membros</option>
              {corretoresComEmails.map(corretor => (
                <option key={corretor.email} value={corretor.email}>
                  {corretor.nome}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-600 dark:text-slate-400 dark:text-gray-400 font-medium">
            {tarefasFiltradas.length} {tarefasFiltradas.length === 1 ? 'tarefa' : 'tarefas'}
          </span>
        </div>
      </div>

      {/* Lista de Tarefas - Design Limpo */}
      {Object.keys(tarefasPorCorretor).length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl bg-gray-50/50 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-slate-800 dark:border-gray-700">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 flex items-center justify-center mb-4">
            <UserPlus className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="text-lg font-light text-gray-900 dark:text-slate-100 dark:text-white mb-2">
            Nenhuma tarefa encontrada
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 dark:text-gray-400 mb-6 font-light">
            Comece atribuindo tarefas para os membros da equipe
          </p>
          <Button 
            onClick={handleOpenSidebarMultiplos}
            variant="outline"
            className="font-normal"
          >
            <Plus className="h-4 w-4 mr-2" />
            Criar Primeira Tarefa
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(tarefasPorCorretor).map(([corretorEmail, tarefasCorretor]) => {
            const corretor = corretoresComEmails.find(c => c.email === corretorEmail);
            const stats = estatisticasPorCorretor[corretorEmail] || { total: 0, concluidas: 0, pendentes: 0, atribuidas: 0 };
            
            return (
              <div 
                key={corretorEmail}
                className="rounded-2xl bg-white dark:bg-slate-900 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden"
              >
                  {/* Header do Corretor */}
                  <button
                    onClick={() => corretor && handleOpenSheet({ nome: corretor.nome, email: corretor.email })}
                    className="w-full px-8 py-6 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-gray-800/80 transition-colors text-left group border-b border-gray-100/60 dark:border-gray-700/60"
                  >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                      {corretor?.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {corretor?.nome || corretorEmail}
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-slate-500 font-light">
                        {corretor?.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-slate-500 font-light">{stats.concluidas}/{stats.total}</span>
                      <div className="w-1 h-1 rounded-full bg-gray-300"></div>
                      <span className="text-xs text-gray-400 dark:text-slate-500 font-light">{stats.pendentes} pendente{stats.pendentes !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-slate-800 dark:bg-gray-700/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-3 w-3 text-gray-500 dark:text-slate-400 dark:text-gray-400" />
                    </div>
                  </div>
                </button>

                {/* Lista de Tarefas */}
                <div className="px-8 pb-6 space-y-2">
                  {tarefasCorretor.map((tarefa) => (
                    <div
                      key={tarefa.id}
                      className={`group flex items-start gap-4 p-4 rounded-xl transition-all ${
                        tarefa.concluida
                          ? 'bg-gray-50/50 dark:bg-gray-800/30 opacity-60'
                          : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {/* Checkbox/Status */}
                      <div className="flex-shrink-0 mt-0.5">
                        {tarefa.concluida ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                        )}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-normal mb-1 ${
                          tarefa.concluida
                            ? 'text-gray-400 dark:text-slate-500 line-through'
                            : 'text-gray-900 dark:text-slate-100 dark:text-white'
                        }`}>
                          {tarefa.titulo}
                        </h4>
                        {tarefa.descricao && (
                          <p className="text-xs text-gray-400 dark:text-slate-500 font-light line-clamp-1">
                            {tarefa.descricao}
                          </p>
                        )}
                        
                        {/* Badges */}
                        <div className="flex items-center gap-2 mt-3">
                          <Badge className={`${getPrioridadeColor(tarefa.prioridade)} text-xs font-normal border-none`}>
                            {tarefa.prioridade}
                          </Badge>
                          
                          {tarefa.data_vencimento && (
                            <Badge variant="outline" className="text-xs font-light border-gray-200 dark:border-slate-800 dark:border-gray-700">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(tarefa.data_vencimento)}
                            </Badge>
                          )}
                          
                          {tarefa.atribuida_por_admin && (
                            <Badge variant="outline" className="text-xs font-light border-blue-200 dark:border-blue-900 dark:border-blue-800 text-blue-600 dark:text-blue-300 dark:text-blue-400">
                              Por {tarefa.criador_nome || 'Admin'}
                            </Badge>
                          )}
                          
                          {tarefa.atribuida_por_admin && !tarefa.editavel_por_corretor && (
                            <Badge variant="outline" className="text-xs font-light border-amber-200 dark:border-amber-900 dark:border-amber-800 text-amber-600 dark:text-amber-300 dark:text-amber-400">
                              Bloqueada
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer lateral - Múltiplos Corretores */}
      {sidebarMultiplosOpen && (
        <div
          onClick={handleCloseSidebarMultiplos}
          style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
        />
      )}
      {sidebarMultiplosOpen && (
        <div
          className="bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
          style={{ position: 'fixed', right: 0, top: 56, width: '560px', height: 'calc(100vh - 56px)', maxHeight: 'calc(100vh - 56px)', zIndex: 99999 }}
        >
          {/* Header */}
          <div className="flex-shrink-0 border-b border-gray-100/60 dark:border-gray-700/60 relative">
            <div className="absolute top-6 right-6" style={{ zIndex: 9999 }}>
              <button
                onClick={handleCloseSidebarMultiplos}
                className="btn-close-sidebar w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-lg"
                title="Fechar"
                style={{ 
                  backgroundColor: '#ffffff', 
                  border: '2px solid #d1d5db',
                  position: 'relative',
                  zIndex: 9999
                }}
              >
                <X className="h-5 w-5" style={{ color: '#dc2626', stroke: '#dc2626' }} />
              </button>
            </div>

            <div className="px-6 py-6">
              <h2 className="text-xl font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-1">
                Atribuir Tarefa
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 font-normal">
                Configure e atribua para múltiplos membros
              </p>
            </div>

            {/* Tabs */}
            <div className="px-6">
              <div className="flex items-center gap-6 border-b border-gray-100/60 dark:border-gray-700/60">
                <button
                  type="button"
                  onClick={() => setActiveTabMultiplos('tarefa')}
                  className={`pb-3 text-sm font-medium transition-colors relative ${
                    activeTabMultiplos === 'tarefa'
                      ? 'text-gray-900 dark:text-slate-100 dark:text-white'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Detalhes
                  {activeTabMultiplos === 'tarefa' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600"></span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabMultiplos('corretores')}
                  className={`pb-3 text-sm font-medium transition-colors relative ${
                    activeTabMultiplos === 'corretores'
                      ? 'text-gray-900 dark:text-slate-100 dark:text-white'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Membros
                  {activeTabMultiplos === 'corretores' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600"></span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabMultiplos('configuracoes')}
                  className={`pb-3 text-sm font-medium transition-colors relative ${
                    activeTabMultiplos === 'configuracoes'
                      ? 'text-gray-900 dark:text-slate-100 dark:text-white'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Opções
                  {activeTabMultiplos === 'configuracoes' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600"></span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6" style={{ minHeight: 0 }}>
            <form onSubmit={handleSubmit} className="space-y-6">
              {activeTabMultiplos === 'tarefa' && (
                <>
                  <div>
                    <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                      Título da Tarefa
                    </label>
                    <Input
                      value={formData.titulo}
                      onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                      required
                      className="h-11 rounded-xl border-gray-200 dark:border-slate-800 dark:border-gray-700 font-light"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                      Descrição
                    </label>
                    <Textarea
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      rows={4}
                      className="rounded-xl border-gray-200 dark:border-slate-800 dark:border-gray-700 font-light resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                        Prioridade
                      </label>
                      <select
                        value={formData.prioridade}
                        onChange={(e) => setFormData({ ...formData, prioridade: e.target.value as PrioridadeTarefa })}
                        className="w-full h-11 rounded-xl border border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-white dark:bg-slate-900 dark:bg-gray-800 px-4 py-2 text-sm font-light focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                        Vencimento
                      </label>
                      <Input
                        type="date"
                        value={formData.data_vencimento}
                        onChange={(e) => setFormData({ ...formData, data_vencimento: e.target.value })}
                        className="h-11 rounded-xl border-gray-200 dark:border-slate-800 dark:border-gray-700 font-light"
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTabMultiplos === 'corretores' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300">
                      Selecionar Membros
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={selecionarTodosCorretores}
                        className="h-8 text-xs font-light"
                      >
                        Todos
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={desmarcarTodos}
                        className="h-8 text-xs font-light"
                      >
                        Limpar
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto">
                    {corretoresComEmails.map((corretor) => {
                      const isSelected = formData.corretoresSelecionados.includes(corretor.email);
                      return (
                        <label
                          key={corretor.email}
                          className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/40 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-900 dark:border-blue-500/30'
                              : 'hover:bg-gray-50 dark:hover:bg-slate-800/60 dark:hover:bg-gray-800/50 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCorretor(corretor.email)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 dark:text-blue-300 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                            {corretor.nome.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-normal text-gray-900 dark:text-slate-100 dark:text-white">
                              {corretor.nome}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-slate-500 font-light">
                              {corretor.equipe}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  
                  {formData.corretoresSelecionados.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 font-light mt-4">
                      {formData.corretoresSelecionados.length} membro{formData.corretoresSelecionados.length !== 1 ? 's' : ''} selecionado{formData.corretoresSelecionados.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}

              {activeTabMultiplos === 'configuracoes' && (
                <div>
                  <label className={`flex items-start gap-4 p-5 rounded-xl cursor-pointer transition-all ${
                    formData.editavel_por_corretor
                      ? 'bg-green-50 dark:bg-green-950/40 dark:bg-green-500/10 border border-green-200 dark:border-green-900 dark:border-green-500/30'
                      : 'bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50 border border-gray-200 dark:border-slate-800 dark:border-gray-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.editavel_por_corretor}
                      onChange={(e) => setFormData({ ...formData, editavel_por_corretor: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 dark:text-blue-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-normal text-gray-900 dark:text-slate-100 dark:text-white mb-1">
                        Permitir edição pelo corretor
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400 font-light leading-relaxed">
                        Quando ativado, o corretor poderá editar todos os campos da tarefa. Caso contrário, apenas visualizar e marcar como concluída.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Ações */}
              <div className="flex items-center gap-3 pt-8">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseSidebarMultiplos}
                  className="flex-1 h-10 rounded-lg font-medium border-gray-300 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60"
                >
                  Cancelar
                </Button>
                
                <Button 
                  type="submit"
                  disabled={formData.corretoresSelecionados.length === 0}
                  className="flex-1 h-10 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-900 dark:text-slate-100 font-medium"
                >
                  Atribuir para {formData.corretoresSelecionados.length}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar Lateral - Corretor Específico */}
      {sheetOpen && corretorSelecionado && (
        <div
          onClick={handleCloseSheet}
          style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
        />
      )}
      {sheetOpen && corretorSelecionado && (
        <div
          className="bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
          style={{ position: 'fixed', right: 0, top: 56, width: '560px', height: 'calc(100vh - 56px)', maxHeight: 'calc(100vh - 56px)', zIndex: 99999 }}
        >
          {/* Header */}
          <div className="flex-shrink-0 border-b border-gray-100/60 dark:border-gray-700/60 relative">
            <div className="absolute top-6 right-6" style={{ zIndex: 9999 }}>
              <button
                onClick={handleCloseSheet}
                className="btn-close-sidebar w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-lg"
                title="Fechar"
                style={{ 
                  backgroundColor: '#ffffff', 
                  border: '2px solid #d1d5db',
                  position: 'relative',
                  zIndex: 9999
                }}
              >
                <X className="h-5 w-5" style={{ color: '#dc2626', stroke: '#dc2626' }} />
              </button>
            </div>

            <div className="px-6 py-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium text-xl flex-shrink-0">
                  {corretorSelecionado.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-slate-100 dark:text-white mb-0.5">
                    {corretorSelecionado.nome}
                  </h2>
                  <p className="text-sm text-gray-400 dark:text-slate-500 font-light">
                    {corretorSelecionado.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6">
              <div className="flex items-center gap-6 border-b border-gray-100/60 dark:border-gray-700/60">
                <button
                  type="button"
                  onClick={() => setActiveTabCorretor('tarefa')}
                  className={`pb-3 text-sm font-medium transition-colors relative ${
                    activeTabCorretor === 'tarefa'
                      ? 'text-gray-900 dark:text-slate-100 dark:text-white'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Detalhes
                  {activeTabCorretor === 'tarefa' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600"></span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabCorretor('configuracoes')}
                  className={`pb-3 text-sm font-medium transition-colors relative ${
                    activeTabCorretor === 'configuracoes'
                      ? 'text-gray-900 dark:text-slate-100 dark:text-white'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Opções
                  {activeTabCorretor === 'configuracoes' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600"></span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6" style={{ minHeight: 0 }}>
            <form onSubmit={handleSheetSubmit} className="space-y-6">
              {activeTabCorretor === 'tarefa' && (
                <>
                  <div>
                    <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                      Título da Tarefa
                    </label>
                    <Input
                      value={sheetFormData.titulo}
                      onChange={(e) => setSheetFormData({ ...sheetFormData, titulo: e.target.value })}
                      required
                      className="h-11 rounded-xl border-gray-200 dark:border-slate-800 dark:border-gray-700 font-light"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                      Descrição
                    </label>
                    <Textarea
                      value={sheetFormData.descricao}
                      onChange={(e) => setSheetFormData({ ...sheetFormData, descricao: e.target.value })}
                      rows={4}
                      className="rounded-xl border-gray-200 dark:border-slate-800 dark:border-gray-700 font-light resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                        Prioridade
                      </label>
                      <select
                        value={sheetFormData.prioridade}
                        onChange={(e) => setSheetFormData({ ...sheetFormData, prioridade: e.target.value as PrioridadeTarefa })}
                        className="w-full h-11 rounded-xl border border-gray-200 dark:border-slate-800 dark:border-gray-700 bg-white dark:bg-slate-900 dark:bg-gray-800 px-4 py-2 text-sm font-light focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-light text-gray-700 dark:text-slate-300 dark:text-gray-300 mb-3 block">
                        Vencimento
                      </label>
                      <Input
                        type="date"
                        value={sheetFormData.data_vencimento}
                        onChange={(e) => setSheetFormData({ ...sheetFormData, data_vencimento: e.target.value })}
                        className="h-11 rounded-xl border-gray-200 dark:border-slate-800 dark:border-gray-700 font-light"
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTabCorretor === 'configuracoes' && (
                <div>
                  <label className={`flex items-start gap-4 p-5 rounded-xl cursor-pointer transition-all ${
                    sheetFormData.editavel_por_corretor
                      ? 'bg-green-50 dark:bg-green-950/40 dark:bg-green-500/10 border border-green-200 dark:border-green-900 dark:border-green-500/30'
                      : 'bg-gray-50 dark:bg-slate-950 dark:bg-gray-800/50 border border-gray-200 dark:border-slate-800 dark:border-gray-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={sheetFormData.editavel_por_corretor}
                      onChange={(e) => setSheetFormData({ ...sheetFormData, editavel_por_corretor: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 dark:text-blue-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-normal text-gray-900 dark:text-slate-100 dark:text-white mb-1">
                        Permitir edição pelo corretor
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 dark:text-gray-400 font-light leading-relaxed">
                        Quando ativado, o corretor poderá editar todos os campos da tarefa. Caso contrário, apenas visualizar e marcar como concluída.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Ações */}
              <div className="flex items-center gap-3 pt-8">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseSheet}
                  className="flex-1 h-10 rounded-lg font-medium border-gray-300 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60"
                >
                  Cancelar
                </Button>
                
                <Button 
                  type="submit"
                  className="flex-1 h-10 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-900 dark:text-slate-100 font-medium"
                >
                  Atribuir Tarefa
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
