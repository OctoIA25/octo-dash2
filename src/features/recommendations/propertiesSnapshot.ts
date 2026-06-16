/**
 * Snapshot de imóveis para auditoria/histórico — compartilhado entre os canais
 * (e-mail e WhatsApp), evitando duplicação da regra de "qual preço guardar".
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { Finalidade } from './engine/types';
import type { SendRecommendationProperty } from './services/recommendationsApi';
import { formatLocalizacao } from './email/imovelToEmail';

const valorParaSnapshot = (imovel: Imovel, finalidade?: Finalidade): number | null => {
  if (finalidade === 'locacao') return imovel.valor_locacao || null;
  if (finalidade === 'venda') return imovel.valor_venda || null;
  return imovel.valor_venda || imovel.valor_locacao || null;
};

export const buildPropertiesSnapshot = (
  imoveis: Imovel[],
  finalidade?: Finalidade,
): SendRecommendationProperty[] =>
  imoveis.map((i) => ({
    referencia: i.referencia,
    titulo: i.titulo || i.tipo || 'Imóvel',
    localizacao: formatLocalizacao(i),
    preco: valorParaSnapshot(i, finalidade),
  }));
