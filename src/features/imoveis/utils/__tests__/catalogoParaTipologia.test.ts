import { describe, expect, it } from 'vitest';
import {
  codigosDaCelula, menorDaFaixa, montarTipologia, nomeDaTipologia, precoBRL, vazio,
} from '../catalogoParaTipologia';

/**
 * Todos os valores abaixo foram COPIADOS da planilha real em 23/09/2026 — não
 * inventados. Foi escrever o parser de imaginação que produziu o bug do
 * catálogo; aqui os casos saem do dado.
 */

describe('vazio — "-" é "não informado", não um valor', () => {
  it('reconhece as formas de vazio que a planilha usa', () => {
    // `-` aparece 7x em valor, 11x em vagas, 11x em dormitórios, 13x em suítes.
    for (const v of ['-', '–', '—', '', '   ', undefined, null]) expect(vazio(v)).toBe(true);
    for (const v of ['0', '1', 'sem suíte', 'R$ 1,00']) expect(vazio(v)).toBe(false);
  });
});

describe('menorDaFaixa', () => {
  it('faixa numérica vira o MENOR — é o que dá para afirmar', () => {
    expect(menorDaFaixa('2-3')).toBe(2);
    expect(menorDaFaixa('3-4')).toBe(3);
    expect(menorDaFaixa('1-3')).toBe(1);
    expect(menorDaFaixa('2-4')).toBe(2);
    expect(menorDaFaixa('2- 3 dormitórios')).toBe(2);
    expect(menorDaFaixa('3 - 4 cobertas')).toBe(3);
    expect(menorDaFaixa('coberta 1-2')).toBe(1);
    expect(menorDaFaixa('1-2 podendo ser cobertas')).toBe(1);
  });

  it('número único é ele mesmo', () => {
    expect(menorDaFaixa('1')).toBe(1);
    expect(menorDaFaixa('2')).toBe(2);
    expect(menorDaFaixa('3 vagas')).toBe(3);
    expect(menorDaFaixa('1 coberta')).toBe(1);
  });

  it('"sem suíte" é ZERO — afirmar que não tem é diferente de não saber', () => {
    expect(menorDaFaixa('sem suíte')).toBe(0);
    expect(menorDaFaixa('sem vaga')).toBe(0);
  });

  it('"ATÉ N" é NULO, nunca N', () => {
    // "até 4 suítes" quer dizer que existem plantas com menos. Chutar 4 diria
    // ao cliente que toda unidade tem quatro suítes.
    expect(menorDaFaixa('até 3')).toBeNull();
    expect(menorDaFaixa('até 4 suítes')).toBeNull();
    expect(menorDaFaixa('até 1 suíte')).toBeNull();
    expect(menorDaFaixa('até 3 suítes depende da planta')).toBeNull();
    expect(menorDaFaixa('até duas')).toBeNull();
  });

  it('texto sem número é NULO, e não zero', () => {
    expect(menorDaFaixa('sim cobertas')).toBeNull();
    expect(menorDaFaixa('cobertas')).toBeNull();
    expect(menorDaFaixa('varia com a metragem')).toBeNull();
    expect(menorDaFaixa('sim (varia de acordo com a metragem)')).toBeNull();
    expect(menorDaFaixa('-')).toBeNull();
  });

  it('O 21 VAGAS vira NULO — e não derruba a linha inteira', () => {
    // Existe uma vez na planilha (Vigóre) e é quase certamente erro de
    // digitação. O banco recusa acima de 20; na primeira versão isso fazia o
    // insert falhar e o Vigóre perdia preço e dormitórios junto.
    //
    // Também não corrijo para 2: adivinhar é pior que dizer que não se sabe.
    expect(menorDaFaixa('21')).toBeNull();
    expect(menorDaFaixa('20')).toBe(20);
    expect(menorDaFaixa('100')).toBeNull();
  });

  it('"3 e 4 suítes" na coluna de dormitórios devolve 3', () => {
    // Dado trocado de coluna na planilha. O menor continua sendo o que dá para
    // afirmar, e o texto cru fica na observação.
    expect(menorDaFaixa('3 e 4 suítes')).toBe(3);
  });
});

describe('precoBRL', () => {
  it('lê o formato brasileiro', () => {
    expect(precoBRL('R$ 974.653,85')).toBe(974653.85);
    expect(precoBRL('R$ 1.100.000,00')).toBe(1100000);
    expect(precoBRL('R$ 281.295,00')).toBe(281295);
    expect(precoBRL('R$ 525.000,00')).toBe(525000);
  });

  it('"Médio-alto" NÃO vira número', () => {
    // Aparece 4x na coluna de valor. Virar zero poria "a partir de R$ 0,00" na
    // boca da LIA.
    expect(precoBRL('Médio-alto')).toBeNull();
    expect(precoBRL('-')).toBeNull();
    expect(precoBRL('a consultar')).toBeNull();
    expect(precoBRL('')).toBeNull();
  });

  it('número solto não vira preço — "Fase 2" não pode virar R$ 2,00', () => {
    // O regex aceita qualquer dígito; sem o piso, uma célula com "Fase 2" ou
    // "Torre 3" viraria preço de imóvel na boca da LIA. O mais barato da
    // planilha real é R$ 281.295.
    expect(precoBRL('Fase 2')).toBeNull();
    expect(precoBRL('Torre 3')).toBeNull();
    expect(precoBRL('R$ 0,00')).toBeNull();
    expect(precoBRL('R$ 999,00')).toBeNull();
    expect(precoBRL('R$ 1.000,00')).toBe(1000);
  });
});

describe('codigosDaCelula', () => {
  it('separa a célula com vários códigos', () => {
    // "L012; L023; L025; L028; L029" — Reserva Castanheira, 5 anúncios.
    expect(codigosDaCelula('L012; L023; L025; L028; L029'))
      .toEqual(['L012', 'L023', 'L025', 'L028', 'L029']);
  });

  it('um código só, e vazio', () => {
    expect(codigosDaCelula('L005')).toEqual(['L005']);
    expect(codigosDaCelula(' l027 ')).toEqual(['L027']);
    expect(codigosDaCelula('-')).toEqual([]);
    expect(codigosDaCelula('')).toEqual([]);
  });

  it('descarta o que não é código', () => {
    expect(codigosDaCelula('a definir; L005')).toEqual(['L005']);
    expect(codigosDaCelula('sem código')).toEqual([]);
  });
});

describe('nomeDaTipologia', () => {
  it('sai dos dormitórios, que é o que o corretor reconhece', () => {
    expect(nomeDaTipologia({ empreendimento: 'X', dormitorios: '2-3' })).toBe('2-3 dorms (conforme catálogo)');
    expect(nomeDaTipologia({ empreendimento: 'X', dormitorios: '2- 3 dormitórios' })).toBe('2- 3 dorms (conforme catálogo)');
  });

  it('sem dormitórios, diz de onde veio em vez de inventar', () => {
    expect(nomeDaTipologia({ empreendimento: 'X', dormitorios: '-' })).toBe('Conforme catálogo');
    expect(nomeDaTipologia({ empreendimento: 'X' })).toBe('Conforme catálogo');
  });
});

describe('montarTipologia — a linha inteira', () => {
  /**
   * COMPOSIÇÃO, e o comentário diz isso de propósito: os valores são todos
   * reais da planilha de 23/09, mas de linhas DIFERENTES — o Terrace tem
   * "3 - 4 cobertas" e "até 4 suítes" e NÃO tem preço; o R$ 974.653,85 é do
   * OASIS. Juntei numa linha só para exercitar os quatro campos de uma vez.
   *
   * Escrevi "copiada da planilha" na primeira versão e era falso. Fixture
   * composto é legítimo; chamá-lo de real, não.
   */
  const terrace = {
    codigo: 'L005', empreendimento: 'Terrace Serra do Japi', tipo: 'APARTAMENTO',
    valor: 'R$ 974.653,85', vagas: '3 - 4 cobertas', dormitorios: '3-4', suites: 'até 4 suítes',
  };

  it('converte o que dá e deixa nulo o que não dá', () => {
    const t = montarTipologia(terrace);
    expect(t.dormitorios).toBe(3);
    expect(t.vagas).toBe(3);
    expect(t.suites).toBeNull();           // "até 4" não diz o mínimo
    expect(t.preco_a_partir).toBe(974653.85);
  });

  it('A DATA DO PREÇO É SEMPRE NULA — a planilha não sabe quando o preço mudou', () => {
    // A coluna "Atualizado em (auto)" marca a última edição da LINHA, não do
    // preço. Nula, a regra do aviso põe "sujeito a confirmação com o corretor".
    expect(montarTipologia(terrace).preco_atualizado_em).toBeNull();
  });

  it('o texto cru fica inteiro na observação — nada se perde', () => {
    const o = montarTipologia(terrace).observacao;
    expect(o).toContain('até 4 suítes');
    expect(o).toContain('3 - 4 cobertas');
    expect(o).toContain('sem metragem');
    expect(o).toContain('ainda precisam virar tipologias separadas');
  });

  it('linha sem nada diz isso, em vez de fingir que há dado', () => {
    const t = montarTipologia({ empreendimento: 'Vazio', dormitorios: '-', suites: '-', vagas: '-', valor: '-' });
    expect(t.dormitorios).toBeNull();
    expect(t.preco_a_partir).toBeNull();
    expect(t.nome).toBe('Conforme catálogo');
    expect(t.observacao).toContain('não traz dormitórios');
  });
});
