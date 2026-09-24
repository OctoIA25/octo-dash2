/**
 * O marcador vermelho da aba Construtoras.
 *
 * O chefe pediu em 24/09: "manter com um marcador vermelho as que faltarem
 * alguma informação, para que a gente passe preenchendo 1 a 1". A regra decide
 * duas coisas que parecem detalhe e não são:
 *
 *  - o que conta como falta (e o que NÃO conta — a comissão);
 *  - quando o marcador APAGA. Marcador que nunca apaga vira paisagem, e aí
 *    ninguém enxerga os que de fato faltam.
 */
import { describe, it, expect } from 'vitest';
import { oQueFaltaNaConstrutora, digitosDoCnpj } from '../construtorasService';

const completa = {
  razaoSocial: 'Santa Ângela Incorporadora Ltda',
  responsavelNome: 'Fulano',
  responsavelTelefone: '11999990000',
  responsavelEmail: 'fulano@santaangela.com.br',
};
const CNPJ = '12345678000190';

describe('o que falta na construtora', () => {
  it('completa não acende marcador nenhum', () => {
    expect(oQueFaltaNaConstrutora(completa, CNPJ)).toEqual([]);
  });

  it('acusa as três, pelo nome, para quem lê saber o que buscar', () => {
    const falta = oQueFaltaNaConstrutora(
      { razaoSocial: null, responsavelNome: null, responsavelTelefone: null, responsavelEmail: null },
      null,
    );
    expect(falta).toEqual(['CNPJ', 'razão social', 'contato do responsável']);
  });

  /*
   * O caso que decide se o marcador serve. Exigir nome E telefone E e-mail
   * deixaria quase todo cartão vermelho para sempre: em produção, nenhuma das
   * 14 construtoras tem os três. Um dos três basta.
   */
  it('um contato basta — só telefone já apaga o "contato"', () => {
    const so = { razaoSocial: 'X Ltda', responsavelNome: null, responsavelEmail: null };
    expect(oQueFaltaNaConstrutora({ ...so, responsavelTelefone: '1130001000' }, CNPJ)).toEqual([]);
    expect(oQueFaltaNaConstrutora({ ...so, responsavelTelefone: null }, CNPJ))
      .toEqual(['contato do responsável']);
  });

  /*
   * Espaço em branco é o jeito mais fácil de um campo parecer preenchido. Sem
   * este caso, alguém salva " " e o cartão apaga sem ninguém ter preenchido
   * nada — que é pior do que o vermelho, porque some da lista de pendências.
   */
  it('espaço em branco não conta como preenchido', () => {
    const falta = oQueFaltaNaConstrutora(
      { razaoSocial: '   ', responsavelNome: '  ', responsavelTelefone: '', responsavelEmail: null },
      CNPJ,
    );
    expect(falta).toEqual(['razão social', 'contato do responsável']);
  });

  it('CNPJ com máscara conta como preenchido, e string vazia não', () => {
    expect(oQueFaltaNaConstrutora(completa, '12.345.678/0001-90')).toEqual([]);
    expect(oQueFaltaNaConstrutora(completa, '   ')).toEqual(['CNPJ']);
    expect(oQueFaltaNaConstrutora(completa, undefined)).toEqual(['CNPJ']);
  });

  /*
   * A comissão é o campo que MAIS parece dever entrar aqui, e é o único que
   * não pode: o banco não a concede a todo mundo. Se ela contasse, o mesmo
   * cartão apareceria vermelho para o corretor e branco para a diretoria — e
   * "passar preenchendo 1 a 1" viraria conversa sem pé.
   */
  it('a comissão não entra na conta', () => {
    const comComissao = { ...completa, comissaoPadraoPct: null } as never;
    expect(oQueFaltaNaConstrutora(comComissao, CNPJ)).toEqual([]);
  });
});

describe('dígitos do CNPJ', () => {
  it('tira máscara, espaço e lixo', () => {
    expect(digitosDoCnpj('12.345.678/0001-90')).toBe(CNPJ);
    expect(digitosDoCnpj(' 12345678000190 ')).toBe(CNPJ);
    expect(digitosDoCnpj(null)).toBe('');
    expect(digitosDoCnpj('abc')).toBe('');
  });
});
