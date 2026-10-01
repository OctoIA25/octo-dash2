/**
 * A.5 · Funil de safra — a conta é do banco (`funil_de_safra`, 20261008).
 *
 * Só os leads que ENTRARAM no período. Números que não têm amostra chegam
 * como null e a tela escreve "Sem dados", nunca zero.
 */
import { supabase } from '@/integrations/supabase/client';

export type Atuacao = 'todos' | 'lancamento' | 'pronto';

export interface FunilDeSafra {
  entraram: number;
  /** Mesma ordem das etapas pedidas. */
  porEtapa: number[];
  fecharam: number;
  /** Fecharam com data conhecida — só eles entram na mediana. */
  fecharamComData: number;
  /** Mediana de dias entre entrar e fechar; null sem nenhum fechamento datado. */
  medianaDias: number | null;
  /** Não fecharam e não foram arquivados: continuam andando. */
  viva: number;
  arquivados: number;
  /** Quando o registro de etapas começa (antes dele vale a etapa atual do card). */
  inicioDoHistorico: string | null;
}

export async function carregarFunilDeSafra(
  tenantId: string,
  periodo: { de: string; ate: string },
  etapas: readonly string[],
  atuacao: Atuacao,
): Promise<FunilDeSafra> {
  const { data, error } = await supabase.rpc('funil_de_safra', {
    p_tenant_id: tenantId,
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_etapas: [...etapas],
    p_atuacao: atuacao === 'todos' ? null : atuacao,
  });
  if (error) throw new Error('Não deu para carregar a safra.');
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    entraram: n(d.entraram),
    porEtapa: Array.isArray(d.por_etapa) ? d.por_etapa.map(n) : [],
    fecharam: n(d.fecharam),
    fecharamComData: n(d.fecharam_com_data),
    medianaDias: d.mediana_dias == null ? null : Number(d.mediana_dias),
    viva: n(d.viva),
    arquivados: n(d.arquivados),
    inicioDoHistorico: (d.inicio_do_historico as string | null) ?? null,
  };
}
