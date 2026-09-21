/**
 * OKRs (P3.4) — agora com banco.
 *
 * Até 21/09/2026 este hook não guardava nada: `loadOKRs` devolvia lista vazia
 * com um aviso no console, criar só mexia na memória e `deletarOKR` não
 * apagava coisa alguma. Criar um OKR e apertar F5 perdia tudo, e o botão de
 * apagar era decorativo.
 *
 * A API pública continua a mesma, de propósito: as 650 linhas do
 * `OKRManager` não precisam mudar. O que mudou foi de onde vêm os dados — e
 * o tipo do `id`, que virou uuid.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthContext } from '@/contexts/AuthContext';

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

/** O progresso de um key result: o que foi feito no ano sobre a meta. */
export const calcularProgressoKR = (kr: KeyResult): number => {
  if (kr.meta <= 0) return 0;
  const somaQuarters = (kr.alcancadoQ1 || 0) + (kr.alcancadoQ2 || 0) + (kr.alcancadoQ3 || 0) + (kr.alcancadoQ4 || 0);
  const percentual = (somaQuarters / kr.meta) * 100;
  return Math.min(100, Math.round(percentual * 100) / 100); // Max 100%, 2 casas decimais
};

/**
 * O progresso do objetivo: a média dos key results.
 *
 * Recebe a LISTA, e não o id do OKR. É o conserto de um defeito antigo: o
 * código anterior gravava os key results novos e logo depois recalculava o
 * progresso lendo `okrs` do estado do React — que ainda era o de antes. O
 * progresso saía sempre um passo atrasado, calculado sobre a lista velha.
 */
export const calcularProgressoOKR = (krs: KeyResult[]): number => {
  if (krs.length === 0) return 0;
  const soma = krs.reduce((acc, kr) => acc + calcularProgressoKR(kr), 0);
  return Math.round(soma / krs.length);
};

export interface OKR {
  id?: string;
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

/**
 * @param emailAlvo de quem são os OKRs. Vazio = os de quem está logado. A
 * gestão passa o e-mail da pessoa ao abrir pela Gestão de Equipe; quem não
 * for gestor simplesmente não recebe as linhas — quem decide é o banco, e
 * não esta linha de código.
 */
export const useOKRs = (emailAlvo?: string) => {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;
  const email = (emailAlvo || user?.email || '').toLowerCase();

  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOKRs = useCallback(async () => {
    if (!tenantId || tenantId === 'owner' || !email) {
      setOkrs([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('okrs')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('corretor_email', email)
        .order('ano', { ascending: false })
        .order('ordem', { ascending: true });
      if (err) throw err;
      setOkrs((data ?? []) as unknown as OKR[]);
    } catch (err) {
      // Erro não vira lista vazia: "você não tem OKR" e "não deu para ler"
      // são coisas diferentes, e a tela precisa poder dizer qual é.
      console.error('Erro ao carregar OKRs:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, email]);

  const criarOKR = async (okr: Omit<OKR, 'id' | 'corretor_email' | 'created_at' | 'updated_at'>) => {
    if (!tenantId || !email) return;
    const { data, error: err } = await supabase
      .from('okrs')
      .insert({
        ...okr,
        tenant_id: tenantId,
        corretor_email: email,
        criador_email: user?.email ?? null,
        criador_nome: user?.name ?? null,
        atribuido_por_admin: !!emailAlvo && emailAlvo.toLowerCase() !== (user?.email ?? '').toLowerCase(),
      })
      .select('*')
      .single();
    if (err) {
      setError(err.message);
      throw err;
    }
    setOkrs((prev) => [...prev, data as unknown as OKR]);
    return data as unknown as OKR;
  };

  const atualizarOKR = async (id: string, updates: Partial<OKR>) => {
    const { data, error: err } = await supabase
      .from('okrs')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (err) {
      setError(err.message);
      throw err;
    }
    setOkrs((prev) => prev.map((o) => (o.id === id ? (data as unknown as OKR) : o)));
    return data as unknown as OKR;
  };

  /**
   * Grava os key results e o progresso NA MESMA escrita.
   *
   * Uma escrita só porque duas deixariam a linha com os key results novos e o
   * progresso velho no intervalo entre elas — e, se a segunda falhasse, para
   * sempre.
   */
  const gravarKRs = async (okrId: string, krs: KeyResult[]) =>
    atualizarOKR(okrId, { key_results: krs, progresso: calcularProgressoOKR(krs) });

  const atualizarProgresso = async (id: string) => {
    const okr = okrs.find((o) => o.id === id);
    if (!okr) return;
    await atualizarOKR(id, { progresso: calcularProgressoOKR(okr.key_results) });
  };

  const adicionarKeyResult = async (okrId: string, titulo: string, meta: number = 0) => {
    const okr = okrs.find((o) => o.id === okrId);
    if (!okr) return;
    const novoKR: KeyResult = {
      id: crypto.randomUUID(),
      titulo,
      meta,
      alcancadoQ1: 0,
      alcancadoQ2: 0,
      alcancadoQ3: 0,
      alcancadoQ4: 0,
      concluido: false,
      progresso: 0,
    };
    await gravarKRs(okrId, [...okr.key_results, novoKR]);
  };

  const atualizarKeyResult = async (okrId: string, krId: string, updates: Partial<KeyResult>) => {
    const okr = okrs.find((o) => o.id === okrId);
    if (!okr) return;
    const novosKRs = okr.key_results.map((kr) => {
      if (kr.id !== krId) return kr;
      const atualizado = { ...kr, ...updates };
      atualizado.progresso = calcularProgressoKR(atualizado);
      atualizado.concluido = atualizado.progresso >= 100;
      return atualizado;
    });
    await gravarKRs(okrId, novosKRs);
  };

  const toggleKeyResult = async (okrId: string, krId: string) => {
    const okr = okrs.find((o) => o.id === okrId);
    if (!okr) return;
    await gravarKRs(
      okrId,
      okr.key_results.map((kr) => (kr.id === krId ? { ...kr, concluido: !kr.concluido } : kr))
    );
  };

  const removerKeyResult = async (okrId: string, krId: string) => {
    const okr = okrs.find((o) => o.id === okrId);
    if (!okr) return;
    await gravarKRs(okrId, okr.key_results.filter((kr) => kr.id !== krId));
  };

  const deletarOKR = async (id: string) => {
    const { error: err } = await supabase.from('okrs').delete().eq('id', id);
    if (err) {
      setError(err.message);
      throw err;
    }
    setOkrs((prev) => prev.filter((o) => o.id !== id));
  };

  const estatisticas = {
    total: okrs.length,
    planejados: okrs.filter((o) => o.status === 'planejado').length,
    em_andamento: okrs.filter((o) => o.status === 'em_andamento').length,
    concluidos: okrs.filter((o) => o.status === 'concluido').length,
    cancelados: okrs.filter((o) => o.status === 'cancelado').length,
    progressoMedio:
      okrs.length > 0 ? Math.round(okrs.reduce((acc, o) => acc + o.progresso, 0) / okrs.length) : 0,
  };

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
    refetch: loadOKRs,
  };
};
