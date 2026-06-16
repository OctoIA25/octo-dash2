/**
 * 🔍 Inferência de preferências do lead a partir do histórico de interesse.
 *
 * O "histórico de interesse" do lead, no modelo atual, são os imóveis com os
 * quais ele interagiu (imóveis-semente) somado a dados estruturados que o lead
 * já carrega (valor/tipo do imóvel de interesse). Esta camada é tolerante a
 * dados incompletos: cada campo só é preenchido quando há informação válida.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { Finalidade, LeadPreferences } from './types';

/** Dados estruturados que um lead pode carregar diretamente (sem imóvel-semente). */
export interface LeadInterestSignals {
  /** Valor do imóvel de interesse (ex.: leads.property_value). */
  precoReferencia?: number | null;
  /** Tipo simplificado de interesse, se conhecido. */
  tipo?: Imovel['tipoSimplificado'] | null;
  finalidade?: Finalidade | null;
}

const uniqueNonEmpty = (values: (string | null | undefined)[]): string[] =>
  Array.from(new Set(values.map((v) => (v ?? '').trim()).filter(Boolean)));

const average = (values: number[]): number | undefined => {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0) return undefined;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
};

const mostCommon = <T>(values: T[]): T | undefined => {
  if (values.length === 0) return undefined;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
};

/**
 * Deriva o valor de referência de um imóvel conforme a finalidade dominante.
 * Sem finalidade, usa o maior valor positivo disponível.
 */
const valorRelevante = (imovel: Imovel, finalidade?: Finalidade): number => {
  if (finalidade === 'locacao') return imovel.valor_locacao || 0;
  if (finalidade === 'venda') return imovel.valor_venda || 0;
  return Math.max(imovel.valor_venda || 0, imovel.valor_locacao || 0);
};

/**
 * Constrói as preferências do lead a partir dos imóveis-semente (os que ele já
 * demonstrou interesse) e de eventuais sinais estruturados do próprio lead.
 *
 * Imóveis-semente têm precedência sobre sinais soltos por serem evidência mais
 * rica; sinais soltos preenchem lacunas (fallback) quando não há semente.
 */
export const buildLeadPreferences = (
  seedImoveis: Imovel[],
  signals: LeadInterestSignals = {},
): LeadPreferences => {
  const seeds = seedImoveis.filter(Boolean);

  // Finalidade: a mais comum entre as sementes; senão, o sinal estruturado.
  const finalidadeFromSeeds = mostCommon(
    seeds.map((s) => s.finalidade).filter((f): f is Finalidade => Boolean(f)),
  );
  const finalidade: Finalidade | undefined =
    (finalidadeFromSeeds && finalidadeFromSeeds !== 'venda_locacao'
      ? finalidadeFromSeeds
      : undefined) ?? signals.finalidade ?? undefined;

  const cidades = uniqueNonEmpty(seeds.map((s) => s.cidade));
  const bairros = uniqueNonEmpty(seeds.map((s) => s.bairro));
  const estados = uniqueNonEmpty(seeds.map((s) => s.estado));

  const tiposFromSeeds = Array.from(
    new Set(seeds.map((s) => s.tipoSimplificado).filter(Boolean)),
  ) as Imovel['tipoSimplificado'][];
  const tipos =
    tiposFromSeeds.length > 0 ? tiposFromSeeds : signals.tipo ? [signals.tipo] : undefined;

  // Preço-alvo: média dos valores relevantes das sementes; senão, o sinal solto.
  const precoFromSeeds = average(seeds.map((s) => valorRelevante(s, finalidade)));
  const precoAlvo =
    precoFromSeeds ??
    (signals.precoReferencia && signals.precoReferencia > 0
      ? signals.precoReferencia
      : undefined);

  const quartos = average(seeds.map((s) => s.quartos));
  const banheiros = average(seeds.map((s) => s.banheiro));
  const areaUtil = average(seeds.map((s) => s.area_util));

  const preferences: LeadPreferences = {};
  if (finalidade) preferences.finalidade = finalidade;
  if (cidades.length) preferences.cidades = cidades;
  if (bairros.length) preferences.bairros = bairros;
  if (estados.length) preferences.estados = estados;
  if (tipos && tipos.length) preferences.tipos = tipos;
  if (precoAlvo) preferences.precoAlvo = precoAlvo;
  if (quartos) preferences.quartos = Math.round(quartos);
  if (banheiros) preferences.banheiros = Math.round(banheiros);
  if (areaUtil) preferences.areaUtil = Math.round(areaUtil);

  return preferences;
};
