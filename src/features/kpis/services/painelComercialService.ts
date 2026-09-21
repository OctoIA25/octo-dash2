/**
 * Painel comercial (P3.1).
 *
 * Uma chamada devolve o período, o mês anterior e o mesmo mês do ano anterior —
 * as três contas feitas pela MESMA função no banco. Calcular a comparação no
 * navegador daria uma segunda regra para a mesma pergunta, e ela divergiria na
 * primeira correção.
 */

import { supabase } from '@/lib/supabaseClient';
import type { PainelComercial } from '../utils/painelComercial';

export async function carregarPainel(
  tenantId: string,
  opts: {
    de?: string;
    ate?: string;
    tipo?: 'todos' | 'lancamento' | 'terceiros';
    /** O mesmo recorte das tabelas de ranking (P3.2) — um filtro só. */
    filtros?: Record<string, string[]>;
  } = {}
): Promise<PainelComercial | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('painel_comercial', {
    p_tenant_id: tenantId,
    p_de: opts.de ?? null,
    p_ate: opts.ate ?? null,
    p_tipo: opts.tipo ?? 'todos',
    p_filtros: opts.filtros ?? {},
  });
  // Erro não vira painel zerado: a tela diria "não vendeu nada" onde houve falha.
  if (error) throw error;
  return (data as PainelComercial) ?? null;
}

export interface AliasDeEmpreendimento {
  nome_bruto: string;
  nome_canonico: string;
  tipo: 'lancamento' | 'terceiros' | null;
}

export async function listarAlias(tenantId: string): Promise<AliasDeEmpreendimento[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const { data, error } = await supabase
    .from('vendas_empreendimento_alias')
    .select('nome_bruto, nome_canonico, tipo')
    .eq('tenant_id', tenantId)
    .order('nome_canonico');
  if (error) throw error;
  return (data ?? []) as AliasDeEmpreendimento[];
}

/** Classifica um empreendimento. É o que faz o filtro parar de esconder venda. */
export async function classificar(
  tenantId: string,
  nomeBruto: string,
  tipo: 'lancamento' | 'terceiros'
): Promise<void> {
  const { error } = await supabase
    .from('vendas_empreendimento_alias')
    .update({ tipo, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('nome_bruto', nomeBruto);
  if (error) throw error;
}

// ---------------------------------------------------------------------- P3.2

import type { Dimensao, Filtros } from '../utils/filtrosDoPainel';

export interface LinhaDeRanking {
  valor: string;
  vendas: number;
  vgv: number;
  vgc: number;
  /** Fatia do VGV do período. Null quando não há VGV para dividir. */
  participacao: number | null;
}

export type Rankings = Record<Dimensao, LinhaDeRanking[]> & {
  vgv_do_periodo: number;
} & Record<`${Dimensao}_sem_valor`, number>;

export async function carregarRankings(
  tenantId: string,
  opts: { de?: string; ate?: string; tipo?: string; filtros?: Filtros } = {}
): Promise<Rankings | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('painel_comercial_rankings', {
    p_tenant_id: tenantId,
    p_de: opts.de ?? null,
    p_ate: opts.ate ?? null,
    p_tipo: opts.tipo ?? 'todos',
    p_filtros: opts.filtros ?? {},
    p_limite: 10,
  });
  if (error) throw error;
  return (data as Rankings) ?? null;
}

export interface VisaoSalva {
  id: string;
  nome: string;
  filtros: Filtros;
  tipo: string | null;
  criada_por: string | null;
}

export async function listarVisoes(tenantId: string): Promise<VisaoSalva[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const { data, error } = await supabase
    .from('painel_visoes')
    .select('id, nome, filtros, tipo, criada_por')
    .eq('tenant_id', tenantId)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as VisaoSalva[];
}

export async function salvarVisao(
  tenantId: string,
  nome: string,
  filtros: Filtros,
  tipo: string
): Promise<void> {
  const { error } = await supabase.from('painel_visoes').insert({
    tenant_id: tenantId,
    nome: nome.trim(),
    filtros,
    tipo,
    criada_por: (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  if (error) throw error;
}

export async function apagarVisao(id: string): Promise<void> {
  const { error } = await supabase.from('painel_visoes').delete().eq('id', id);
  if (error) throw error;
}
