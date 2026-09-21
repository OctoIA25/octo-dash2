/**
 * Relatório de anúncios (P3.6) — leitura.
 *
 * Tudo vem de funções do banco, e não de consultas montadas aqui. A matriz
 * precisa ler `primeira_interacao_corretor`, que é server-only (sem grant para
 * o front): quem alcança é a função, por ser SECURITY DEFINER. É o uso certo —
 * devolve o agregado sem abrir as linhas.
 */

import { supabase } from '@/lib/supabaseClient';
import type { LinhaDeToque, Matriz, Verba } from './anuncios';

export async function carregarMatriz(
  tenantId: string,
  opts: { de: string; ate: string; por?: 'corretor' | 'equipe'; origem?: string } = {} as never
): Promise<Matriz | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('matriz_de_eficiencia', {
    p_tenant_id: tenantId,
    p_de: opts.de,
    p_ate: opts.ate,
    p_por: opts.por ?? 'corretor',
    p_origem: opts.origem || null,
  });
  if (error) throw error;
  return (data as Matriz) ?? null;
}

export interface LinhaDeCpa {
  construtora: string;
  gasto: number;
  vendas: number;
  vgc: number;
  vgv: number;
  cpa: number | null;
  roas_vgc: number | null;
  roas_vgv: number | null;
}

export interface ResultadoDeCpa {
  de: string;
  ate: string;
  linhas: LinhaDeCpa[];
  gasto_sem_construtora: number;
}

export async function carregarCpa(
  tenantId: string,
  de: string,
  ate: string
): Promise<ResultadoDeCpa | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('cpa_por_construtora', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  return (data as ResultadoDeCpa) ?? null;
}

export interface ResultadoDeToques {
  de: string;
  ate: string;
  linhas: LinhaDeToque[];
  resumo: {
    clientes: number;
    leads: number;
    clientes_repetidos: number;
    trocaram_de_origem: number;
  };
}

export async function carregarToques(
  tenantId: string,
  de: string,
  ate: string
): Promise<ResultadoDeToques | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('toques_por_origem', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  return (data as ResultadoDeToques) ?? null;
}

/** As verbas de um mês. `mes` no formato AAAA-MM. */
export async function listarVerbas(tenantId: string, mes: string): Promise<Verba[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const { data, error } = await supabase
    .from('verba_planejada')
    .select('id, mes, empreendimento, campaign_id, plataforma, valor')
    .eq('tenant_id', tenantId)
    .eq('mes', `${mes}-01`)
    .order('valor', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Verba[];
}

export async function salvarVerba(
  tenantId: string,
  v: { mes: string; empreendimento?: string | null; campaignId?: string | null; valor: number }
): Promise<void> {
  const { error } = await supabase.from('verba_planejada').insert({
    tenant_id: tenantId,
    // O banco cobra o primeiro dia do mês. Mandar "2026-10" cru quebraria com
    // uma mensagem que ninguém entende.
    mes: `${v.mes}-01`,
    empreendimento: v.empreendimento || null,
    campaign_id: v.campaignId || null,
    valor: v.valor,
    criada_por: (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  if (error) throw error;
}

export async function apagarVerba(id: string): Promise<void> {
  const { error } = await supabase.from('verba_planejada').delete().eq('id', id);
  if (error) throw error;
}

export interface ConfigDeAnuncios {
  custo_alvo_qualificado: number | null;
  custo_limite_qualificado: number | null;
}

export async function carregarConfigDeAnuncios(tenantId: string): Promise<ConfigDeAnuncios> {
  const vazia = { custo_alvo_qualificado: null, custo_limite_qualificado: null };
  if (!tenantId || tenantId === 'owner') return vazia;
  const { data, error } = await supabase
    .from('tenant_anuncios_config')
    .select('custo_alvo_qualificado, custo_limite_qualificado')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  // Sem config, o semáforo não pinta — e isso é um estado válido, não um erro.
  if (error) throw error;
  return (data as ConfigDeAnuncios) ?? vazia;
}

export interface CorretorDaCampanha {
  quem: string;
  recebidos: number;
  atendidos_1h: number;
  minutos_medio: number | null;
  visita: number;
  proposta: number;
  venda: number;
}

/**
 * Quem recebeu os leads de uma campanha — o critério de pronto do P3.6.
 *
 * Mesmas definições da matriz: "atendido em 1h" é o corretor, não a LIA, e
 * "venda" é a etapa do funil. Duas definições para a mesma palavra na mesma
 * tela seria pior do que não ter a tela.
 */
export async function carregarCorretoresDaCampanha(
  tenantId: string,
  campaignId: string,
  de: string,
  ate: string
): Promise<{ linhas: CorretorDaCampanha[]; sem_corretor: number } | null> {
  if (!tenantId || tenantId === 'owner' || !campaignId) return null;
  const { data, error } = await supabase.rpc('corretores_da_campanha', {
    p_tenant_id: tenantId, p_campaign_id: campaignId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  return (data as { linhas: CorretorDaCampanha[]; sem_corretor: number }) ?? null;
}
