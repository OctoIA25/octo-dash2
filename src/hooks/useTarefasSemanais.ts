/**
 * Hook para gerenciar tarefas semanais no formato Kanban
 * Substitui o sistema antigo de tarefas por um Kanban semanal
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabaseClient';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Tipos
export type PrioridadeTarefa = 'baixa' | 'media' | 'alta' | 'urgente';
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Segunda, 7=Domingo
export type PadraoRecorrencia = 'diario' | 'semanal' | 'mensal' | 'personalizado';

export interface TarefaSemanal {
  id: string;
  tenant_id: string;
  user_id: string;
  titulo: string;
  descricao?: string;
  prioridade: PrioridadeTarefa;
  categoria: string;
  tags?: string[];
  semana_an: number;
  dia_semana: DiaSemana;
  data_especifica: string;
  recorrente: boolean;
  padrao_recorrencia?: PadraoRecorrencia;
  dados_recorrencia?: any;
  concluida: boolean;
  data_conclusao?: string;
  ordem: number;
  criado_por?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface CreateTarefaSemanal {
  titulo: string;
  descricao?: string;
  prioridade: PrioridadeTarefa;
  categoria?: string;
  tags?: string[];
  dia_semana: DiaSemana;
  data_especifica?: string;
  recorrente?: boolean;
  padrao_recorrencia?: PadraoRecorrencia;
  dados_recorrencia?: any;
}

export interface SemanaInfo {
  semana_an: number;
  data_inicio: Date;
  data_fim: Date;
  nome: string;
  eh_semana_atual: boolean;
}

export interface SemanaHistorico {
  semana_an: number;
  data_inicio: string;
  data_fim: string;
  total_tarefas: number;
  tarefas_concluidas: number;
  taxa_conclusao: number;
  arquivado_em: string;
}

// Constantes
export const DIAS_SEMANA: Record<DiaSemana, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira', 
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};

export const DIAS_SEMANA_ABREV: Record<DiaSemana, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua', 
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom'
};

// Funções utilitárias
const calcularSemanaAn = (data: Date): number => {
  const year = data.getFullYear();
  const week = Math.ceil((data.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  return year * 100 + week;
};

const getSemanaInfo = (data: Date): SemanaInfo => {
  const inicio = startOfWeek(data, { weekStartsOn: 1 }); // Segunda começa semana
  const fim = endOfWeek(data, { weekStartsOn: 1 });
  const semana_an = calcularSemanaAn(data);
  const agora = new Date();
  
  return {
    semana_an,
    data_inicio: inicio,
    data_fim: fim,
    nome: `Semana ${format(inicio, 'dd/MM')} - ${format(fim, 'dd/MM')}`,
    eh_semana_atual: isSameWeek(data, agora, { weekStartsOn: 1 })
  };
};

const getDataPorDia = (semana: SemanaInfo, dia: DiaSemana): Date => {
  const data = new Date(semana.data_inicio);
  data.setDate(data.getDate() + (dia - 1));
  return data;
};

// Hook principal
export const useTarefasSemanais = () => {
  const { user, tenantId } = useAuth();
  const [tarefas, setTarefas] = useState<TarefaSemanal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semanaAtual, setSemanaAtual] = useState<SemanaInfo>(() => getSemanaInfo(new Date()));
  const [historico, setHistorico] = useState<SemanaHistorico[]>([]);

  // Carregar tarefas da semana atual
  const carregarTarefas = useCallback(async () => {
    if (!user?.id || !tenantId || tenantId === 'owner') {
      setTarefas([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('tarefas_semanais')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .eq('semana_an', semanaAtual.semana_an)
        .order('dia_semana', { ascending: true })
        .order('ordem', { ascending: true });

      if (fetchError) {
        console.error('Erro ao carregar tarefas semanais:', fetchError);
        setError(fetchError.message);
        return;
      }

      setTarefas(data || []);
    } catch (err) {
      console.error('Erro ao carregar tarefas:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, tenantId, semanaAtual.semana_an]);

  // Agrupar tarefas por dia
  const tarefasPorDia = useMemo(() => {
    const agrupado: Record<DiaSemana, TarefaSemanal[]> = {
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: []
    };

    // Verificar se tarefas é um array válido
    if (Array.isArray(tarefas)) {
      tarefas.forEach(tarefa => {
        // Verificar se tarefa e dia_semana são válidos
        if (tarefa && typeof tarefa.dia_semana === 'number' && tarefa.dia_semana >= 1 && tarefa.dia_semana <= 7) {
          if (agrupado[tarefa.dia_semana]) {
            agrupado[tarefa.dia_semana].push(tarefa);
          }
        }
      });
    }

    return agrupado;
  }, [tarefas]);

  // Navegação entre semanas
  const irParaSemana = useCallback((semanaAn: number) => {
    // Calcular data base a partir do número da semana
    const year = Math.floor(semanaAn / 100);
    const week = semanaAn % 100;
    const data = new Date(year, 0, 1 + (week - 1) * 7);
    const novaSemana = getSemanaInfo(data);
    setSemanaAtual(novaSemana);
  }, []);

  const proximaSemana = useCallback(() => {
    const proximaData = addWeeks(semanaAtual.data_inicio, 1);
    setSemanaAtual(getSemanaInfo(proximaData));
  }, [semanaAtual]);

  const semanaAnterior = useCallback(() => {
    const anteriorData = subWeeks(semanaAtual.data_inicio, 1);
    setSemanaAtual(getSemanaInfo(anteriorData));
  }, [semanaAtual]);

  const irParaHoje = useCallback(() => {
    setSemanaAtual(getSemanaInfo(new Date()));
  }, []);

  // CRUD Operations
  const criarTarefa = useCallback(async (tarefaData: CreateTarefaSemanal): Promise<TarefaSemanal | null> => {
    if (!user?.id || !tenantId) return null;

    try {
      const dataEspecifica = tarefaData.data_especifica || 
        getDataPorDia(semanaAtual, tarefaData.dia_semana).toISOString().split('T')[0];

      const novaTarefa = {
        tenant_id: tenantId,
        user_id: user.id,
        titulo: tarefaData.titulo,
        descricao: tarefaData.descricao || null,
        prioridade: tarefaData.prioridade,
        categoria: tarefaData.categoria || 'geral',
        tags: tarefaData.tags || null,
        semana_an: semanaAtual.semana_an,
        dia_semana: tarefaData.dia_semana,
        data_especifica: dataEspecifica,
        recorrente: tarefaData.recorrente || false,
        padrao_recorrencia: tarefaData.padrao_recorrencia || null,
        dados_recorrencia: tarefaData.dados_recorrencia || null,
        concluida: false,
        ordem: tarefasPorDia[tarefaData.dia_semana].length,
        criado_por: user.id
      };

      const { data, error } = await supabase
        .from('tarefas_semanais')
        .insert(novaTarefa)
        .select()
        .single();

      if (error) {
        console.error('Erro ao criar tarefa:', error);
        throw error;
      }

      setTarefas(prev => [...prev, data]);
      return data;
    } catch (err) {
      console.error('Erro ao criar tarefa:', err);
      throw err;
    }
  }, [user?.id, tenantId, semanaAtual.semana_an, tarefasPorDia]);

  const moverTarefa = useCallback(async (tarefaId: string, novoDia: DiaSemana): Promise<void> => {
    if (!user?.id) return;

    try {
      const tarefa = tarefas.find(t => t.id === tarefaId);
      if (!tarefa) throw new Error('Tarefa não encontrada');

      const novaData = getDataPorDia(semanaAtual, novoDia);
      const novaOrdem = tarefasPorDia[novoDia].length;

      const { error } = await supabase
        .from('tarefas_semanais')
        .update({
          dia_semana: novoDia,
          data_especifica: novaData.toISOString().split('T')[0],
          ordem: novaOrdem,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', tarefaId);

      if (error) {
        console.error('Erro ao mover tarefa:', error);
        throw error;
      }

      setTarefas(prev => prev.map(t => 
        t.id === tarefaId 
          ? { 
              ...t, 
              dia_semana: novoDia, 
              data_especifica: novaData.toISOString().split('T')[0],
              ordem: novaOrdem 
            }
          : t
      ));
    } catch (err) {
      console.error('Erro ao mover tarefa:', err);
      throw err;
    }
  }, [user?.id, tarefas, semanaAtual, tarefasPorDia]);

  const atualizarTarefa = useCallback(async (tarefaId: string, updates: Partial<TarefaSemanal>): Promise<void> => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('tarefas_semanais')
        .update({
          ...updates,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', tarefaId);

      if (error) {
        console.error('Erro ao atualizar tarefa:', error);
        throw error;
      }

      setTarefas(prev => prev.map(t => 
        t.id === tarefaId ? { ...t, ...updates } : t
      ));
    } catch (err) {
      console.error('Erro ao atualizar tarefa:', err);
      throw err;
    }
  }, [user?.id]);

  const deletarTarefa = useCallback(async (tarefaId: string): Promise<void> => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('tarefas_semanais')
        .delete()
        .eq('id', tarefaId);

      if (error) {
        console.error('Erro ao deletar tarefa:', error);
        throw error;
      }

      setTarefas(prev => prev.filter(t => t.id !== tarefaId));
    } catch (err) {
      console.error('Erro ao deletar tarefa:', err);
      throw err;
    }
  }, [user?.id]);

  const toggleConcluida = useCallback(async (tarefaId: string): Promise<void> => {
    const tarefa = tarefas.find(t => t.id === tarefaId);
    if (!tarefa) return;

    const novoStatus = !tarefa.concluida;
    await atualizarTarefa(tarefaId, {
      concluida: novoStatus,
      data_conclusao: novoStatus ? new Date().toISOString() : null
    });
  }, [tarefas, atualizarTarefa]);

  // Histórico
  const carregarHistorico = useCallback(async (): Promise<void> => {
    if (!user?.id || !tenantId) return;

    try {
      const { data, error } = await supabase
        .from('historico_semanas_tarefas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .order('semana_an', { ascending: false });

      if (error) {
        console.error('Erro ao carregar histórico:', error);
        return;
      }

      setHistorico(data || []);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    }
  }, [user?.id, tenantId]);

  const arquivarSemana = useCallback(async (semanaAn: number): Promise<void> => {
    if (!user?.id || !tenantId) return;

    try {
      const { error } = await supabase.rpc('arquivar_semana_tarefas', {
        p_tenant_id: tenantId,
        p_user_id: user.id,
        p_semana_an: semanaAn
      });

      if (error) {
        console.error('Erro ao arquivar semana:', error);
        throw error;
      }

      // Se arquivou a semana atual, ir para próxima semana
      if (semanaAn === semanaAtual.semana_an) {
        proximaSemana();
      }

      await carregarHistorico();
    } catch (err) {
      console.error('Erro ao arquivar semana:', err);
      throw err;
    }
  }, [user?.id, tenantId, semanaAtual.semana_an, proximaSemana, carregarHistorico]);

  // Estatísticas
  const estatisticas = useMemo(() => {
    const total = tarefas.length;
    const concluidas = tarefas.filter(t => t.concluida).length;
    const pendentes = total - concluidas;
    const urgentes = tarefas.filter(t => t.prioridade === 'urgente' && !t.concluida).length;
    const recorrentes = tarefas.filter(t => t.recorrente).length;

    // Cálculo seguro do percentual
    let taxaConclusao = 0;
    if (total > 0 && concluidas >= 0) {
      taxaConclusao = Math.round((concluidas / total) * 100);
      // Garantir que seja um número válido
      if (isNaN(taxaConclusao) || !isFinite(taxaConclusao)) {
        taxaConclusao = 0;
      }
    }

    return {
      total,
      concluidas,
      pendentes,
      urgentes,
      recorrentes,
      taxaConclusao
    };
  }, [tarefas]);

  // Effects
  useEffect(() => {
    carregarTarefas();
  }, [carregarTarefas]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  return {
    // Estado
    tarefas,
    tarefasPorDia,
    isLoading,
    error,
    semanaAtual,
    historico,
    estatisticas,

    // Navegação
    irParaSemana,
    proximaSemana,
    semanaAnterior,
    irParaHoje,

    // CRUD
    criarTarefa,
    moverTarefa,
    atualizarTarefa,
    deletarTarefa,
    toggleConcluida,

    // Histórico
    carregarHistorico,
    arquivarSemana,

    // Refresh
    refetch: carregarTarefas
  };
};
