/**
 * Regra de comissão do forecast: lançamento 3,5%, terceiros 6%.
 *
 * Derivada, nunca persistida — se a classificação do lead ou o valor do negócio
 * mudarem, a comissão acompanha sozinha. Persistir criaria uma segunda fonte de
 * verdade que só discordaria da primeira.
 *
 * `classification` aceita `string` E `string[]` de propósito: a coluna está no
 * meio da migração para multi-valor (20260818_lead_classification_multi) e as
 * duas formas convivem enquanto ela não roda em produção.
 */

/** Percentual sobre o valor do negócio, por tipo de operação. */
export const PERCENTUAL_LANCAMENTO = 3.5;
export const PERCENTUAL_TERCEIROS = 6;

export type LeadClassification = string | string[] | null | undefined;

/** Mesma normalização do banco (`normalizar_texto`): minúsculas, sem acento. */
const normalizar = (valor: string): string =>
  valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/**
 * O lead é de lançamento? `locacao` e `pronto` não são — ambos caem em
 * terceiros (6%). Se locação vier a ter percentual próprio, é aqui que muda.
 */
export function isLancamento(classification: LeadClassification): boolean {
  if (!classification) return false;
  const valores = Array.isArray(classification) ? classification : [classification];
  return valores.some((v) => typeof v === 'string' && normalizar(v) === 'lancamento');
}

/** Percentual aplicável ao negócio (3.5 ou 6). */
export function percentualComissao(classification: LeadClassification): number {
  return isLancamento(classification) ? PERCENTUAL_LANCAMENTO : PERCENTUAL_TERCEIROS;
}

export interface Comissao {
  /** 3.5 ou 6 — o número, não a fração. */
  percentual: number;
  /** Valor do negócio × percentual, arredondado a centavos. 0 sem valor. */
  valor: number;
}

/**
 * Comissão de uma linha do forecast.
 *
 * Nome com sufixo `Forecast` de propósito: `calcularComissao` já existe em
 * `features/comissionamento/commissionRules.ts` e é outra coisa — lá é o rateio
 * Lotus entre corretor, líder e imobiliária. Aqui é só percentual sobre o valor.
 *
 * `valorNegocio` chega de `proposals.value`, que o PostgREST devolve como
 * string quando a coluna é NUMERIC — daí aceitar os dois tipos em vez de
 * confiar no runtime.
 */
export function calcularComissaoForecast(
  valorNegocio: number | string | null | undefined,
  classification: LeadClassification,
): Comissao {
  const percentual = percentualComissao(classification);
  const bruto = typeof valorNegocio === 'string' ? Number(valorNegocio) : valorNegocio;
  const base = Number.isFinite(bruto) && (bruto as number) > 0 ? (bruto as number) : 0;

  // `base * percentual` antes de dividir, e arredondamento explícito a centavos:
  // `base * (percentual / 100)` erra em float (800000 × 0.035 = 28000.000000000004),
  // e isso é um campo de dinheiro que o gestor soma no rodapé.
  return { percentual, valor: Math.round(base * percentual) / 100 };
}
