/**
 * O gasto de anúncios dentro do Financeiro (P3.5).
 *
 * O plano manda substituir o "investimento por origem digitado à mão" pelo
 * número real da Meta. O problema é que os dois não têm a mesma forma: a Meta
 * dá UM gasto por conta de anúncios, e o Financeiro pede gasto POR ORIGEM, com
 * "Instagram" e "Facebook" em linhas separadas.
 *
 * Decidido com o chefe em 21/09: uma linha "Meta Ads" com o número real, e as
 * duas digitadas viram só leitura, com o aviso. Nada do que alguém digitou é
 * apagado — a decisão de mexer no valor antigo continua sendo da pessoa.
 */

import { reaisExatos } from './campanhas';

/** As origens que o gasto da Meta cobre, e que por isso deixam de ser digitadas. */
export const ORIGENS_COBERTAS_PELA_META = ['instagram', 'facebook', 'meta', 'meta ads'];

/** Normaliza igual ao `origemKey` do Financeiro: o nome chega com caixa livre. */
function chave(origem: string): string {
  return (origem || '').trim().toLowerCase();
}

/**
 * Esta origem passa a ser lida da Meta?
 *
 * Só as que a conta de anúncios de fato cobre. "ZAP Imóveis" continua digitada,
 * porque não é Meta e ninguém tem esse número automaticamente.
 */
export function vemDaMeta(origem: string): boolean {
  return ORIGENS_COBERTAS_PELA_META.includes(chave(origem));
}

export interface AvisoDeSubstituicao {
  /** O que a pessoa tinha digitado, somado, nas origens que a Meta cobre. */
  digitado: number;
  /** O que a Meta cobrou de fato no período. */
  real: number;
  /** As origens que ficaram travadas. */
  origens: string[];
  texto: string;
}

/**
 * O aviso que a tela mostra quando o número real substitui o digitado.
 *
 * Mostra os DOIS números. Trocar em silêncio faria o gestor achar que alguém
 * mexeu no que ele digitou; mostrando os dois, ele vê o tamanho do erro que
 * vinha carregando — e decide o que fazer com o valor antigo.
 */
export function avisoDeSubstituicao(
  custosDigitados: Record<string, number>,
  gastoRealDaMeta: number | null
): AvisoDeSubstituicao | null {
  if (gastoRealDaMeta == null || !(gastoRealDaMeta > 0)) return null;

  const origens: string[] = [];
  let digitado = 0;
  for (const [origem, valor] of Object.entries(custosDigitados ?? {})) {
    if (!vemDaMeta(origem)) continue;
    origens.push(origem);
    digitado += Number(valor) || 0;
  }

  const base = `Meta Ads: ${reaisExatos(gastoRealDaMeta)} no período, lido da Meta.`;
  if (origens.length === 0) {
    return { digitado: 0, real: gastoRealDaMeta, origens: [], texto: base };
  }

  const lista = origens.join(' e ');
  if (digitado === 0) {
    return {
      digitado,
      real: gastoRealDaMeta,
      origens,
      texto: `${base} ${lista} ${origens.length === 1 ? 'deixa' : 'deixam'} de ser digitado.`,
    };
  }
  return {
    digitado,
    real: gastoRealDaMeta,
    origens,
    texto: `${base} Substitui os ${reaisExatos(digitado)} digitados em ${lista} — ${
      gastoRealDaMeta > digitado ? 'o gasto real é maior' : 'o gasto real é menor'
    }. O valor antigo continua guardado.`,
  };
}
