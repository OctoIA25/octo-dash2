/**
 * Comissionamento da proposta.
 *
 * O percentual é a fonte única da verdade: os valores em R$ (comissão total e
 * a fatia de cada comissionado) são sempre derivados dele. Isso evita o estado
 * contraditório de ter R$ e % gravados e discordando entre si.
 *
 * ponytail: R$ é só leitura. Comissão fechada em valor absoluto precisa ser
 * convertida para % pelo usuário — se isso incomodar, o campo R$ vira input
 * com estado local e escreve o % de volta via rateFromAmount().
 */

/** Percentual padrão da casa quando a proposta ainda não tem um informado. */
export const DEFAULT_COMMISSION_PERCENT = '5,5%';

/** Tolerância para considerar as participações fechadas em 100%. */
const PARTICIPATION_EPSILON = 0.0001;

/**
 * Lê o percentual digitado ("5,5%", "5.5", "  5,5 % ") como fração (0,055).
 * Entrada vazia, inválida ou negativa vira 0 — comissão zerada é um estado
 * legítimo do formulário, não um erro a explodir na tela.
 */
export const parsePercentInput = (value: string | undefined | null): number => {
  const normalized = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (!normalized) return 0;

  // Com vírgula, ela é o separador decimal e o ponto é milhar (pt-BR);
  // sem vírgula, o ponto já é o separador decimal.
  const decimal = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;

  const parsed = Number(decimal);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed / 100;
};

/** 0,055 → "5,5%". */
export const formatPercent = (rate: number): string => {
  const percent = Number.isFinite(rate) ? rate * 100 : 0;
  return `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
};

/** Percentual equivalente a um valor em R$ sobre uma base. */
export const rateFromAmount = (amount: number, base: number): number =>
  base > 0 && Number.isFinite(amount) ? amount / base : 0;

export interface CommissionShare {
  /** Participação como fração (0,6 = 60%). */
  participation: number;
  /** Fatia em R$ da comissão total. */
  amount: number;
}

/** Divide a comissão total entre os comissionados conforme a participação de cada um. */
export const splitCommission = (total: number, participations: number[]): CommissionShare[] =>
  participations.map((participation) => ({
    participation,
    amount: total * participation,
  }));

export const sumParticipations = (participations: number[]): number =>
  participations.reduce((sum, participation) => sum + participation, 0);

/** A soma das participações fecha 100%? */
export const isFullyAllocated = (participationSum: number): boolean =>
  Math.abs(participationSum - 1) <= PARTICIPATION_EPSILON;
