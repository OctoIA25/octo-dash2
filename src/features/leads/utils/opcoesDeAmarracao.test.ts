import { describe, it, expect } from 'vitest';
import { montarOpcoesDeAmarracao } from './opcoesDeAmarracao';

describe('montarOpcoesDeAmarracao', () => {
  it('imóvel do cadastro aparece pelo código com título ou bairro', () => {
    const opcoes = montarOpcoesDeAmarracao(
      [{ codigo_imovel: 'AP0684', titulo: null, bairro: 'Recanto Quarto Centenário' }],
      [],
    );
    expect(opcoes).toEqual([
      { value: 'AP0684', label: 'AP0684 — Recanto Quarto Centenário', sublabel: 'Imóvel do cadastro' },
    ]);
  });

  // Quem amarra conhece o empreendimento pelo nome, não pelo L0NN.
  it('lançamento com códigos vira uma opção por código, com o nome na frente', () => {
    const opcoes = montarOpcoesDeAmarracao([], [{ nome: 'Reserva Castanheira', codigos: ['L012', 'l023'] }]);
    expect(opcoes.map((o) => [o.value, o.label])).toEqual([
      ['L012', 'Reserva Castanheira — L012'],
      ['L023', 'Reserva Castanheira — L023'],
    ]);
  });

  // Mesmo formato do de-para do Meta ('ALLEGRATO') e o que o servidor aceita.
  it('lançamento sem código é amarrado pelo nome em maiúsculas', () => {
    const opcoes = montarOpcoesDeAmarracao([], [{ nome: ' Anhangabaú Design ', codigos: null }]);
    expect(opcoes).toEqual([
      { value: 'ANHANGABAÚ DESIGN', label: 'Anhangabaú Design', sublabel: 'Lançamento sem código' },
    ]);
  });

  it('ignora imóvel sem código e lançamento sem nome', () => {
    expect(montarOpcoesDeAmarracao(
      [{ codigo_imovel: null, titulo: 'Casa', bairro: null }],
      [{ nome: '', codigos: [] }],
    )).toEqual([]);
  });
});
