/**
 * Hook para gerenciar OKRs (Objectives and Key Results)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export type StatusOKR = 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';

export interface KeyResult {
  id: string;
  titulo: string;
  meta: number;           // Valor da meta a alcançar
  alcancadoQ1: number;    // Alcançado no Quarter 1
  alcancadoQ2: number;    // Alcançado no Quarter 2
  alcancadoQ3: number;    // Alcançado no Quarter 3
  alcancadoQ4: number;    // Alcançado no Quarter 4
  concluido: boolean;
  progresso: number;      // Calculado automaticamente: (soma quarters / meta) * 100
}

// Função para calcular o progresso de um Key Result
export const calcularProgressoKR = (kr: KeyResult): number => {
  if (kr.meta <= 0) return 0;
  const somaQuarters = (kr.alcancadoQ1 || 0) + (kr.alcancadoQ2 || 0) + (kr.alcancadoQ3 || 0) + (kr.alcancadoQ4 || 0);
  const percentual = (somaQuarters / kr.meta) * 100;
  return Math.min(100, Math.round(percentual * 100) / 100); // Max 100%, 2 casas decimais
};

export interface OKR {
  id?: number;
  corretor_email: string;
  titulo: string;
  descricao?: string;
  trimestre: string;
  ano: number;
  progresso: number;
  status: StatusOKR;
  cor: string;
  key_results: KeyResult[];
  ordem: number;
  criador_email?: string;
  criador_nome?: string;
  atribuido_por_admin?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const useOKRs = () => {
  const { user } = useAuth();
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carregar OKRs do Supabase
  const loadOKRs = useCallback(async () => {
    if (!user?.email) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.warn('⚠️ useOKRs: funcionalidade desativada (sem DB e sem persistência temporária).');
      setOkrs([]);
    } catch (err) {
      console.error('Erro ao carregar OKRs:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  // Criar novo OKR
  const criarOKR = async (okr: Omit<OKR, 'id' | 'corretor_email' | 'created_at' | 'updated_at'>) => {
    if (!user?.email) return;

    const novoOKR: OKR = {
      ...okr,
      id: Date.now(),
      corretor_email: user.email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setOkrs(prev => [...prev, novoOKR]);
    return novoOKR;
  };

  // Atualizar OKR
  const atualizarOKR = async (id: number, updates: Partial<OKR>) => {
    if (!user?.email) return;

    setOkrs(prev => prev.map(okr => 
      okr.id === id 
        ? { ...okr, ...updates, updated_at: new Date().toISOString() }
        : okr
    ));
  };

  // Atualizar progresso do OKR baseado na média dos progressos dos Key Results
  const atualizarProgresso = async (id: number) => {
    const okr = okrs.find(o => o.id === id);
    if (!okr) return;

    const totalKRs = okr.key_results.length;
    if (totalKRs === 0) return;

    // Calcular média dos progressos de todos os KRs
    const somaProgressos = okr.key_results.reduce((acc, kr) => {
      const progresso = calcularProgressoKR(kr);
      return acc + progresso;
    }, 0);
    const novoProgresso = Math.round(somaProgressos / totalKRs);

    await atualizarOKR(id, { progresso: novoProgresso });
  };

  // Adicionar Key Result com estrutura completa (meta + quarters)
  const adicionarKeyResult = async (okrId: number, titulo: string, meta: number = 0) => {
    const okr = okrs.find(o => o.id === okrId);
    if (!okr) return;

    const novoKR: KeyResult = {
      id: Date.now().toString(),
      titulo,
      meta,
      alcancadoQ1: 0,
      alcancadoQ2: 0,
      alcancadoQ3: 0,
      alcancadoQ4: 0,
      concluido: false,
      progresso: 0
    };

    const novosKRs = [...okr.key_results, novoKR];
    await atualizarOKR(okrId, { key_results: novosKRs });
    await atualizarProgresso(okrId);
  };

  // Atualizar Key Result (meta, quarters, etc)
  const atualizarKeyResult = async (okrId: number, krId: string, updates: Partial<KeyResult>) => {
    const okr = okrs.find(o => o.id === okrId);
    if (!okr) return;

    const novosKRs = okr.key_results.map(kr => {
      if (kr.id === krId) {
        const updatedKR = { ...kr, ...updates };
        // Recalcular progresso automaticamente
        updatedKR.progresso = calcularProgressoKR(updatedKR);
        // Marcar como concluído se atingiu 100%
        updatedKR.concluido = updatedKR.progresso >= 100;
        return updatedKR;
      }
      return kr;
    });

    await atualizarOKR(okrId, { key_results: novosKRs });
    await atualizarProgresso(okrId);
  };

  // Marcar Key Result como concluído/não concluído
  const toggleKeyResult = async (okrId: number, krId: string) => {
    const okr = okrs.find(o => o.id === okrId);
    if (!okr) return;

    const novosKRs = okr.key_results.map(kr =>
      kr.id === krId ? { ...kr, concluido: !kr.concluido } : kr
    );

    await atualizarOKR(okrId, { key_results: novosKRs });
    await atualizarProgresso(okrId);
  };

  // Remover Key Result
  const removerKeyResult = async (okrId: number, krId: string) => {
    const okr = okrs.find(o => o.id === okrId);
    if (!okr) return;

    const novosKRs = okr.key_results.filter(kr => kr.id !== krId);
    await atualizarOKR(okrId, { key_results: novosKRs });
    await atualizarProgresso(okrId);
  };

  // Deletar OKR
  const deletarOKR = async (id: number) => {
    if (!user?.email) return;

    console.warn('⚠️ useOKRs: deleção desativada.');
  };

  // Estatísticas dos OKRs
  const estatisticas = {
    total: okrs.length,
    planejados: okrs.filter(o => o.status === 'planejado').length,
    em_andamento: okrs.filter(o => o.status === 'em_andamento').length,
    concluidos: okrs.filter(o => o.status === 'concluido').length,
    cancelados: okrs.filter(o => o.status === 'cancelado').length,
    progressoMedio: okrs.length > 0 
      ? Math.round(okrs.reduce((acc, o) => acc + o.progresso, 0) / okrs.length)
      : 0
  };

  // Carregar ao montar
  useEffect(() => {
    loadOKRs();
  }, [loadOKRs]);

  return {
    okrs,
    isLoading,
    error,
    criarOKR,
    atualizarOKR,
    adicionarKeyResult,
    atualizarKeyResult,
    toggleKeyResult,
    removerKeyResult,
    deletarOKR,
    atualizarProgresso,
    estatisticas,
    refetch: loadOKRs
  };
};

