/**
 * Formulários da Meta (P2.7) — os contadores e suas legendas.
 *
 * Os números dos casos são os de produção, medidos em 21/09/2026: 3
 * formulários, 125 leads, 56 deles sem campanha.
 */

import { describe, it, expect } from 'vitest';
import { contadores, desde, destinoDoFormulario, motivoParaBaixar } from './formulariosMeta';
import type { ContadoresDaMeta, FormularioDaMeta } from '../services/formulariosMetaService';

const AGORA = Date.parse('2026-09-21T12:00:00Z');

const c: ContadoresDaMeta = {
  formularios: 3,
  captando: 3,
  lia_atende: 2,
  sem_direcionamento: 1,
  leads_na_base: 125,
  novos_24h: 13,
  sem_campanha: 56,
  sincronizado_em: '2026-09-21T10:00:00Z',
  // A conferência com a Meta (item 6). Os números de partida são os de uma
  // casa que ainda não sincronizou nada: é o estado em que toda imobiliária
  // começa, e o que a tela não pode confundir com "conferi e bate".
  leads_na_meta: 0,
  formularios_conferidos: 0,
  conferido_em: null,
  eventos_travados: 0,
  eventos_parados: 0,
  campanhas_sem_formulario: 0,
};

const form = (over: Partial<FormularioDaMeta> = {}): FormularioDaMeta => ({
  form_id: '1050767041092494',
  nome: 'Reserva Castanheira',
  page_id: '942752912259386',
  captacao_ativa: true,
  lia_atende: true,
  baixado_ate: null,
  sincronizado_em: '2026-09-21T10:00:00Z',
  leads_na_base: 119,
  novos_24h: 13,
  sem_campanha: 56,
  leads_na_meta: null,
  leads_na_meta_em: null,
  status_na_meta: null,
  diferenca: null,
  eventos_travados: 0,
  eventos_parados: 0,
  ultimo_erro: null,
  ultimo_lead_em: '2026-09-20T20:00:00Z',
  empreendimento_codigo: 'RESERVA CASTANHEIRA',
  destino: 'lancamento',
  ...over,
});

describe('desde', () => {
  it('fala em minutos, horas e dias', () => {
    expect(desde('2026-09-21T11:48:00Z', AGORA)).toBe('há 12 min');
    expect(desde('2026-09-21T09:00:00Z', AGORA)).toBe('há 3 h');
    expect(desde('2026-09-16T12:00:00Z', AGORA)).toBe('há 5 dias');
  });

  /** "nunca" é informação; "há 0 min" seria mentira. */
  it('nunca sincronizado é "nunca"', () => {
    expect(desde(null, AGORA)).toBe('nunca');
    expect(desde('não é data', AGORA)).toBe('nunca');
  });
});

describe('contadores', () => {
  it('todo contador vem com a legenda que o plano pede', () => {
    const lista = contadores(c, AGORA);
    // Eram 6 até 23/09/2026; a conferência com a Meta (item 6) somou três:
    // o que não migrou, o que a Meta conta, e o que esta tela não enxerga.
    // O número fica preso de propósito — um contador a mais na tela é uma
    // decisão, e deve passar por aqui.
    expect(lista).toHaveLength(9);
    expect(lista.every((x) => x.legenda.length > 20)).toBe(true);
  });

  it('captação e LIA aparecem como "quantos de quantos"', () => {
    const lista = contadores(c, AGORA);
    expect(lista.find((x) => x.chave === 'captando')?.valor).toBe('3 de 3');
    expect(lista.find((x) => x.chave === 'lia')?.valor).toBe('2 de 3');
  });

  /**
   * Os dois contadores que pedem ação ficam em alerta — e só quando há o que
   * fazer. Alerta permanente vira paisagem.
   */
  it('alerta só quando há o que corrigir', () => {
    const lista = contadores(c, AGORA);
    expect(lista.find((x) => x.chave === 'sem_direcionamento')?.alerta).toBe(true);
    expect(lista.find((x) => x.chave === 'sem_campanha')?.alerta).toBe(true);

    const limpo = contadores({ ...c, sem_direcionamento: 0, sem_campanha: 0 }, AGORA);
    expect(limpo.find((x) => x.chave === 'sem_direcionamento')?.alerta).toBe(false);
    expect(limpo.find((x) => x.chave === 'sem_campanha')?.alerta).toBe(false);
  });

  it('nunca sincronizado é alerta — a lista pode estar velha', () => {
    const lista = contadores({ ...c, sincronizado_em: null }, AGORA);
    expect(lista.find((x) => x.chave === 'sincronizado')?.alerta).toBe(true);
  });

  it('sem dados não inventa contador', () => {
    expect(contadores(null, AGORA)).toEqual([]);
  });
});

describe('destinoDoFormulario', () => {
  it('com empreendimento, diz qual', () => {
    expect(destinoDoFormulario(form())).toBe('Roleta de RESERVA CASTANHEIRA');
  });

  /** É o "sem direcionamento" do contador, dito na linha da tabela. */
  it('sem empreendimento, cai no pega-tudo', () => {
    expect(destinoDoFormulario(form({ destino: 'pega_tudo', empreendimento_codigo: null }))).toBe(
      'Roleta geral (pega-tudo)'
    );
  });
});

describe('motivoParaBaixar', () => {
  it('nunca baixado sempre vale', () => {
    expect(motivoParaBaixar(form())).toContain('nunca baixado');
  });

  it('já baixado, só vale se houver campanha faltando', () => {
    expect(motivoParaBaixar(form({ baixado_ate: '2026-09-20T00:00:00Z', sem_campanha: 56 }))).toContain(
      '56 leads sem campanha'
    );
  });

  /** Sem motivo, o botão não convida a gastar consulta à Meta à toa. */
  it('nada a fazer devolve nulo', () => {
    expect(motivoParaBaixar(form({ baixado_ate: '2026-09-20T00:00:00Z', sem_campanha: 0 }))).toBeNull();
  });
});

/**
 * A conferência com a Meta (item 6, 23/09/2026).
 *
 * O que estes casos protegem é uma decisão, mais do que um cálculo: QUAL dos
 * dois números vira alerta vermelho.
 *
 * A diferença de contagem NÃO vira, porque `leads_count` da Meta é o total da
 * vida inteira do formulário e o nosso começa no dia em que a integração
 * entrou no ar — num formulário antigo a diferença é enorme e não é perda.
 * Pintar isso de vermelho treinaria a equipe a ignorar o vermelho.
 *
 * Quem vira alerta é o evento parado na fila: a Meta avisou, guardamos o
 * aviso, e o lead não chegou a existir.
 */
describe('a conferência Meta ↔ Dash', () => {
  const achar = (cs: ContadoresDaMeta, chave: string) =>
    contadores(cs, AGORA).find((x) => x.chave === chave)!;

  it('o que não migrou é o alerta', () => {
    const r = achar({ ...c, eventos_travados: 2, eventos_parados: 1 }, 'nao_migraram');
    expect(r.valor).toBe(3);
    expect(r.alerta).toBe(true);
    expect(r.legenda).toContain('2 falharam');
    expect(r.legenda).toContain('1 estão parados');
  });

  it('sem nada parado, o card diz que está limpo e não alerta', () => {
    const r = achar(c, 'nao_migraram');
    expect(r.valor).toBe(0);
    expect(r.alerta).toBeFalsy();
    expect(r.legenda).toContain('Todo lead anunciado virou lead aqui');
  });

  it('a diferença de contagem NUNCA alerta — e a legenda explica por quê', () => {
    const r = achar({
      ...c, leads_na_meta: 900, leads_na_base: 125,
      formularios_conferidos: 3, conferido_em: '2026-09-21T11:00:00Z',
    }, 'meta_conta');
    expect(r.alerta).toBeFalsy();
    expect(r.valor).toBe('900 · aqui 125');
    expect(r.legenda).toContain('vida inteira');
    expect(r.legenda).toContain('história, não perda');
  });

  it('sem ter perguntado, não finge que conferiu', () => {
    const r = achar(c, 'meta_conta');
    expect(r.valor).toBe('não perguntado');
    expect(r.legenda).toContain('Buscar formulários na Meta');
  });

  it('diz quantas campanhas ela NÃO enxerga, e isso alerta', () => {
    const r = achar({ ...c, campanhas_sem_formulario: 3 }, 'fora_desta_tela');
    expect(r.valor).toBe(3);
    expect(r.alerta).toBe(true);
    expect(r.legenda).toContain('conversa de WhatsApp');
    expect(r.legenda).toContain('não fala sobre elas');
  });

  it('quando tudo é formulário, ela diz que cobre o que está sendo pago', () => {
    const r = achar(c, 'fora_desta_tela');
    expect(r.alerta).toBeFalsy();
    expect(r.legenda).toContain('cobre o que está sendo pago');
  });
});
