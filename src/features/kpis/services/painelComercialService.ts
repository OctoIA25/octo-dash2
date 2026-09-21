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
  opts: { de?: string; ate?: string; tipo?: 'todos' | 'lancamento' | 'terceiros' } = {}
): Promise<PainelComercial | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('painel_comercial', {
    p_tenant_id: tenantId,
    p_de: opts.de ?? null,
    p_ate: opts.ate ?? null,
    p_tipo: opts.tipo ?? 'todos',
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
