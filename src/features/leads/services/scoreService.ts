/**
 * Os sinais e os pesos do score (P1.7).
 *
 * UMA chamada de sinais para o quadro inteiro, como o selo de dias parado —
 * uma por card seria o N+1 que o P0.7 tirou da Central.
 *
 * Os pesos vêm numa consulta só, e o padrão é a tabela do plano: imobiliária
 * sem linha usa os pesos que o chefe validou em 20/09/2026.
 */

import { supabase } from '@/lib/supabaseClient';
import { PESOS_PADRAO, type PesosDoScore, type SinaisDoLead } from '../utils/score';

/** Leads por chamada. O array vai na URL do PostgREST, que tem limite. */
const LOTE = 300;

const COLUNAS_DOS_PESOS =
  'ponto_de_partida, peso_respondeu, peso_resposta_ate_10min, peso_resposta_ate_1h, ' +
  'peso_disse_o_que_procura, peso_renda_compativel, peso_renda_incompativel, peso_pediu_visita, ' +
  'peso_pediu_simulacao, peso_origem_maximo, peso_conversou_3_dias, peso_sem_resposta_7_dias, ' +
  'peso_so_pesquisando, limite_morno, limite_quente';

export interface ConfiguracaoDoScore {
  pesos: PesosDoScore;
  /** Bônus por origem, já normalizado em minúsculas. */
  porOrigem: Record<string, number>;
}

export async function buscarConfiguracaoDoScore(tenantId: string): Promise<ConfiguracaoDoScore> {
  if (!tenantId || tenantId === 'owner') return { pesos: PESOS_PADRAO, porOrigem: {} };

  const [cfg, origens] = await Promise.all([
    supabase.from('tenant_score_config').select(COLUNAS_DOS_PESOS).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('tenant_score_origem').select('origem, peso').eq('tenant_id', tenantId),
  ]);

  // Falha de leitura cai nos pesos do plano. O lado seguro de errar aqui é
  // usar a tabela combinada, não deixar o quadro sem score nenhum.
  const pesos: PesosDoScore = cfg.error || !cfg.data
    ? PESOS_PADRAO
    : { ...PESOS_PADRAO, ...(cfg.data as Partial<PesosDoScore>) };

  const porOrigem: Record<string, number> = {};
  for (const linha of (origens.data ?? []) as Array<{ origem: string; peso: number }>) {
    if (linha?.origem) porOrigem[String(linha.origem).trim().toLowerCase()] = Number(linha.peso) || 0;
  }

  return { pesos, porOrigem };
}

export async function salvarPesosDoScore(tenantId: string, pesos: PesosDoScore): Promise<void> {
  if (!tenantId || tenantId === 'owner') throw new Error('sem imobiliária selecionada');
  const { error } = await supabase
    .from('tenant_score_config')
    .upsert({ tenant_id: tenantId, ...pesos, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
  if (error) throw error;
}

/**
 * Os sinais observados de cada lead.
 *
 * Quem não aparece no mapa não tem sinal nenhum observado — e isso NÃO é o
 * mesmo que ter sinais que se anulam. O score dos dois dá 50, e a tela diz
 * qual é qual pelo número de sinais.
 */
export async function buscarSinaisDeScore(
  tenantId: string,
  leadIds: string[]
): Promise<Record<string, SinaisDoLead>> {
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!tenantId || tenantId === 'owner' || ids.length === 0) return {};

  const mapa: Record<string, SinaisDoLead> = {};

  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await supabase.rpc('leads_sinais_de_score', {
      p_tenant_id: tenantId,
      p_lead_ids: ids.slice(i, i + LOTE),
    });
    // Falha NÃO vira "nenhum sinal": o quadro inteiro ficaria com 50 e
    // pareceria um quadro avaliado. Quem chama decide o que fazer com o erro.
    if (error) throw error;

    for (const linha of (data ?? []) as Array<SinaisDoLead & { lead_id: string }>) {
      if (linha?.lead_id) {
        const { lead_id, ...sinais } = linha;
        mapa[lead_id] = sinais;
      }
    }
  }

  return mapa;
}
