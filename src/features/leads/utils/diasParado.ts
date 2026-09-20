/**
 * O selo "dias parado" do card de lead (P1.4).
 *
 * Decidido pelo chefe em 20/09/2026:
 *   - conta do MOVIMENTO REAL (mudança de etapa, contato da LIA, toque do
 *     corretor, mensagem trocada) — quem calcula é `leads_ultima_movimentacao`
 *     no banco, para as três telas não divergirem;
 *   - faixas em 3 / 7 / 15 dias;
 *   - abaixo de 3 dias o card NÃO ganha selo. Selo em todo card vira
 *     paisagem, e aí ninguém mais enxerga o card que importa.
 *
 * SEM MOVIMENTO REGISTRADO NÃO É ZERO. Hoje 1.249 dos 1.681 leads ativos da
 * Lotus estão nesse caso, porque o registro de eventos só existe desde
 * 10/09/2026. Um selo dizendo "parado há 0 dias" para esses leads seria uma
 * afirmação falsa sobre 74% do quadro.
 */

export type FaixaDeParado = 'atencao' | 'alerta' | 'critico';

export interface SeloDeParado {
  dias: number;
  faixa: FaixaDeParado;
  texto: string;
  /** Para o `title` do elemento: o selo precisa poder se explicar. */
  explicacao: string;
  classe: string;
}

/** Os limites combinados, em dias. Editar aqui muda as três telas. */
export const LIMITES = { atencao: 3, alerta: 7, critico: 15 } as const;

const ESTILO: Record<FaixaDeParado, string> = {
  atencao: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  alerta: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  critico: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

const COMO_SE_MOVEU: Record<string, string> = {
  evento: 'a última movimentação registrada',
  toque: 'o último toque do corretor',
  conversa: 'a última mensagem trocada',
};

/** Dias inteiros decorridos. Nunca negativo: data no futuro é dado sujo. */
export function diasDesde(iso: string | null | undefined, agora: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}

/**
 * O selo de um lead, ou `null` quando não há selo a mostrar.
 *
 * Devolve `null` em dois casos MUITO diferentes, e é de propósito que a tela
 * trate os dois igual (sem selo): o lead que se moveu ontem não precisa de
 * aviso, e o lead sem registro não tem o que afirmar. O que a tela não pode
 * fazer é inventar um número para o segundo.
 */
export function seloDeParado(
  ultimaMovimentacao: string | null | undefined,
  fonte?: string | null,
  agora: number = Date.now()
): SeloDeParado | null {
  const dias = diasDesde(ultimaMovimentacao, agora);
  if (dias === null || dias < LIMITES.atencao) return null;

  const faixa: FaixaDeParado =
    dias >= LIMITES.critico ? 'critico' : dias >= LIMITES.alerta ? 'alerta' : 'atencao';

  const origem = (fonte && COMO_SE_MOVEU[fonte]) || 'a última movimentação registrada';

  return {
    dias,
    faixa,
    texto: `${dias} d parado`,
    explicacao: `Sem movimentação há ${dias} dias, contados de ${origem}.`,
    classe: ESTILO[faixa],
  };
}
