/**
 * Agenda da LIA (P2.5) — o horário de não incomodar.
 *
 * Quando o lead pede "me chama amanhã às 16h", o retorno é agendado. Quando ele
 * pede num horário em que não se fala com cliente — 3h da manhã — o pedido não
 * é recusado: é EMPURRADO para o primeiro horário permitido, e a LIA avisa o
 * lead. Recusar perderia o pedido; mandar às 3h queimaria a imobiliária.
 *
 * A conta de "qual é o próximo horário permitido" não nasce aqui: é a mesma de
 * `server/distribuicao/janela.js`, que já sabe atravessar `America/Sao_Paulo` e
 * a virada do dia. Este módulo só traduz a configuração do cliente para a
 * janela que aquele módulo entende.
 *
 * Puro: recebe data e configuração, devolve data.
 */

import { proximoMinutoUtil } from '../distribuicao/janela.js';

/** O que vale sem ninguém configurar: 9h às 20h, todos os dias. */
export const AGENDA_PADRAO = {
  pode_falar_das: '09:00',
  pode_falar_ate: '20:00',
  dias_permitidos: [0, 1, 2, 3, 4, 5, 6],
};

/** "09:00" ou "09:00:00" → 540. Devolve null quando não dá para ler. */
function emMinutos(hhmm) {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/**
 * A configuração do banco vira a janela de 7 posições (0 = domingo) que
 * `proximoMinutoUtil` espera. Dia não permitido é `null`, como o domingo da
 * distribuição.
 *
 * Configuração quebrada — janela invertida, horário ilegível, nenhum dia —
 * cai no PADRÃO em vez de virar "nunca pode falar". Uma imobiliária que
 * configurou errado deve continuar atendendo no horário comercial, não parar
 * de responder em silêncio.
 */
export function janelaDoCliente(config) {
  const cfg = config ?? {};
  const inicio = emMinutos(cfg.pode_falar_das) ?? emMinutos(AGENDA_PADRAO.pode_falar_das);
  const fim = emMinutos(cfg.pode_falar_ate) ?? emMinutos(AGENDA_PADRAO.pode_falar_ate);
  const dias = Array.isArray(cfg.dias_permitidos) && cfg.dias_permitidos.length > 0
    ? cfg.dias_permitidos.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : AGENDA_PADRAO.dias_permitidos;

  if (!(fim > inicio) || dias.length === 0) return janelaDoCliente(null);

  const permitidos = new Set(dias);
  return Array.from({ length: 7 }, (_, dia) => (permitidos.has(dia) ? { inicio, fim } : null));
}

/**
 * O primeiro instante em que dá para falar com o cliente, a partir de `quando`.
 *
 * Devolve o próprio `quando` se o horário já é permitido — o caso comum, e o
 * que faz "me chama amanhã às 16h" sair às 16h em ponto.
 *
 * @returns {{quando: Date, ajustado: boolean} | null}
 */
export function primeiroHorarioPermitido(quando, config) {
  if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) return null;
  const permitido = proximoMinutoUtil(quando, janelaDoCliente(config));
  if (!permitido) return null;
  return { quando: permitido, ajustado: permitido.getTime() !== quando.getTime() };
}

/**
 * O retorno que o LEAD pediu não é cancelado quando o lead volta a falar.
 *
 * É a regra central do P2.5, e existe porque o pedido É o lead falando: hoje
 * 2.361 dos 2.419 cancelamentos são `lead_returned`, e sem esta distinção o
 * próprio "me chama amanhã" cancelaria o retorno que ele acabou de pedir.
 *
 * Cadência automática continua sendo cancelada — a LIA ia cutucar quem sumiu, e
 * ele apareceu. Cancelamento pedido por gente (a Dash, o corretor, a LIA
 * encerrando) vale para todos.
 */
export function podeCancelarPorRetornoDoLead(followup) {
  return followup?.pedido_por !== 'lead';
}
