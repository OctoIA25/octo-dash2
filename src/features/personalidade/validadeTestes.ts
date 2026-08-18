/**
 * Validade dos testes comportamentais.
 *
 * Regra: o perfil (DISC + Eneagrama + MBTI) vale 12 meses contados a partir do
 * teste MAIS ANTIGO. Passou disso, o corretor precisa refazer — senão os
 * relatórios da Elaine passam a descrever alguém que já mudou.
 *
 * Cálculo puro de datas. Quem exibe é o ValidadeTestesBadge.
 */

export const VALIDADE_TESTES_MESES = 12;

export interface ValidadeTestes {
  /** Data do teste mais antigo (ISO) — base da contagem. null quando não há teste. */
  baseEm: string | null;
  /** Data de vencimento (baseEm + 12 meses). null quando não há teste. */
  venceEm: string | null;
  /** true quando já passou de 12 meses do teste mais antigo. */
  vencido: boolean;
  /** Dias até vencer; negativo quando já venceu. null quando não há teste. */
  diasRestantes: number | null;
}

const DIA_MS = 86_400_000;

const SEM_TESTES: ValidadeTestes = {
  baseEm: null,
  venceEm: null,
  vencido: false,
  diasRestantes: null,
};

function paraData(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * @param datas datas de conclusão dos testes (disc/eneagrama/mbti). Valores
 *   nulos ou inválidos são ignorados — perfil incompleto não vence.
 */
export function calcularValidadeTestes(
  datas: Array<string | null | undefined>,
  agora: Date = new Date(),
): ValidadeTestes {
  const validas = datas.map(paraData).filter((d): d is Date => d !== null);
  if (validas.length === 0) return SEM_TESTES;

  const maisAntiga = new Date(Math.min(...validas.map((d) => d.getTime())));

  const vence = new Date(maisAntiga);
  vence.setMonth(vence.getMonth() + VALIDADE_TESTES_MESES);

  return {
    baseEm: maisAntiga.toISOString(),
    venceEm: vence.toISOString(),
    vencido: agora.getTime() >= vence.getTime(),
    diasRestantes: Math.ceil((vence.getTime() - agora.getTime()) / DIA_MS),
  };
}

/** Formata uma data ISO em dd/mm/aaaa; null quando a entrada não é utilizável. */
export function formatarDataBr(iso: string | null | undefined): string | null {
  const data = paraData(iso);
  return data ? data.toLocaleDateString('pt-BR') : null;
}
