/**
 * Campanhas e ROI (P3.5) — leitura e sincronização.
 *
 * A leitura vem do banco, não da Meta: quem busca na Meta é o servidor, e o
 * resultado fica guardado. Assim a tela responde na hora, diz de quando é o
 * número, e continua de pé quando a Meta oscila.
 */

import { supabase } from '@/lib/supabaseClient';
import { buscarConfiguracaoDoScore, buscarSinaisDeScore } from '@/features/leads/services/scoreService';
import { calcularScore } from '@/features/leads/utils/score';
import { contarQualificados, type ResultadoDeCampanhas } from './campanhas';

export async function carregarCampanhas(
  tenantId: string,
  de?: string,
  ate?: string
): Promise<ResultadoDeCampanhas | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('campanhas_resultado', {
    p_tenant_id: tenantId,
    p_de: de ?? null,
    p_ate: ate ?? null,
  });
  // Erro não vira tela vazia: "não gastamos nada" e "não deu para ler" são
  // coisas diferentes, e confundi-las esconderia o gasto de um mês inteiro.
  if (error) throw error;
  return (data as ResultadoDeCampanhas) ?? null;
}

/**
 * Manda o servidor buscar na Meta e gravar.
 *
 * `dias` repete de propósito os últimos dias: a Meta ajusta números depois do
 * fato. Quem impede isso de dobrar o mês é a chave única da tabela.
 */
export async function sincronizarGasto(
  tenantId: string,
  opts: { dias?: number; de?: string; ate?: string } = {}
): Promise<{ gravadas: number; gasto: number; campanhas: number }> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error('sessão expirada');

  const resp = await fetch('/api/v1/meta/insights/sincronizar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ tenantId, ...opts }),
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok || !corpo?.ok) {
    // A mensagem da Meta chega inteira: "conta_de_anuncios_ausente" manda o
    // gestor ao campo certo, e "meta_indisponivel" diz para tentar de novo.
    const err = new Error(corpo?.detalhe || corpo?.error || `falhou com ${resp.status}`);
    (err as Error & { codigo?: string }).codigo = corpo?.error;
    throw err;
  }
  return { gravadas: corpo.gravadas ?? 0, gasto: corpo.gasto ?? 0, campanhas: corpo.campanhas ?? 0 };
}

/**
 * Quantos qualificados cada campanha tem.
 *
 * O score sai de `calcularScore`, a MESMA função da lista de leads — e os
 * sinais, da mesma RPC. Refazer a conta aqui daria dois números com o mesmo
 * nome divergindo na primeira correção de peso.
 */
export async function qualificadosPorCampanha(
  tenantId: string,
  campanhas: ResultadoDeCampanhas['campanhas']
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!tenantId || tenantId === 'owner' || !campanhas?.length) return out;

  // Só os que ainda não passaram da visita precisam de score: os que passaram
  // já contam, e pedir sinal deles seria trabalho jogado fora.
  const visitaDe = new Map(campanhas.map((c) => [c.campaign_id, new Set(c.lead_ids_visita ?? [])]));
  const precisam = [...new Set(
    campanhas.flatMap((c) => (c.lead_ids ?? []).filter((id) => !visitaDe.get(c.campaign_id)?.has(id)))
  )];

  if (precisam.length === 0) {
    for (const c of campanhas) out[c.campaign_id] = (c.lead_ids_visita ?? []).length;
    return out;
  }

  const [config, sinais] = await Promise.all([
    buscarConfiguracaoDoScore(tenantId),
    buscarSinaisDeScore(tenantId, precisam),
  ]);

  const scorePorLead: Record<string, number | undefined> = {};
  for (const [id, s] of Object.entries(sinais)) {
    scorePorLead[id] = calcularScore(s, config.pesos).score;
  }

  for (const c of campanhas) {
    out[c.campaign_id] = contarQualificados(
      c.lead_ids ?? [],
      c.lead_ids_visita ?? [],
      scorePorLead,
      config.pesos.limite_quente
    );
  }
  return out;
}

export interface LinhaDeDetalhe {
  adset_id?: string;
  adset_nome?: string;
  ad_id?: string;
  ad_nome?: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  leads_meta: number;
  ctr: number | null;
  cpc: number | null;
  custo_por_lead: number | null;
}

export interface DetalheDaCampanha {
  campaign_id: string;
  conjuntos: LinhaDeDetalhe[];
  anuncios: LinhaDeDetalhe[];
}

/** Só quando a pessoa abre a linha: trazer o detalhe de tudo pesaria a tela à toa. */
export async function carregarDetalhe(
  tenantId: string,
  campaignId: string,
  de: string,
  ate: string
): Promise<DetalheDaCampanha | null> {
  if (!tenantId || tenantId === 'owner' || !campaignId) return null;
  const { data, error } = await supabase.rpc('campanha_detalhe', {
    p_tenant_id: tenantId,
    p_campaign_id: campaignId,
    p_de: de,
    p_ate: ate,
  });
  if (error) throw error;
  return (data as DetalheDaCampanha) ?? null;
}

/**
 * O gasto total da Meta num período, para o Financeiro.
 *
 * Lê a mesma tabela da aba Campanhas — uma fonte só. Devolve `null` quando não
 * há nada guardado, e não zero: "ninguém sincronizou ainda" e "não se gastou
 * nada" são coisas diferentes, e confundi-las travaria os campos digitados em
 * cima de um total falso.
 */
export async function gastoDaMetaNoPeriodo(
  tenantId: string,
  de: string,
  ate: string
): Promise<number | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase
    .from('meta_insights_diarios')
    .select('gasto')
    .eq('tenant_id', tenantId)
    .gte('data', de)
    .lte('data', ate);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, l) => s + (Number((l as { gasto: number }).gasto) || 0), 0);
  return Math.round(total * 100) / 100;
}
