/**
 * Agenda da LIA (P2.5) — leitura das linhas na tela.
 *
 * Tudo em Brasília: o banco guarda UTC, o cliente vive aqui, e mostrar "16h"
 * para um retorno que sai às 13h é a forma mais rápida de o gestor deixar de
 * confiar na tela.
 */

import { describe, it, expect } from 'vitest';
import { fraseDoNaoIncomodar, quandoCurto, quemVaiFalar, situacaoDaLinha } from './agendaLia';
import type { LinhaDaAgenda } from '../services/agendaLiaService';

/** 22/09/2026, 14h de Brasília (17h UTC). */
const AGORA = Date.parse('2026-09-22T17:00:00Z');

const linha = (over: Partial<LinhaDaAgenda> = {}): LinhaDaAgenda => ({
  id: 'x',
  lead_id: null,
  lead_nome: 'Carolina',
  quando: '2026-09-22T19:00:00Z',
  motivo: 'cliente pediu retorno às 16h',
  tag: null,
  status: 'pending',
  pedido_por: 'lead',
  tentativas: 1,
  enviado_em: null,
  canal: 'whatsapp',
  template: null,
  erro: null,
  cancelado_por: null,
  corretor_id: null,
  corretor_nome: null,
  ...over,
});

describe('quandoCurto', () => {
  it('fala em hoje, amanhã e ontem — no fuso de Brasília', () => {
    expect(quandoCurto('2026-09-22T19:00:00Z', AGORA)).toBe('hoje 16:00');
    expect(quandoCurto('2026-09-23T12:30:00Z', AGORA)).toBe('amanhã 09:30');
    expect(quandoCurto('2026-09-21T15:00:00Z', AGORA)).toBe('ontem 12:00');
  });

  it('data distante sai com dia e mês', () => {
    expect(quandoCurto('2026-10-05T13:00:00Z', AGORA)).toBe('05/10 10:00');
  });

  /**
   * 02h UTC do dia 23 ainda é dia 22 em Brasília (23h). Contando em UTC, o
   * retorno de hoje à noite apareceria como "amanhã" — e o gestor procuraria
   * na aba errada.
   */
  it('a virada do dia é a de Brasília, não a do UTC', () => {
    expect(quandoCurto('2026-09-23T02:00:00Z', AGORA)).toBe('hoje 23:00');
  });

  it('sem data não inventa hora', () => {
    expect(quandoCurto(null, AGORA)).toBe('sem hora');
    expect(quandoCurto('não é data', AGORA)).toBe('sem hora');
  });
});

describe('situacaoDaLinha', () => {
  it('enviado diz quando saiu', () => {
    const s = situacaoDaLinha(linha({ status: 'sent', enviado_em: '2026-09-22T19:00:00Z' }), AGORA);
    expect(s.texto).toBe('enviado hoje 16:00');
    expect(s.classe).toContain('emerald');
  });

  it('a cumprir enquanto a hora não chegou', () => {
    expect(situacaoDaLinha(linha(), AGORA).texto).toBe('a cumprir');
  });

  it('passou da hora e continua pendente é alarme, não "a cumprir"', () => {
    const s = situacaoDaLinha(linha({ quando: '2026-09-22T13:00:00Z' }), AGORA);
    expect(s.texto).toBe('passou da hora e não saiu');
    expect(s.classe).toContain('rose');
  });

  /**
   * 48 das 84 linhas que não saíram, em produção, não dizem por quê. A tela
   * admite isso em vez de inventar uma explicação.
   */
  it('"não saiu" sem motivo é dito como está', () => {
    expect(situacaoDaLinha(linha({ status: 'expired' }), AGORA).texto).toBe(
      'não saiu, e o disparador não disse por quê'
    );
  });

  it('"não saiu" com motivo mostra o motivo, venha de onde vier', () => {
    expect(situacaoDaLinha(linha({ status: 'expired', erro: 'timeout do gateway' }), AGORA).texto).toBe(
      'não saiu — timeout do gateway'
    );
    // Linha antiga, de antes da coluna `erro` existir.
    expect(
      situacaoDaLinha(linha({ status: 'expired', cancelado_por: 'claude_error: claude exited 1' }), AGORA).texto
    ).toContain('claude_error');
  });

  it('o cancelamento por retorno do lead se explica', () => {
    expect(situacaoDaLinha(linha({ status: 'cancelled', cancelado_por: 'lead_returned' }), AGORA).texto).toBe(
      'cancelado — o cliente voltou a falar'
    );
  });
});

describe('quemVaiFalar', () => {
  /**
   * Decidido pelo chefe em 21/09/2026: lead já com corretor, o corretor é
   * avisado e fala ele mesmo. Sem dizer isso na tela, o gestor esperaria uma
   * mensagem da LIA que, de propósito, não vai sair.
   */
  it('com corretor no lead, quem fala é o corretor', () => {
    expect(quemVaiFalar(linha({ corretor_id: 'u1', corretor_nome: 'Ana' }))).toBe(
      'Ana é quem fala — a LIA só avisa'
    );
  });

  it('sem corretor, a LIA manda', () => {
    expect(quemVaiFalar(linha())).toBe('a LIA manda a mensagem');
  });

  it('não diz nada sobre o que já saiu, nem sobre cadência automática', () => {
    expect(quemVaiFalar(linha({ status: 'sent' }))).toBeNull();
    expect(quemVaiFalar(linha({ pedido_por: 'lia' }))).toBeNull();
  });
});

describe('fraseDoNaoIncomodar', () => {
  it('diz o silêncio, guardando a janela em que se pode falar', () => {
    expect(fraseDoNaoIncomodar('09:00:00', '20:00:00')).toBe(
      'Não incomodar antes das 09:00 nem depois das 20:00'
    );
  });
});
