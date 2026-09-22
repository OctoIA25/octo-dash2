import { describe, it, expect } from 'vitest';
import {
  quemEnviou, contarPorAutor, liaEstaAtendendo, ROTULO_DO_AUTOR,
  type MensagemParaAutoria,
} from '../quemEnviou';

const msg = (over: Partial<MensagemParaAutoria> = {}): MensagemParaAutoria => ({
  direction: 'outbound',
  ...over,
});

describe('quemEnviou', () => {
  it('recebida não tem etiqueta — a posição da bolha já diz', () => {
    expect(quemEnviou(msg({ direction: 'inbound' }))).toBeNull();
    // Nem quando vem com marca: a marca de entrada é `role: user`, e ainda
    // assim quem falou foi o cliente.
    expect(quemEnviou(msg({ direction: 'inbound', metadata: { role: 'user' } }))).toBeNull();
  });

  it('a coluna manda', () => {
    expect(quemEnviou(msg({ enviado_por: 'lia' }))).toBe('lia');
    expect(quemEnviou(msg({ enviado_por: 'disparo' }))).toBe('disparo');
    expect(quemEnviou(msg({ enviado_por: 'corretor', sent_by_user_id: 'u1' }))).toBe('corretor');
  });

  it('a coluna vence a marca antiga quando as duas discordam', () => {
    // Acontece se a LIA gravar a coluna e esquecer de tirar o metadata, ou o
    // contrário. A coluna tem CHECK; o metadata não tem contrato nenhum.
    expect(quemEnviou(msg({ enviado_por: 'corretor', sent_by_user_id: 'u1', metadata: { role: 'assistant' } })))
      .toBe('corretor');
  });

  it('valor estranho na coluna cai para a reserva, não para a coluna', () => {
    // Se alguém gravar 'robo' ou 'LIA' em maiúscula, não vira etiqueta nova.
    expect(quemEnviou(msg({ enviado_por: 'robo' }))).toBe('nao_registrado');
    expect(quemEnviou(msg({ enviado_por: 'LIA' }))).toBe('nao_registrado');
  });

  it('sem a coluna, a marca antiga da LIA ainda vale', () => {
    expect(quemEnviou(msg({ metadata: { role: 'assistant', lia_source: 'session' } }))).toBe('lia');
  });

  it('sem coluna e sem marca, mas com autor, é corretor', () => {
    expect(quemEnviou(msg({ sent_by_user_id: 'u1' }))).toBe('corretor');
  });

  it('as 2.107 mensagens anônimas de setembro NÃO viram LIA', () => {
    // É a decisão central do item: enviada e sem marca nenhuma fica sem
    // etiqueta. Chutar "LIA" seria afirmar autoria de conversa com cliente.
    expect(quemEnviou(msg({ metadata: {} }))).toBe('nao_registrado');
    expect(quemEnviou(msg({ metadata: null }))).toBe('nao_registrado');
    expect(quemEnviou(msg())).toBe('nao_registrado');
    expect(quemEnviou(msg({ enviado_por: null, sent_by_user_id: null }))).toBe('nao_registrado');
  });

  it('todo autor tem rótulo em português', () => {
    for (const a of ['lia', 'corretor', 'disparo', 'nao_registrado'] as const) {
      expect(ROTULO_DO_AUTOR[a]).toBeTruthy();
    }
    expect(ROTULO_DO_AUTOR.nao_registrado).toMatch(/não registrado/);
  });
});

describe('contarPorAutor', () => {
  it('conta cada um e ignora as recebidas', () => {
    const conta = contarPorAutor([
      msg({ enviado_por: 'lia' }),
      msg({ enviado_por: 'lia' }),
      msg({ enviado_por: 'corretor', sent_by_user_id: 'u1' }),
      msg({ metadata: {} }),
      msg({ direction: 'inbound' }),
      msg({ direction: 'inbound' }),
    ]);
    expect(conta).toEqual({ lia: 2, corretor: 1, disparo: 0, nao_registrado: 1 });
  });

  it('lista vazia não quebra', () => {
    expect(contarPorAutor([])).toEqual({ lia: 0, corretor: 0, disparo: 0, nao_registrado: 0 });
  });
});

describe('liaEstaAtendendo', () => {
  it('sim quando ela falou e ninguém assumiu', () => {
    expect(liaEstaAtendendo([msg({ enviado_por: 'lia' })], false)).toBe(true);
  });

  it('não quando alguém assumiu, mesmo que ela tenha falado antes', () => {
    expect(liaEstaAtendendo([msg({ enviado_por: 'lia' })], true)).toBe(false);
  });

  it('não quando ela nunca falou aqui', () => {
    expect(liaEstaAtendendo([msg({ enviado_por: 'corretor', sent_by_user_id: 'u1' })], false)).toBe(false);
    expect(liaEstaAtendendo([msg({ direction: 'inbound' })], false)).toBe(false);
    expect(liaEstaAtendendo([], false)).toBe(false);
  });

  it('mensagem anônima não conta como LIA atendendo', () => {
    // O mesmo cuidado da etiqueta: sem marca, não se afirma que ela está lá.
    expect(liaEstaAtendendo([msg({ metadata: {} })], false)).toBe(false);
  });
});
