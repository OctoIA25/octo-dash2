/**
 * 🎯 Tipos do motor de recomendação de imóveis.
 *
 * O motor é PURO: não conhece React, Supabase nem rede. Recebe as preferências
 * inferidas do lead + a lista de imóveis disponível e devolve uma lista pontuada.
 * Toda a extensibilidade vive em {@link RecommendationCriterion}: adicionar um novo
 * fator de recomendação = adicionar um item no array de critérios, sem tocar no
 * algoritmo de pontuação.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';

/** Finalidade do interesse do lead (compra ou aluguel). */
export type Finalidade = Imovel['finalidade'];

/**
 * Preferências do lead, inferidas do histórico de interesse.
 *
 * Todos os campos são opcionais por design: leads com dados incompletos são a
 * regra, não a exceção. Cada critério sabe lidar com a ausência do seu campo
 * (retornando `null` em vez de pontuar), de modo que a falta de um dado nunca
 * quebra a recomendação — apenas reduz o número de critérios aplicáveis.
 */
export interface LeadPreferences {
  finalidade?: Finalidade;
  /** Cidades de interesse (qualquer match conta). */
  cidades?: string[];
  /** Bairros de interesse. */
  bairros?: string[];
  /** Estados de interesse (UF). */
  estados?: string[];
  /** Tipos simplificados de interesse (casa, apartamento, ...). */
  tipos?: Imovel['tipoSimplificado'][];
  /** Valor-alvo de referência (na moeda local). Comparado com o valor da finalidade. */
  precoAlvo?: number;
  quartos?: number;
  banheiros?: number;
  areaUtil?: number;
}

/**
 * Resultado da avaliação de um único critério para um imóvel.
 * `score` é normalizado em [0, 1]. `null` significa "não aplicável" (sem dado
 * suficiente para opinar) — o critério é então ignorado na média ponderada.
 */
export type CriterionScore = number | null;

/**
 * Um critério de recomendação plugável.
 *
 * Para adicionar um novo fator (ex.: proximidade geográfica por lat/long, número
 * de vagas, presença de piscina), basta criar um novo objeto deste tipo e
 * registrá-lo na lista de critérios. Nenhum outro ponto do sistema muda.
 */
export interface RecommendationCriterion {
  /** Identificador estável, usado em testes e no detalhamento do score. */
  key: string;
  /** Rótulo legível, exibido ao usuário (ex.: "Mesma cidade"). */
  label: string;
  /** Peso relativo do critério na pontuação final (>= 0). */
  weight: number;
  /**
   * Pontua o quão bem o imóvel atende a este critério, dadas as preferências.
   * Deve retornar `null` quando não houver dado suficiente para avaliar.
   */
  score: (preferences: LeadPreferences, imovel: Imovel) => CriterionScore;
}

/** Detalhe de um critério que efetivamente contribuiu para o score de um imóvel. */
export interface MatchedCriterion {
  key: string;
  label: string;
  /** Score normalizado [0, 1] daquele critério para este imóvel. */
  score: number;
  weight: number;
}

/** Imóvel recomendado, com pontuação e explicação. */
export interface ScoredImovel {
  imovel: Imovel;
  /** Pontuação de relevância em [0, 100]. */
  score: number;
  /** Critérios que contribuíram (ordenados por contribuição), para explicar o "porquê". */
  matched: MatchedCriterion[];
  /** Quantos critérios eram aplicáveis a este imóvel (transparência sobre dados parciais). */
  applicableCriteria: number;
}

/** Opções de execução do motor. */
export interface RecommendationOptions {
  /** Quantidade máxima de recomendações retornadas. Default: 12. */
  limit?: number;
  /** Score mínimo (0–100) para um imóvel ser considerado relevante. Default: 1. */
  minScore?: number;
  /**
   * Quando a finalidade do lead é conhecida, descarta imóveis incompatíveis
   * (ex.: lead quer alugar → não recomenda imóvel só de venda). Default: true.
   */
  enforceFinalidade?: boolean;
  /** Referências de imóveis a excluir do resultado (ex.: os que o lead já viu). */
  excludeReferencias?: string[];
  /** Lista de critérios a usar. Default: {@link DEFAULT_CRITERIA}. */
  criteria?: RecommendationCriterion[];
}
