/**
 * Relatório de anúncios (P3.6).
 *
 * Os números dos casos são os de produção, medidos em 21/09/2026: 5.303 leads,
 * dos quais 13 chegaram a Visita agendada, 5 a Proposta enviada e 4 a Proposta
 * assinada. São essas taxas de 0,2% que explicam por que uma porcentagem nunca
 * aparece sozinha nesta tela.
 */

import { describe, it, expect } from 'vitest';
import {
  consumoDaVerba, corDaTaxa, leituraDoSaldo, semaforo, taxa, valeOlharToques,
} from './anuncios';

describe('taxa', () => {
  /**
   * A regra que atravessa o item: sozinha, "0,2%" faz o gestor comparar
   * corretores por ruído. Com "(13 de 5.303)" ao lado, ele vê na hora que a
   * coluna está medindo o preenchimento do funil, não desempenho de gente.
   */
  it('nunca mostra a porcentagem sozinha', () => {
    expect(taxa(13, 5303).texto).toBe('0,2% (13 de 5.303)');
    expect(taxa(4, 5303).texto).toBe('0,1% (4 de 5.303)');
  });

  it('uma casa decimal basta, com vírgula', () => {
    expect(taxa(1718, 5303).texto).toBe('32,4% (1.718 de 5.303)');
    expect(taxa(1, 2).pct).toBe(50);
  });

  /** Sem denominador não há taxa — e zero não é resposta. */
  it('sem total é ausente, não zero', () => {
    expect(taxa(0, 0)).toEqual({ pct: null, texto: '—' });
    expect(taxa(5, -1).pct).toBeNull();
  });

  it('nenhum e todos', () => {
    expect(taxa(0, 100).texto).toBe('0% (0 de 100)');
    expect(taxa(100, 100).texto).toBe('100% (100 de 100)');
  });
});

describe('corDaTaxa', () => {
  it('pinta por faixa', () => {
    expect(corDaTaxa(taxa(80, 100))).toBe('boa');
    expect(corDaTaxa(taxa(40, 100))).toBe('media');
    expect(corDaTaxa(taxa(10, 100))).toBe('ruim');
  });

  /**
   * Quem não recebeu lead nenhum não é ruim — é ausente. Pintar de vermelho
   * acusaria a pessoa pelo que não fez porque não lhe deram o que fazer.
   */
  it('sem denominador fica sem cor', () => {
    expect(corDaTaxa(taxa(0, 0))).toBe('sem');
  });

  it('a faixa é ajustável', () => {
    expect(corDaTaxa(taxa(35, 100), 30, 15)).toBe('boa');
  });
});

describe('semaforo', () => {
  /** Sem alvo, não pinta: recomendar desligar campanha por um número que ninguém escolheu é pior que não recomendar. */
  it('sem alvo cadastrado, não pinta nem opina', () => {
    const s = semaforo(45, null, null);
    expect(s.cor).toBe('sem');
    expect(s.texto).toContain('não cadastrado');
  });

  it('sem qualificado ainda, também não pinta', () => {
    expect(semaforo(null, 50, 80).cor).toBe('sem');
  });

  it('dentro do alvo é verde', () => {
    expect(semaforo(45, 50, 80).cor).toBe('boa');
    expect(semaforo(50, 50, 80).cor).toBe('boa');
  });

  it('entre o alvo e o limite é amarelo', () => {
    expect(semaforo(60, 50, 80).cor).toBe('media');
    expect(semaforo(80, 50, 80).cor).toBe('media');
  });

  it('acima do limite é vermelho', () => {
    expect(semaforo(81, 50, 80).cor).toBe('ruim');
  });

  /** Sem limite cadastrado, meio alvo a mais é o teto — e o texto diz qual usou. */
  it('sem limite, usa 50% acima do alvo e diz', () => {
    expect(semaforo(70, 50, null).cor).toBe('media');
    expect(semaforo(76, 50, null).cor).toBe('ruim');
    expect(semaforo(76, 50, null).texto).toContain('75');
  });
});

describe('consumoDaVerba', () => {
  it('diz quanto já foi', () => {
    expect(consumoDaVerba(5000, 2500)).toMatchObject({ pct: 50, larguraDaBarra: 50, estado: 'boa' });
  });

  it('perto do fim vira atenção', () => {
    expect(consumoDaVerba(5000, 4600).estado).toBe('media');
  });

  /**
   * Estourar não é erro a esconder: é o fato que muda decisão. A barra para em
   * 100% para não vazar do bloco, e o texto diz o quanto passou.
   */
  it('estouro aparece em letra, e a barra para em 100%', () => {
    const c = consumoDaVerba(5000, 6000);
    expect(c).toMatchObject({ pct: 120, larguraDaBarra: 100, estado: 'ruim' });
    expect(c.texto).toBe('estourou em 20%');
  });

  it('sem verba planejada não há consumo a calcular', () => {
    expect(consumoDaVerba(0, 3000).pct).toBeNull();
    expect(consumoDaVerba(0, 3000).texto).toBe('sem verba planejada');
  });
});

describe('leituraDoSaldo', () => {
  /** O número sozinho não muda decisão de verba; a frase muda. */
  it('traduz o saldo em palavras', () => {
    expect(leituraDoSaldo({ origem: 'Instagram', leads: 3, primeiro_toque: 3, ultimo_toque: 2, saldo: 1 }))
      .toContain('traz 1 cliente(s) a mais');
    expect(leituraDoSaldo({ origem: 'ZAP', leads: 1, primeiro_toque: 0, ultimo_toque: 1, saldo: -1 }))
      .toContain('reencontra 1 cliente(s)');
  });

  it('empate não merece frase', () => {
    expect(leituraDoSaldo({ origem: 'Site', leads: 2, primeiro_toque: 1, ultimo_toque: 1, saldo: 0 })).toBeNull();
  });
});

describe('valeOlharToques', () => {
  /** Em produção: 594 clientes trocaram de origem. Vale muito. */
  it('vale quando alguém trocou de origem', () => {
    expect(valeOlharToques({ clientes_repetidos: 725, trocaram_de_origem: 594 })).toBe(true);
  });

  it('cliente que voltou pela MESMA origem não muda atribuição nenhuma', () => {
    expect(valeOlharToques({ clientes_repetidos: 10, trocaram_de_origem: 0 })).toBe(false);
  });
});
