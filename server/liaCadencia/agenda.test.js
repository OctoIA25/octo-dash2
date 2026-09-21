/**
 * Agenda da LIA (P2.5) — o horário de não incomodar.
 *
 * Tudo em `America/Sao_Paulo`: o banco guarda UTC e o cliente vive em Brasília.
 * Errar isso manda a mensagem três horas fora, que num retorno pedido para "às
 * 16h" é a diferença entre certo e constrangedor.
 */

import { describe, it, expect } from 'vitest';
import {
  AGENDA_PADRAO, janelaDoCliente, primeiroHorarioPermitido, podeCancelarPorRetornoDoLead,
} from './agenda.js';

/** Um instante de Brasília escrito como o banco guarda (UTC, -03). */
const brasilia = (iso) => new Date(`${iso}-03:00`);
/** Como a tela leria de volta, em Brasília. */
const emBrasilia = (d) =>
  d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');

describe('janelaDoCliente', () => {
  it('sem configuração, 9h às 20h todos os dias', () => {
    const j = janelaDoCliente(null);
    expect(j).toHaveLength(7);
    expect(j.every((d) => d && d.inicio === 540 && d.fim === 1200)).toBe(true);
  });

  it('respeita a janela e os dias configurados', () => {
    const j = janelaDoCliente({ pode_falar_das: '08:30', pode_falar_ate: '18:00', dias_permitidos: [1, 2, 3, 4, 5] });
    expect(j[0]).toBeNull();       // domingo
    expect(j[6]).toBeNull();       // sábado
    expect(j[1]).toEqual({ inicio: 510, fim: 1080 });
  });

  it('aceita o "09:00:00" que o Postgres devolve para `time`', () => {
    const j = janelaDoCliente({ pode_falar_das: '09:00:00', pode_falar_ate: '20:00:00', dias_permitidos: [1] });
    expect(j[1]).toEqual({ inicio: 540, fim: 1200 });
  });

  /**
   * Configuração quebrada não pode virar "nunca fale com ninguém": a
   * imobiliária pararia de responder e ninguém entenderia por quê.
   */
  it('configuração quebrada cai no padrão, não no silêncio', () => {
    const padrao = janelaDoCliente(null);
    expect(janelaDoCliente({ pode_falar_das: '20:00', pode_falar_ate: '09:00' })).toEqual(padrao);
    expect(janelaDoCliente({ pode_falar_das: 'xx', pode_falar_ate: 'yy' })).toEqual(padrao);
    expect(janelaDoCliente({ dias_permitidos: [] })).toEqual(padrao);
    expect(janelaDoCliente({ dias_permitidos: [9, 42] })).toEqual(padrao);
  });
});

describe('primeiroHorarioPermitido', () => {
  it('horário pedido dentro da janela sai na hora pedida', () => {
    const pedido = brasilia('2026-09-22T16:00:00');
    const r = primeiroHorarioPermitido(pedido, AGENDA_PADRAO);
    expect(r.ajustado).toBe(false);
    expect(r.quando.getTime()).toBe(pedido.getTime());
  });

  it('3h da manhã vira 9h do mesmo dia', () => {
    const r = primeiroHorarioPermitido(brasilia('2026-09-22T03:00:00'), AGENDA_PADRAO);
    expect(r.ajustado).toBe(true);
    expect(emBrasilia(r.quando)).toBe('2026-09-22T09:00:00');
  });

  it('22h vira 9h do dia seguinte', () => {
    const r = primeiroHorarioPermitido(brasilia('2026-09-22T22:30:00'), AGENDA_PADRAO);
    expect(r.ajustado).toBe(true);
    expect(emBrasilia(r.quando)).toBe('2026-09-23T09:00:00');
  });

  it('pula o dia não permitido inteiro', () => {
    // Sábado 26/09/2026 é sábado; com só dias úteis, cai na segunda.
    const cfg = { ...AGENDA_PADRAO, dias_permitidos: [1, 2, 3, 4, 5] };
    const r = primeiroHorarioPermitido(brasilia('2026-09-26T14:00:00'), cfg);
    expect(r.ajustado).toBe(true);
    expect(emBrasilia(r.quando)).toBe('2026-09-28T09:00:00');
  });

  it('a virada do dia é a de Brasília, não a do UTC', () => {
    // 21h de Brasília = 00h UTC do dia seguinte. Se a conta fosse em UTC, este
    // pedido "amanheceria" no dia errado e sairia 24h adiantado.
    const r = primeiroHorarioPermitido(brasilia('2026-09-22T21:00:00'), AGENDA_PADRAO);
    expect(emBrasilia(r.quando)).toBe('2026-09-23T09:00:00');
  });

  it('data inválida devolve nulo em vez de uma data inventada', () => {
    expect(primeiroHorarioPermitido(null, AGENDA_PADRAO)).toBeNull();
    expect(primeiroHorarioPermitido(new Date('não é data'), AGENDA_PADRAO)).toBeNull();
  });
});

describe('podeCancelarPorRetornoDoLead', () => {
  /**
   * A regra central do P2.5. Sem ela, "me chama amanhã às 16h" cancelaria o
   * próprio retorno — o pedido É o lead voltando a falar.
   */
  it('o retorno pedido pelo lead sobrevive ao lead voltar', () => {
    expect(podeCancelarPorRetornoDoLead({ pedido_por: 'lead' })).toBe(false);
  });

  it('a cadência automática continua sendo cancelada', () => {
    expect(podeCancelarPorRetornoDoLead({ pedido_por: 'lia' })).toBe(true);
    expect(podeCancelarPorRetornoDoLead({ tag: 'cadencia_conversa_1' })).toBe(true);
  });

  it('o agendado à mão pelo corretor também é cancelado quando o lead volta', () => {
    // O corretor agendou porque o lead sumiu; ele voltou, o motivo acabou.
    expect(podeCancelarPorRetornoDoLead({ pedido_por: 'corretor' })).toBe(true);
  });
});
