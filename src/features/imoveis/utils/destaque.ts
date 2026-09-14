/**
 * Filtro de destaque do catálogo (multi-seleção).
 *
 * `destaque` e `super_destaque` são duas colunas independentes em
 * `imoveis_locais` — o banco aceita as duas true. Por isso o casamento é por
 * flag, sem precedência: um imóvel com as duas aparece tanto em "Destaque"
 * quanto em "Super Destaque". Imóvel só do XML não tem flag → "Sem Destaque".
 */
import type { Imovel } from '../services/kenloService';

export type NivelDestaque = 'sem_destaque' | 'destaque' | 'super_destaque';

export const NIVEIS_DESTAQUE: ReadonlyArray<{ value: NivelDestaque; label: string }> = [
  { value: 'sem_destaque', label: 'Sem Destaque' },
  { value: 'destaque', label: 'Destaque' },
  { value: 'super_destaque', label: 'Super Destaque' },
];

/** Seleção vazia = sem filtro; vários níveis combinam com OU. */
export const correspondeAoDestaque = (
  imovel: Pick<Imovel, 'destaque' | 'super_destaque'>,
  selecionados: readonly NivelDestaque[],
): boolean => {
  if (selecionados.length === 0) return true;
  const destaque = imovel.destaque === true;
  const superDestaque = imovel.super_destaque === true;
  return selecionados.some((nivel) => {
    if (nivel === 'destaque') return destaque;
    if (nivel === 'super_destaque') return superDestaque;
    return !destaque && !superDestaque;
  });
};
