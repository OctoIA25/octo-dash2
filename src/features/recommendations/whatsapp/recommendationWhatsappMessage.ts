/**
 * 📲 Render da mensagem de recomendação para WhatsApp (puro).
 *
 * Reusa os MESMOS formatadores do e-mail (preço/localização/atributos) — a regra
 * de formatação de imóvel é compartilhada entre canais. Produz texto simples
 * com marcação leve do WhatsApp (*negrito*). É a fonte única do preview e do
 * corpo registrado no histórico.
 *
 * Observação: o envio efetivo fora da janela de 24h usa um TEMPLATE aprovado na
 * Meta (limitação da plataforma). Este texto é o conteúdo humano (preview +
 * auditoria); os parâmetros do template são derivados no servidor.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { Finalidade } from '../engine/types';
import { formatPreco, formatLocalizacao, formatAtributos } from '../email/imovelToEmail';

export interface WhatsappMessageData {
  leadNome: string;
  mensagem: string;
  imoveis: Imovel[];
  finalidade?: Finalidade;
  empresaNome?: string;
}

const linhaImovel = (imovel: Imovel, finalidade?: Finalidade): string => {
  const titulo = imovel.titulo || imovel.tipo || 'Imóvel';
  const partes = [
    `*${titulo}* (${imovel.referencia})`,
    formatLocalizacao(imovel),
    `💰 ${formatPreco(imovel, finalidade)}`,
  ];
  const attrs = formatAtributos(imovel);
  if (attrs.length) partes.push(attrs.join(' · '));
  return partes.filter(Boolean).join('\n');
};

/** Monta o corpo de texto da mensagem de WhatsApp. */
export const renderRecommendationWhatsapp = (data: WhatsappMessageData): string => {
  const linhas: string[] = [];
  const saudacao = data.leadNome?.trim() ? `Olá ${data.leadNome.trim()}! ` : 'Olá! ';
  linhas.push(`${saudacao}${data.mensagem.trim()}`);
  linhas.push('');
  data.imoveis.forEach((imovel) => {
    linhas.push(linhaImovel(imovel, data.finalidade));
    linhas.push('');
  });
  if (data.empresaNome?.trim()) {
    linhas.push(`— ${data.empresaNome.trim()}`);
  }
  return linhas.join('\n').trim();
};
