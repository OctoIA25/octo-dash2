/**
 * 🧩 Composição do e-mail de recomendação a partir do domínio.
 *
 * Liga o domínio (Imovel) ao template puro, produzindo tanto o e-mail
 * renderizado (para preview E envio — mesma fonte) quanto o snapshot de imóveis
 * para o histórico. Pura e testável.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { Finalidade } from '../engine/types';
import type { SendRecommendationProperty } from '../services/recommendationsApi';
import { imovelToEmail } from './imovelToEmail';
import { buildPropertiesSnapshot } from '../propertiesSnapshot';
import {
  renderRecommendationEmail,
  defaultSubject,
  type EmailBranding,
  type RenderedEmail,
} from './recommendationEmailTemplate';

export interface ComposeEmailParams {
  leadNome: string;
  mensagem: string;
  imoveis: Imovel[];
  finalidade?: Finalidade;
  branding: EmailBranding;
  /** Assunto customizado; se vazio, usa o assunto padrão. */
  assuntoCustom?: string;
}

export interface ComposedEmail {
  rendered: RenderedEmail;
  /** Assunto final (custom ou padrão). */
  subject: string;
  /** Snapshot dos imóveis para auditoria/histórico. */
  propertiesSnapshot: SendRecommendationProperty[];
}

export const composeRecommendationEmail = (
  params: ComposeEmailParams,
): ComposedEmail => {
  const emailImoveis = params.imoveis.map((i) => imovelToEmail(i, params.finalidade));
  const rendered = renderRecommendationEmail({
    leadNome: params.leadNome,
    mensagem: params.mensagem,
    imoveis: emailImoveis,
    branding: params.branding,
  });

  const subject =
    params.assuntoCustom?.trim() || defaultSubject(params.leadNome, params.imoveis.length);

  const propertiesSnapshot = buildPropertiesSnapshot(params.imoveis, params.finalidade);

  // O assunto efetivo é o custom; o render usa o padrão internamente para o <title>,
  // mas o envio usa este subject. Sobrescrevemos para manter consistência.
  return {
    rendered: { ...rendered, subject },
    subject,
    propertiesSnapshot,
  };
};
