/**
 * De-para entre o nome escrito na planilha e o corretor cadastrado.
 *
 * É aqui que uma importação por nome costuma mentir: na base da Lotus já
 * convivem "Fernanda Souza" e "Fernanda", "André Marcondes" e "Andre",
 * "Flávia", "Flávia Ceolin" e "Flávia e Humberto" (item P0.2 do plano). Regra
 * adotada: casa quando não há dúvida; havendo dúvida, NÃO casa e o nome vai
 * para a lista de não reconhecidos — venda no corretor errado é pior do que
 * venda sem dono.
 */
import { describe, it, expect } from 'vitest';
import { casarCorretores } from './casarCorretores.js';

const MEMBROS = [
  { user_id: 'u1', nome: 'Fernanda Aparecida Souza' },
  { user_id: 'u2', nome: 'Flávia Ceolin' },
  { user_id: 'u3', nome: 'Reginaldo Barbosa' },
  { user_id: 'u4', nome: 'André Marcondes' },
];

const casar = (nomes, membros = MEMBROS) =>
  casarCorretores(nomes.map((nome) => ({ nome })), membros);

describe('casarCorretores', () => {
  it('casa nome igual, ignorando acento, caixa e espaço sobrando', () => {
    const r = casar(['Flavia Ceolin', 'Reginaldo Barbosa ']);

    expect(r.pares.map((p) => p.user_id)).toEqual(['u2', 'u3']);
    expect(r.naoReconhecidos).toEqual([]);
  });

  it('casa por primeiro e último nome quando o cadastro tem nome do meio', () => {
    const r = casar(['Fernanda Souza']);

    expect(r.pares[0]).toMatchObject({ nome: 'Fernanda Souza', user_id: 'u1' });
  });

  it('nome que serve para dois cadastros não casa com nenhum', () => {
    const membros = [
      { user_id: 'u1', nome: 'Fernanda Souza' },
      { user_id: 'u9', nome: 'Fernanda Lima' },
    ];

    const r = casar(['Fernanda'], membros);

    expect(r.pares[0].user_id).toBeNull();
    expect(r.naoReconhecidos).toEqual(['Fernanda']);
  });

  it('nome que não existe no cadastro não some: entra como não reconhecido', () => {
    const r = casar(['Mariana Mamede']);

    expect(r.pares[0]).toMatchObject({ nome: 'Mariana Mamede', user_id: null });
    expect(r.naoReconhecidos).toEqual(['Mariana Mamede']);
  });

  it('cadastro sem nome não atrapalha o casamento', () => {
    const r = casar(['Flavia Ceolin'], [...MEMBROS, { user_id: 'u5', nome: null }]);

    expect(r.pares[0].user_id).toBe('u2');
  });
});
