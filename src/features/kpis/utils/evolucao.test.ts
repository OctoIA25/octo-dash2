/**
 * Gráfico de evolução (P3.3).
 *
 * Os números dos casos são os da Lotus, medidos em 21/09/2026: 37 vendas,
 * todas entre 02 e 17 de setembro. **Agosto tem zero** — é por isso que a
 * comparação com o período anterior e a média de 30 dias precisam de um
 * estado próprio em vez de uma linha rasteira sem explicação.
 */

import { describe, it, expect } from 'vitest';
import {
  baldesRestantes, ehUmMesSo, eventosNoRecorte, janela, linhaDaMeta, mediaMovel, montarPontos,
  resumoDaMedia, ritmoNecessario, rotuloDoBalde, valorDe,
  type Balde, type EventoComercial,
} from './evolucao';

const balde = (em: string, over: Partial<Balde> = {}): Balde => ({
  em, vendas: 0, vgv: 0, vgc: 0, vendas_com_vgv: 0, ticket: null, pct_comissao: null, ...over,
});

/** Setembro como ele é na base: dias 02 a 17 com venda, o resto em zero. */
const setembro = (): Balde[] =>
  Array.from({ length: 30 }, (_, i) => {
    const dia = String(i + 1).padStart(2, '0');
    const dentro = i + 1 >= 2 && i + 1 <= 17;
    return balde(`2026-09-${dia}`, dentro
      ? { vendas: 2, vgv: 900000, vgc: 42000, vendas_com_vgv: 2, ticket: 450000, pct_comissao: 4.67 }
      : {});
  });

describe('rotuloDoBalde', () => {
  /**
   * A armadilha que moveria o gráfico inteiro um dia para trás: `new
   * Date('2026-09-01')` é meia-noite UTC, e em São Paulo isso ainda é 31/08.
   */
  it('não deixa o fuso andar com a data', () => {
    expect(rotuloDoBalde('2026-09-01', 'dia')).toBe('01/09');
    expect(rotuloDoBalde('2026-01-01', 'dia')).toBe('01/01');
  });

  it('em meses, usa o nome do mês', () => {
    expect(rotuloDoBalde('2026-09-01', 'mes')).toBe('set/26');
    expect(rotuloDoBalde('2026-12-01', 'mes')).toBe('dez/26');
  });
});

describe('mediaMovel', () => {
  it('só devolve ponto com a janela cheia', () => {
    const m = mediaMovel([1, 2, 3, 4], 3);
    expect(m).toEqual([null, null, 2, 3]);
  });

  /**
   * Ticket de dia sem venda é ausente, não zero. Se um nulo fechasse a janela
   * como zero, a média cairia inventando uma queda que não houve.
   */
  it('um balde sem valor não fecha a janela', () => {
    expect(mediaMovel([1, null, 3, 4, 5], 3)).toEqual([null, null, null, null, 4]);
  });

  it('janela maior que a série não devolve nada', () => {
    expect(mediaMovel([1, 2], 7)).toEqual([null, null]);
  });
});

describe('resumoDaMedia', () => {
  /** 16 baldes de base contra uma janela de 30: a linha não existe ainda. */
  it('diz quantos períodos faltam quando a base é curta', () => {
    const r = resumoDaMedia(Array(16).fill(1), 30);
    expect(r.pontos).toBe(0);
    expect(r.texto).toBe('faltam 14 períodos de base');
  });

  /**
   * Setembro tem 30 baldes, então a base dá — mas o ticket é nulo nos dias sem
   * venda, e a janela de 30 nunca fecha. São duas causas diferentes e o texto
   * precisa distingui-las, senão o gestor espera a base crescer à toa.
   */
  it('base longa com buraco tem outro motivo, e outro texto', () => {
    const r = resumoDaMedia(setembro().map((b) => valorDe(b, 'ticket')), 30);
    expect(r.pontos).toBe(0);
    expect(r.texto).toBe('há períodos sem valor dentro da janela');
  });

  it('com pontos de verdade, não explica nada', () => {
    const r = resumoDaMedia(setembro().map((b) => valorDe(b, 'vendas')), 7);
    expect(r.pontos).toBe(24);
    expect(r.texto).toBeNull();
  });
});

describe('montarPontos', () => {
  /**
   * Por POSIÇÃO, não por data. As datas dos dois períodos nunca coincidem, e
   * alinhar por data deixaria a tracejada vazia sempre.
   */
  it('alinha o período anterior pela posição', () => {
    const atual = [balde('2026-09-01', { vendas: 3 }), balde('2026-09-02', { vendas: 5 })];
    const ant = [balde('2026-08-01', { vendas: 1 }), balde('2026-08-02', { vendas: 9 })];
    const p = montarPontos(atual, ant, 'vendas', 'dia');
    expect(p[0]).toMatchObject({ rotulo: '01/09', atual: 3, anterior: 1, emAnterior: '2026-08-01' });
    expect(p[1]).toMatchObject({ atual: 5, anterior: 9 });
  });

  it('anterior mais curto não quebra nem inventa ponto', () => {
    const p = montarPontos([balde('2026-09-01'), balde('2026-09-02')], [balde('2026-08-01')], 'vendas', 'dia');
    expect(p[1].anterior).toBeNull();
    expect(p[1].emAnterior).toBeNull();
  });
});

describe('linhaDaMeta', () => {
  /** O estado real: a tabela de metas está vazia na plataforma inteira. */
  it('sem meta cadastrada, não desenha e diz por quê', () => {
    expect(linhaDaMeta(null, 30, 'dia', true)).toMatchObject({ porBalde: null, texto: 'meta não cadastrada' });
    expect(linhaDaMeta(0, 30, 'dia', true).porBalde).toBeNull();
  });

  /**
   * A meta é do mês. Espalhada por seis meses de gráfico, a linha sairia seis
   * vezes mais baixa — e qualquer venda "superaria" a meta.
   */
  it('não espalha meta mensal por um período maior', () => {
    expect(linhaDaMeta(50, 6, 'mes', false)).toMatchObject({ porBalde: null });
    expect(linhaDaMeta(50, 6, 'mes', false).texto).toContain('escolha um mês');
    expect(linhaDaMeta(50, 60, 'dia', false).porBalde).toBeNull();
  });

  it('num mês só, é a meta dividida pelos dias', () => {
    expect(linhaDaMeta(60, 30, 'dia', true).porBalde).toBe(2);
  });
});

describe('ritmoNecessario', () => {
  it('sem meta, não inventa ritmo', () => {
    expect(ritmoNecessario(null, 37, 13).porBalde).toBeNull();
  });

  it('atrasado precisa de mais que o ritmo ideal', () => {
    // Meta 50, feitas 37, faltam 13 dias: 1 por dia — acima do ideal de 50/30.
    const r = ritmoNecessario(50, 37, 13);
    expect(r.porBalde).toBe(1);
    expect(r.texto).toBe('faltam 13 em 13 períodos');
  });

  it('meta batida é zero, não número negativo', () => {
    expect(ritmoNecessario(30, 37, 13)).toMatchObject({ porBalde: 0, texto: 'meta batida' });
  });

  it('período encerrado não divide por zero', () => {
    expect(ritmoNecessario(50, 37, 0).porBalde).toBeNull();
  });
});

describe('baldesRestantes', () => {
  it('conta o de hoje como ainda em aberto', () => {
    expect(baldesRestantes(setembro(), '2026-09-18')).toBe(13);
  });

  it('período inteiro no passado não tem o que correr', () => {
    expect(baldesRestantes(setembro(), '2026-10-05')).toBe(0);
  });
});

describe('eventosNoRecorte', () => {
  const eventos: EventoComercial[] = [
    { id: '1', em: '2026-09-05', dia: '2026-09-05', titulo: 'Feirão da cidade', empreendimento: null },
    { id: '2', em: '2026-09-08', dia: '2026-09-08', titulo: 'Início campanha Serrah', empreendimento: 'SERRAH' },
  ];

  it('sem filtro, o gráfico mostra tudo e as bandeirinhas também', () => {
    expect(eventosNoRecorte(eventos, {})).toHaveLength(2);
  });

  /** A bandeirinha da Serrah num gráfico só de Gioviale explicaria um pico que não é dela. */
  it('evento de empreendimento some quando o recorte é de outro', () => {
    const r = eventosNoRecorte(eventos, { empreendimento: ['GIOVIALE'] });
    expect(r.map((e) => e.titulo)).toEqual(['Feirão da cidade']);
  });

  it('evento da casa nunca some', () => {
    expect(eventosNoRecorte(eventos, { empreendimento: ['SERRAH'] })).toHaveLength(2);
  });
});

describe('ehUmMesSo', () => {
  it('reconhece o mês inteiro', () => {
    expect(ehUmMesSo('2026-09-01', '2026-09-30')).toBe(true);
    expect(ehUmMesSo('2026-02-01', '2026-02-28')).toBe(true);
  });

  it('mês pela metade ou dois meses não valem', () => {
    expect(ehUmMesSo('2026-09-01', '2026-09-17')).toBe(false);
    expect(ehUmMesSo('2026-09-02', '2026-09-30')).toBe(false);
    expect(ehUmMesSo('2026-08-01', '2026-09-30')).toBe(false);
  });

  it('ano bissexto conta 29 em fevereiro', () => {
    expect(ehUmMesSo('2028-02-01', '2028-02-29')).toBe(true);
    expect(ehUmMesSo('2026-02-01', '2026-02-29')).toBe(false);
  });
});

describe('janela', () => {
  it('um mês é o mês inteiro, com o último dia certo', () => {
    expect(janela('2026-09', 1)).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
    expect(janela('2026-02', 1)).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(janela('2028-02', 1).ate).toBe('2028-02-29');
  });

  it('seis meses terminam no mês escolhido e viram a régua para meses', () => {
    expect(janela('2026-09', 6)).toEqual({ de: '2026-04-01', ate: '2026-09-30' });
  });

  /** Doze meses atravessa o réveillon: sem isso o gráfico começaria no ano errado. */
  it('atravessa a virada do ano', () => {
    expect(janela('2026-09', 12).de).toBe('2025-10-01');
    expect(janela('2026-01', 3).de).toBe('2025-11-01');
  });
});
