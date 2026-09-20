/**
 * Tipologias do empreendimento.
 *
 * O caso que mais importa é a RESERVA. Decidido pelo chefe em 20/09/2026: o
 * lançamento sem tipologia continua mostrando o texto de hoje. Sem isso, no
 * dia em que a tabela subisse, os 59 lançamentos da Lotus ficariam sem
 * dormitório e sem preço num site PÚBLICO — e ninguém descobriria pelo
 * sistema, e sim por um cliente ligando.
 */
import { describe, it, expect } from 'vitest';
import {
  precoAPartirDe, resumoDeDormitorios, resumoDeArea, paraOCard, type Tipologia,
} from '../tipologias';

const t = (over: Partial<Tipologia> = {}): Tipologia => ({ nome: 'T', ...over });

describe('o "a partir de" é o menor preço DISPONÍVEL', () => {
  it('pega o menor entre as disponíveis', () => {
    expect(precoAPartirDe([
      t({ preco_a_partir: 520000 }), t({ preco_a_partir: 389000 }), t({ preco_a_partir: 610000 }),
    ])).toBe(389000);
  });

  it('IGNORA a tipologia esgotada, mesmo sendo a mais barata', () => {
    // Anunciar o preço de uma que acabou é prometer o que não se entrega, e o
    // cliente descobre no plantão.
    expect(precoAPartirDe([
      t({ preco_a_partir: 300000, disponivel: false }),
      t({ preco_a_partir: 450000 }),
    ])).toBe(450000);
  });

  it('sem preço nenhum devolve nulo, e não zero', () => {
    // Zero viraria "a partir de R$ 0" na tela.
    expect(precoAPartirDe([t({}), t({ preco_a_partir: null })])).toBeNull();
    expect(precoAPartirDe([])).toBeNull();
  });

  it('preço zero ou negativo não conta como preço', () => {
    expect(precoAPartirDe([t({ preco_a_partir: 0 }), t({ preco_a_partir: -1 })])).toBeNull();
  });
});

describe('o resumo de dormitórios', () => {
  it('uma tipologia', () => {
    expect(resumoDeDormitorios([t({ dormitorios: 2 })])).toBe('2 dorms');
    expect(resumoDeDormitorios([t({ dormitorios: 1 })])).toBe('1 dorm');
  });

  it('duas viram "2 e 3 dorms"', () => {
    expect(resumoDeDormitorios([t({ dormitorios: 3 }), t({ dormitorios: 2 })])).toBe('2 e 3 dorms');
  });

  it('três ou mais viram "1, 2 e 3 dorms"', () => {
    expect(resumoDeDormitorios([
      t({ dormitorios: 3 }), t({ dormitorios: 1 }), t({ dormitorios: 2 }),
    ])).toBe('1, 2 e 3 dorms');
  });

  it('repetido não aparece duas vezes', () => {
    expect(resumoDeDormitorios([t({ dormitorios: 2 }), t({ dormitorios: 2 })])).toBe('2 dorms');
  });

  it('LOTE não tem dormitório, e o resumo não inventa um', () => {
    // São 10 dos 59 lançamentos da Lotus.
    expect(resumoDeDormitorios([t({ nome: 'Lote 250 m²', area_privativa_m2: 250 })])).toBeNull();
  });
});

describe('o resumo de área', () => {
  it('uma área só', () => {
    expect(resumoDeArea([t({ area_privativa_m2: 64 })])).toBe('64 m²');
  });

  it('faixa entre a menor e a maior', () => {
    expect(resumoDeArea([
      t({ area_privativa_m2: 92 }), t({ area_privativa_m2: 64 }), t({ area_privativa_m2: 78 }),
    ])).toBe('64 a 92 m²');
  });

  it('vírgula decimal, como se escreve em português', () => {
    expect(resumoDeArea([t({ area_privativa_m2: 64.5 })])).toBe('64,5 m²');
  });
});

describe('A RESERVA: o texto de hoje vale até haver tipologia', () => {
  const texto = { dormitorios: '2 e 3 dorms', preco_num: 389000, preco_texto: '' };

  it('sem tipologia, mostra o texto que o site já mostra', () => {
    const r = paraOCard([], texto);
    expect(r.origem).toBe('texto');
    expect(r.dormitorios).toBe('2 e 3 dorms');
    expect(r.preco).toBe('a partir de R$ 389 mil');
  });

  it('com tipologia, passa a vir dela', () => {
    const r = paraOCard([t({ dormitorios: 2, area_privativa_m2: 64, preco_a_partir: 410000 })], texto);
    expect(r.origem).toBe('tipologias');
    expect(r.dormitorios).toBe('2 dorms');
    expect(r.preco).toBe('a partir de R$ 410 mil');
    expect(r.area).toBe('64 m²');
  });

  it('tipologia SEM número aproveitável cai na reserva, e não em card vazio', () => {
    // Cadastrar o nome e esquecer os números não pode apagar o que o site já
    // mostrava.
    const r = paraOCard([t({ nome: 'A definir' })], texto);
    expect(r.origem).toBe('texto');
    expect(r.dormitorios).toBe('2 e 3 dorms');
  });

  it('preço em texto livre vence o número, porque foi alguém que escreveu', () => {
    const r = paraOCard([], { ...texto, preco_texto: 'sob consulta' });
    expect(r.preco).toBe('sob consulta');
  });

  it('sem tipologia e sem texto, diz que não tem — e não inventa', () => {
    const r = paraOCard([], {});
    expect(r).toEqual({ dormitorios: null, preco: null, area: null, origem: 'nada' });
  });

  it('a reserva é POR LANÇAMENTO, não global', () => {
    // Quem já cadastrou vê o dado novo; quem não cadastrou continua vendo o
    // que via. A migração acontece empreendimento a empreendimento.
    expect(paraOCard([t({ dormitorios: 3, preco_a_partir: 700000 })], texto).origem).toBe('tipologias');
    expect(paraOCard([], texto).origem).toBe('texto');
  });
});

describe('milhão vira "mi", e não um número de sete dígitos', () => {
  it.each([
    [389000, 'a partir de R$ 389 mil'],
    [1000000, 'a partir de R$ 1 mi'],
    [1250000, 'a partir de R$ 1,3 mi'],
  ] as Array<[number, string]>)('%i', (valor, esperado) => {
    expect(paraOCard([t({ dormitorios: 2, preco_a_partir: valor })], {}).preco).toBe(esperado);
  });
});
