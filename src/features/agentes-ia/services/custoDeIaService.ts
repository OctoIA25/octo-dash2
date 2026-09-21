/**
 * Custo de IA (P2.8).
 *
 * O custo é SEMPRE derivado na leitura — tokens reais × preço vigente — e nunca
 * gravado no evento: preço corrigido depois reescreveria o histórico, e um
 * evento com custo congelado errado é pior do que um evento sem custo.
 */

import { supabase } from '@/lib/supabaseClient';
import type { PainelDeCusto } from '../utils/custoDeIa';

export async function carregarCusto(
  tenantId: string,
  dias = 30
): Promise<PainelDeCusto | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const de = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data, error } = await supabase.rpc('ia_custos_painel', {
    p_tenant_id: tenantId,
    p_de: de,
    p_ate: new Date().toISOString(),
  });
  // Erro não vira custo zero: a tela diria "não gastou" onde houve falha.
  if (error) throw error;
  return (data as PainelDeCusto) ?? null;
}

export interface PrecoDeIa {
  id: string;
  tenant_id: string | null;
  modelo: string;
  provedor: string | null;
  preco_entrada_por_milhao: number;
  preco_cache_por_milhao: number | null;
  preco_saida_por_milhao: number;
  vigente_de: string;
  conferido_em: string | null;
  observacao: string | null;
}

export async function listarPrecos(): Promise<PrecoDeIa[]> {
  const { data, error } = await supabase
    .from('ia_precos')
    .select('id, tenant_id, modelo, provedor, preco_entrada_por_milhao, preco_cache_por_milhao, preco_saida_por_milhao, vigente_de, conferido_em, observacao')
    .order('provedor', { ascending: true })
    .order('modelo', { ascending: true })
    .order('vigente_de', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PrecoDeIa[];
}

/**
 * Marca o preço como conferido hoje, por quem clicou.
 *
 * Existe porque preço de IA muda com frequência: sem isso, um número de seis
 * meses atrás continua produzindo um custo errado que ninguém questiona.
 */
export async function marcarConferido(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('ia_precos')
    .update({ conferido_em: new Date().toISOString().slice(0, 10), conferido_por: userId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Corrigir preço cria uma VIGÊNCIA NOVA, não edita a antiga.
 *
 * Editar reescreveria o custo já apurado de meses passados. Com vigência nova,
 * o passado continua valendo pelo preço que valia na época — que é como
 * contabilidade funciona.
 */
export async function novaVigencia(
  base: PrecoDeIa,
  precos: { entrada: number; cache: number | null; saida: number },
  userId: string
): Promise<void> {
  const { error } = await supabase.from('ia_precos').insert({
    tenant_id: base.tenant_id,
    modelo: base.modelo,
    provedor: base.provedor,
    preco_entrada_por_milhao: precos.entrada,
    preco_cache_por_milhao: precos.cache,
    preco_saida_por_milhao: precos.saida,
    vigente_de: new Date().toISOString().slice(0, 10),
    conferido_em: new Date().toISOString().slice(0, 10),
    conferido_por: userId,
    observacao: base.observacao,
  });
  if (error) throw error;
}
