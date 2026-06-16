/**
 * 🧠 Motor de recomendação de imóveis (puro).
 *
 * Dada as preferências inferidas de um lead e a lista de imóveis disponíveis,
 * produz uma lista pontuada e ordenada por relevância. A pontuação é a média
 * ponderada dos critérios *aplicáveis* — critérios sem dado suficiente são
 * ignorados e os pesos renormalizados, de modo que dados incompletos degradam
 * a precisão graciosamente em vez de quebrar o resultado.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import { DEFAULT_CRITERIA, valorParaFinalidade } from './criteria';
import type {
  LeadPreferences,
  RecommendationOptions,
  ScoredImovel,
  MatchedCriterion,
} from './types';

const DEFAULT_LIMIT = 12;
const DEFAULT_MIN_SCORE = 1;

/** Indica se há preferências suficientes para gerar recomendações confiáveis. */
export const hasUsablePreferences = (preferences: LeadPreferences): boolean => {
  return Boolean(
    (preferences.cidades && preferences.cidades.length) ||
      (preferences.bairros && preferences.bairros.length) ||
      (preferences.tipos && preferences.tipos.length) ||
      (preferences.precoAlvo && preferences.precoAlvo > 0) ||
      (preferences.quartos && preferences.quartos > 0) ||
      (preferences.areaUtil && preferences.areaUtil > 0),
  );
};

/**
 * Verifica compatibilidade de finalidade. Um imóvel "venda_locacao" é compatível
 * com qualquer finalidade. Sem finalidade no lead → tudo é compatível.
 */
const finalidadeCompativel = (
  preferida: LeadPreferences['finalidade'],
  imovel: Imovel,
): boolean => {
  if (!preferida) return true;
  if (imovel.finalidade === 'venda_locacao') return true;
  return imovel.finalidade === preferida;
};

/** Pontua um único imóvel contra as preferências. Retorna null se nenhum critério se aplica. */
const scoreImovel = (
  preferences: LeadPreferences,
  imovel: Imovel,
  criteria = DEFAULT_CRITERIA,
): ScoredImovel | null => {
  const matched: MatchedCriterion[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const criterion of criteria) {
    const raw = criterion.score(preferences, imovel);
    if (raw === null) continue; // critério não aplicável (dado ausente)
    const clamped = Math.min(1, Math.max(0, raw));
    weightedSum += clamped * criterion.weight;
    totalWeight += criterion.weight;
    if (clamped > 0) {
      matched.push({
        key: criterion.key,
        label: criterion.label,
        score: clamped,
        weight: criterion.weight,
      });
    }
  }

  if (totalWeight === 0) return null; // nenhum critério aplicável

  const score = Math.round((weightedSum / totalWeight) * 100);
  // Ordena os critérios que mais contribuíram primeiro (para explicar o "porquê").
  matched.sort((a, b) => b.score * b.weight - a.score * a.weight);

  return {
    imovel,
    score,
    matched,
    applicableCriteria: matched.length,
  };
};

/**
 * Gera recomendações de imóveis para um lead.
 *
 * @returns lista ordenada por score desc; vazia quando não há dados/imóveis
 *          compatíveis (o chamador deve então recorrer à seleção manual).
 */
export const recommendImoveis = (
  preferences: LeadPreferences,
  imoveis: Imovel[],
  options: RecommendationOptions = {},
): ScoredImovel[] => {
  const {
    limit = DEFAULT_LIMIT,
    minScore = DEFAULT_MIN_SCORE,
    enforceFinalidade = true,
    excludeReferencias = [],
    criteria = DEFAULT_CRITERIA,
  } = options;

  if (!imoveis || imoveis.length === 0) return [];
  if (!hasUsablePreferences(preferences)) return [];

  const excluded = new Set(excludeReferencias.map((r) => r?.trim()).filter(Boolean));

  const scored: ScoredImovel[] = [];
  for (const imovel of imoveis) {
    if (imovel.referencia && excluded.has(imovel.referencia.trim())) continue;
    if (enforceFinalidade && !finalidadeCompativel(preferences.finalidade, imovel)) continue;

    const result = scoreImovel(preferences, imovel, criteria);
    if (result && result.score >= minScore) {
      scored.push(result);
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Desempate determinístico: mais critérios atendidos, depois referência.
    if (b.applicableCriteria !== a.applicableCriteria) {
      return b.applicableCriteria - a.applicableCriteria;
    }
    return (a.imovel.referencia || '').localeCompare(b.imovel.referencia || '');
  });

  return scored.slice(0, limit);
};

export { valorParaFinalidade };
