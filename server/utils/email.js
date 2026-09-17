/**
 * E-mail de lead — normalização determinística e classificação.
 *
 * O que é determinístico (e portanto feito aqui): tirar espaço das pontas e
 * baixar a caixa. O que NÃO é: adivinhar o que falta. 'dulce@gmail.co' é um
 * domínio que existe (.co é a Colômbia), então o servidor não pode trocar por
 * '.com' sozinho — só marca como suspeito para quem tem contexto decidir.
 *
 * Espelhado em src/lib/contato.ts (dashboard); mesmos casos de teste nos dois.
 */

/**
 * Sintaxe aceitável: alguma coisa @ domínio com pelo menos um ponto e TLD de
 * 2+ letras. Deixa passar 'gmail.co' (existe) e barra 'gmail.com.b' (não).
 */
const SINTAXE = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/**
 * Provedor conhecido com o final truncado/trocado: o caso 'gmail.co' do
 * negócio. É uma lista curta de propósito — serve para SINALIZAR, nunca para
 * corrigir, e um domínio fora dela só é suspeito se alguém provar.
 */
const PROVEDOR_TRUNCADO =
  /^(gmail|hotmail|outlook|yahoo|icloud|live|msn|aol|bol|uol|terra|globo|ig)\.(co|cm|om|con|comm|cpm|vom)$/;

/**
 * Classifica um e-mail de lead.
 *
 * status:
 *  - 'vazio'    — não veio nada.
 *  - 'valido'   — sintaxe ok e domínio sem sinal de problema.
 *  - 'suspeito' — sintaxe ok, mas o domínio parece um provedor conhecido
 *                 truncado ('@gmail.co'). Vale como identificador, não como
 *                 endereço confiável para escrever.
 *  - 'invalido' — não é um endereço.
 *
 * @param {string} valor
 * @returns {{status: string, normalizado: string|null}}
 */
export const classificarEmail = (valor) => {
  const normalizado = String(valor ?? '').trim().toLowerCase();
  if (!normalizado) return { status: 'vazio', normalizado: null };
  if (!SINTAXE.test(normalizado)) return { status: 'invalido', normalizado };
  const dominio = normalizado.slice(normalizado.lastIndexOf('@') + 1);
  if (PROVEDOR_TRUNCADO.test(dominio)) return { status: 'suspeito', normalizado };
  return { status: 'valido', normalizado };
};

/** E-mail normalizado quando serve para comparar dois leads; senão null. */
export const chaveEmail = (valor) => {
  const { status, normalizado } = classificarEmail(valor);
  return status === 'valido' || status === 'suspeito' ? normalizado : null;
};
