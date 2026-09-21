/**
 * Filtro clicando na linha (P3.2).
 *
 * O caso que define o item é o de clicar duas vezes: sem SHIFT o clique TROCA,
 * com SHIFT soma, e clicar no que já está escolhido desfaz. Errar isso faz o
 * gestor acumular filtros sem perceber e ler um painel que não é o que ele pensa.
 */

import { describe, it, expect } from 'vitest';
import {
  aoClicar, chips, daQuery, estaSelecionado, nomeSugerido, paraQuery, quantosFiltros, remover,
  type Filtros,
} from './filtrosDoPainel';

describe('URL ↔ filtros', () => {
  it('ida e volta preserva o recorte', () => {
    const f: Filtros = { corretor: ['Fernanda'], origem: ['SANTA', 'DEJOY'] };
    expect(daQuery(paraQuery(f))).toEqual(f);
  });

  it('dimensão vazia não vai para a URL', () => {
    const q = paraQuery({ corretor: [], origem: ['SANTA'] });
    expect(q.get('corretor')).toBeNull();
    expect(q.get('origem')).toBe('SANTA');
  });

  /** Vírgula aparece em nome de cliente: "Silva, Maria" viraria dois filtros. */
  it('separa por barra, não por vírgula', () => {
    const f: Filtros = { cliente: ['Silva, Maria', 'Souza, João'] };
    expect(paraQuery(f).get('cliente')).toBe('Silva, Maria|Souza, João');
    expect(daQuery(paraQuery(f)).cliente).toHaveLength(2);
  });

  it('carrega o período junto, para o link levar a visão inteira', () => {
    const q = paraQuery({ corretor: ['Ana'] }, { mes: '2026-08', tipo: 'lancamento' });
    expect(q.get('mes')).toBe('2026-08');
    expect(q.get('tipo')).toBe('lancamento');
  });

  it('URL suja não vira filtro fantasma', () => {
    expect(daQuery('corretor=&origem=%20%7C%20')).toEqual({});
  });
});

describe('aoClicar', () => {
  it('sem SHIFT, o clique TROCA a escolha da dimensão', () => {
    const f = aoClicar({ corretor: ['Ana'] }, 'corretor', 'Bruno', false);
    expect(f.corretor).toEqual(['Bruno']);
  });

  it('com SHIFT, soma', () => {
    const f = aoClicar({ corretor: ['Ana'] }, 'corretor', 'Bruno', true);
    expect(f.corretor).toEqual(['Ana', 'Bruno']);
  });

  /** É como a pessoa desfaz sem ir procurar o X do chip. */
  it('clicar no único escolhido limpa a dimensão', () => {
    expect(aoClicar({ corretor: ['Ana'] }, 'corretor', 'Ana', false)).toEqual({});
  });

  it('com SHIFT, clicar de novo tira só aquele', () => {
    const f = aoClicar({ corretor: ['Ana', 'Bruno'] }, 'corretor', 'Ana', true);
    expect(f.corretor).toEqual(['Bruno']);
  });

  it('tirar o último com SHIFT limpa a dimensão em vez de deixar lista vazia', () => {
    expect(aoClicar({ corretor: ['Ana'] }, 'corretor', 'Ana', true)).toEqual({});
  });

  /** Filtrar por origem não pode apagar o corretor já escolhido. */
  it('dimensões não se atrapalham', () => {
    const f = aoClicar({ corretor: ['Ana'] }, 'origem', 'SANTA', false);
    expect(f).toEqual({ corretor: ['Ana'], origem: ['SANTA'] });
  });
});

describe('remover e chips', () => {
  const f: Filtros = { corretor: ['Ana', 'Bruno'], origem: ['SANTA'] };

  it('o X tira um valor e mantém o resto', () => {
    expect(remover(f, 'corretor', 'Ana')).toEqual({ corretor: ['Bruno'], origem: ['SANTA'] });
  });

  it('tirar o último de uma dimensão some com ela', () => {
    expect(remover(f, 'origem', 'SANTA').origem).toBeUndefined();
  });

  /** Ordem fixa: chip que dança a cada clique é chip que ninguém acerta. */
  it('os chips saem na ordem das dimensões, sempre', () => {
    expect(chips(f).map((c) => c.rotulo)).toEqual([
      'Corretor: Ana', 'Corretor: Bruno', 'Origem: SANTA',
    ]);
    expect(quantosFiltros(f)).toBe(3);
  });

  it('sabe o que já está selecionado, para pintar a linha', () => {
    expect(estaSelecionado(f, 'corretor', 'Ana')).toBe(true);
    expect(estaSelecionado(f, 'corretor', 'Carla')).toBe(false);
  });
});

describe('nomeSugerido', () => {
  it('descreve o recorte, que é o que se procura no menu depois', () => {
    expect(nomeSugerido({ corretor: ['Ana'] }, 'lancamento')).toBe('Ana · Lançamentos');
  });

  it('sem filtro nenhum, não inventa nome', () => {
    expect(nomeSugerido({}, 'todos')).toBe('Visão sem filtro');
  });
});
