/**
 * 📐 Critérios de recomendação plugáveis.
 *
 * Cada critério é independente e autocontido. Para estender o motor, adicione um
 * novo {@link RecommendationCriterion} aqui (ou injete via
 * `RecommendationOptions.criteria`) — o algoritmo de pontuação não precisa mudar.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { LeadPreferences, RecommendationCriterion, CriterionScore } from './types';

/** Normaliza texto para comparação tolerante (sem acento, sem caixa, sem espaços extras). */
export const normalizeText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Retorna o valor do imóvel relevante para a finalidade do lead. */
export const valorParaFinalidade = (
  imovel: Imovel,
  finalidade: LeadPreferences['finalidade'],
): number => {
  if (finalidade === 'locacao') return imovel.valor_locacao || 0;
  if (finalidade === 'venda') return imovel.valor_venda || 0;
  // Sem finalidade definida: usa o maior valor positivo disponível como referência.
  return Math.max(imovel.valor_venda || 0, imovel.valor_locacao || 0);
};

/** 1 se o conjunto de preferências contém o valor do imóvel; 0 caso contrário. null se sem preferência. */
const matchAnyText = (
  preferred: string[] | undefined,
  candidate: string | null | undefined,
): CriterionScore => {
  if (!preferred || preferred.length === 0) return null;
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedCandidate) return null;
  return preferred.some((p) => normalizeText(p) === normalizedCandidate) ? 1 : 0;
};

/**
 * Pontua proximidade numérica com decaimento linear: score 1 quando igual ao alvo,
 * caindo até 0 quando a diferença relativa atinge `toleranciaRelativa`.
 */
const proximidadeRelativa = (
  alvo: number | undefined,
  valor: number | null | undefined,
  toleranciaRelativa: number,
): CriterionScore => {
  if (!alvo || alvo <= 0) return null;
  if (valor == null || valor <= 0) return null;
  const diffRelativa = Math.abs(valor - alvo) / alvo;
  if (diffRelativa >= toleranciaRelativa) return 0;
  return 1 - diffRelativa / toleranciaRelativa;
};

/**
 * Pontua proximidade de contagem inteira (quartos, banheiros): igual = 1,
 * cada unidade de diferença reduz `passo`, limitado a [0, 1]. null se sem preferência.
 */
const proximidadeContagem = (
  alvo: number | undefined,
  valor: number | null | undefined,
  passo = 0.4,
): CriterionScore => {
  if (alvo == null || alvo <= 0) return null;
  if (valor == null || valor < 0) return null;
  const diff = Math.abs(valor - alvo);
  return Math.max(0, 1 - diff * passo);
};

/**
 * Conjunto padrão de critérios. A ordem não importa; os pesos definem a
 * importância relativa. Pesos foram escolhidos para priorizar localização e
 * faixa de preço, que são os fatores de maior peso na decisão imobiliária.
 */
export const DEFAULT_CRITERIA: RecommendationCriterion[] = [
  {
    key: 'cidade',
    label: 'Mesma cidade',
    weight: 3,
    score: (pref, imovel) => matchAnyText(pref.cidades, imovel.cidade),
  },
  {
    key: 'bairro',
    label: 'Mesmo bairro',
    weight: 4,
    score: (pref, imovel) => matchAnyText(pref.bairros, imovel.bairro),
  },
  {
    key: 'estado',
    label: 'Mesmo estado',
    weight: 1,
    score: (pref, imovel) => matchAnyText(pref.estados, imovel.estado),
  },
  {
    key: 'tipo',
    label: 'Mesmo tipo de imóvel',
    weight: 3,
    score: (pref, imovel) => {
      if (!pref.tipos || pref.tipos.length === 0) return null;
      return pref.tipos.includes(imovel.tipoSimplificado) ? 1 : 0;
    },
  },
  {
    key: 'preco',
    label: 'Faixa de preço próxima',
    weight: 4,
    // Tolerância de 30%: além disso, considera-se fora da faixa de interesse.
    score: (pref, imovel) =>
      proximidadeRelativa(pref.precoAlvo, valorParaFinalidade(imovel, pref.finalidade), 0.3),
  },
  {
    key: 'quartos',
    label: 'Quartos compatíveis',
    weight: 2,
    score: (pref, imovel) => proximidadeContagem(pref.quartos, imovel.quartos),
  },
  {
    key: 'banheiros',
    label: 'Banheiros compatíveis',
    weight: 1,
    score: (pref, imovel) => proximidadeContagem(pref.banheiros, imovel.banheiro),
  },
  {
    key: 'area',
    label: 'Área útil compatível',
    weight: 2,
    // Tolerância de 40% na área útil.
    score: (pref, imovel) => proximidadeRelativa(pref.areaUtil, imovel.area_util, 0.4),
  },
];
