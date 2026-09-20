/**
 * Quando cada lead se moveu pela última vez (P1.4).
 *
 * UMA chamada para o quadro inteiro, não uma por card: o Kanban desenha
 * centenas de cards, e uma consulta por card seria o N+1 que o P0.7 acabou de
 * tirar da Central de Leads.
 *
 * A regra do que conta como movimento mora no banco, em
 * `leads_ultima_movimentacao`. Aqui não se decide nada — só se transporta.
 */

import { supabase } from '@/lib/supabaseClient';

export interface Movimentacao {
  /** Quando o lead se moveu pela última vez. Ausente = sem registro. */
  ultima: string | null;
  fonte: string | null;
  /** A Lia entregou o lead a um corretor. */
  liaPassou: boolean;
  /** A Lia encostou no lead alguma vez. */
  liaAtendeu: boolean;
}

/** Leads por chamada. O array vai na URL do PostgREST, que tem limite de tamanho. */
const LOTE = 500;

/**
 * Mapa `lead_id -> { ultima, fonte, liaPassou, liaAtendeu }`.
 *
 * Quem não aparece no mapa não é "parado há 0 dias": é "sem registro". Quem
 * chama precisa tratar a ausência como ausência — devolver zero aqui faria a
 * tela afirmar o que a base não sabe.
 */
export async function buscarUltimaMovimentacao(
  tenantId: string,
  leadIds: string[]
): Promise<Record<string, Movimentacao>> {
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!tenantId || ids.length === 0) return {};

  const mapa: Record<string, Movimentacao> = {};

  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await supabase.rpc('leads_ultima_movimentacao', {
      p_tenant_id: tenantId,
      p_lead_ids: ids.slice(i, i + LOTE),
    });
    // Falha de leitura NÃO vira "nenhum lead parado": o quadro ficaria sem
    // nenhum selo e pareceria um quadro saudável. Sem selo por erro e sem
    // selo por lead recente se parecem na tela, então o erro sobe.
    if (error) throw error;

    type Linha = {
      lead_id: string; ultima: string | null; fonte: string | null;
      lia_passou: boolean | null; lia_atendeu: boolean | null;
    };
    for (const linha of (data ?? []) as Linha[]) {
      // A linha entra mesmo sem data: o estado do handoff é um fato à parte,
      // e filtrar por `ultima` aqui apagaria o sub-status do lead que a Lia
      // está atendendo e que ainda não se moveu.
      if (linha?.lead_id) {
        mapa[linha.lead_id] = {
          ultima: linha.ultima ?? null,
          fonte: linha.fonte ?? null,
          liaPassou: linha.lia_passou === true,
          liaAtendeu: linha.lia_atendeu === true,
        };
      }
    }
  }

  return mapa;
}
