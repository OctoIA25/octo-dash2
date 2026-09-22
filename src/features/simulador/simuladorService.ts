/**
 * O que o simulador (P2.2) busca e grava.
 *
 * A conta não está aqui — está em `fluxo.ts`, que não conhece rede. Este
 * módulo só traz os dados e guarda a fotografia.
 */

import { supabase } from '@/lib/supabaseClient';
import type { Condicao, Entradas, Fluxo } from './fluxo';

export interface LancamentoResumo {
  id: string;
  nome: string;
  construtora: string | null;
}

export interface TipologiaResumo {
  id: string;
  nome: string;
  dormitorios: number | null;
  area_privativa_m2: number | null;
  preco_a_partir: number | null;
  preco_atualizado_em: string | null;
  disponivel: boolean;
}

export async function buscarLancamentos(tenantId: string): Promise<LancamentoResumo[]> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, nome, construtora')
    .eq('tenant_id', tenantId)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as LancamentoResumo[];
}

export async function buscarTipologiasDisponiveis(lancamentoId: string): Promise<TipologiaResumo[]> {
  const { data, error } = await supabase
    .from('tipologias')
    .select('id, nome, dormitorios, area_privativa_m2, preco_a_partir, preco_atualizado_em, disponivel')
    .eq('lancamento_id', lancamentoId)
    .order('ordem');
  if (error) throw error;
  return (data ?? []) as TipologiaResumo[];
}

/**
 * A condição vigente para o empreendimento na data pedida.
 *
 * Devolve `null` quando não há nenhuma — e a tela DIZ isso, em vez de simular
 * sem regra. É o estado normal enquanto a tabela da construtora não for
 * cadastrada, não um erro.
 */
export async function buscarCondicaoVigente(
  lancamentoId: string,
  data?: string,
): Promise<Condicao | null> {
  const { data: linha, error } = await supabase
    .rpc('condicao_vigente', { p_lancamento_id: lancamentoId, p_data: data ?? null })
    .maybeSingle();
  if (error) throw error;
  // A função devolve a linha inteira; sem condição cadastrada, vem tudo nulo.
  const c = linha as (Condicao & { id?: string | null }) | null;
  return c && c.id ? c : null;
}

export interface SimulacaoSalva {
  leadId?: string | null;
  corretorId: string;
  tenantId: string;
  lancamentoId: string;
  tipologiaId: string | null;
  condicaoId: string | null;
  entradas: Entradas;
  resultado: Fluxo;
  /** Nome e vigência da tabela usada, copiados junto. */
  condicaoNome: string;
}

export async function salvarSimulacao(s: SimulacaoSalva): Promise<void> {
  const { error } = await supabase.from('simulacoes').insert({
    tenant_id: s.tenantId,
    lead_id: s.leadId ?? null,
    corretor_id: s.corretorId,
    lancamento_id: s.lancamentoId,
    tipologia_id: s.tipologiaId,
    condicao_id: s.condicaoId,
    entradas: s.entradas as unknown as Record<string, unknown>,
    // O nome da tabela vai DENTRO do resultado: se a condição for apagada ou
    // reescrita, a simulação continua dizendo por qual regra foi feita.
    resultado: { ...s.resultado, condicao_nome: s.condicaoNome } as unknown as Record<string, unknown>,
  });
  if (error) throw error;
}
