/**
 * 🔁 Adaptador de domínio: converte um {@link Imovel} no formato de exibição do
 * e-mail ({@link EmailImovel}). Mantém a formatação (moeda, localização,
 * atributos) fora do template — o template só renderiza, não decide.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { EmailImovel } from './recommendationEmailTemplate';
import type { Finalidade } from '../engine/types';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Formata o preço relevante de acordo com a finalidade. */
export const formatPreco = (imovel: Imovel, finalidade?: Finalidade): string => {
  const venda = imovel.valor_venda || 0;
  const locacao = imovel.valor_locacao || 0;

  if (finalidade === 'locacao' && locacao > 0) return `${brl.format(locacao)}/mês`;
  if (finalidade === 'venda' && venda > 0) return brl.format(venda);

  // Sem finalidade definida: mostra o que houver, priorizando venda.
  if (venda > 0) return brl.format(venda);
  if (locacao > 0) return `${brl.format(locacao)}/mês`;
  return 'Sob consulta';
};

/** Monta a string de localização legível, omitindo partes ausentes. */
export const formatLocalizacao = (imovel: Imovel): string => {
  const cidadeUf = [imovel.cidade, imovel.estado].filter(Boolean).join(' - ');
  return [imovel.bairro, cidadeUf].filter(Boolean).join(', ');
};

/** Monta os atributos curtos exibidos como "chips", omitindo zeros. */
export const formatAtributos = (imovel: Imovel): string[] => {
  const attrs: string[] = [];
  if (imovel.quartos > 0) attrs.push(`${imovel.quartos} ${imovel.quartos === 1 ? 'quarto' : 'quartos'}`);
  if (imovel.banheiro > 0) attrs.push(`${imovel.banheiro} ${imovel.banheiro === 1 ? 'banheiro' : 'banheiros'}`);
  if (imovel.garagem > 0) attrs.push(`${imovel.garagem} ${imovel.garagem === 1 ? 'vaga' : 'vagas'}`);
  if (imovel.area_util > 0) attrs.push(`${imovel.area_util} m²`);
  return attrs;
};

/** Converte um imóvel do domínio para o formato consumido pelo template de e-mail. */
export const imovelToEmail = (
  imovel: Imovel,
  finalidade?: Finalidade,
  url?: string,
): EmailImovel => ({
  referencia: imovel.referencia,
  titulo: imovel.titulo || imovel.tipo || 'Imóvel',
  localizacao: formatLocalizacao(imovel),
  precoFormatado: formatPreco(imovel, finalidade),
  atributos: formatAtributos(imovel),
  fotoUrl: imovel.fotos?.[0],
  url,
});
