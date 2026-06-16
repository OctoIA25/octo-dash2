/**
 * Hook que orquestra a recomendação para um lead: resolve os imóveis-semente,
 * infere as preferências e roda o motor sobre a lista de imóveis disponível.
 * Memoizado para não recomputar a cada render.
 */

import { useMemo } from 'react';
import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { RecommendationLeadInput } from '../types';
import { buildLeadPreferences } from '../engine/preferences';
import { recommendImoveis, hasUsablePreferences } from '../engine/recommendationEngine';
import type { LeadPreferences } from '../engine/types';
import type { Candidate } from '../components/RecommendationItem';

interface UseRecommendationsResult {
  preferences: LeadPreferences;
  seedImoveis: Imovel[];
  candidates: Candidate[];
  hasEnoughData: boolean;
}

export const useRecommendations = (
  lead: RecommendationLeadInput | null,
  imoveis: Imovel[],
  limit = 12,
): UseRecommendationsResult => {
  return useMemo(() => {
    if (!lead) {
      return { preferences: {}, seedImoveis: [], candidates: [], hasEnoughData: false };
    }

    const seedSet = new Set(lead.seedReferencias.map((r) => r?.trim()).filter(Boolean));
    const seedImoveis = imoveis.filter((i) => i.referencia && seedSet.has(i.referencia.trim()));

    const preferences = buildLeadPreferences(seedImoveis, lead.signals);
    const hasEnoughData = hasUsablePreferences(preferences);

    const scored = recommendImoveis(preferences, imoveis, {
      limit,
      // Não recomenda imóveis que o lead já viu (sementes).
      excludeReferencias: Array.from(seedSet),
    });

    const candidates: Candidate[] = scored.map((s) => ({
      imovel: s.imovel,
      score: s.score,
      matched: s.matched,
      origin: 'auto',
    }));

    return { preferences, seedImoveis, candidates, hasEnoughData };
  }, [lead, imoveis, limit]);
};
