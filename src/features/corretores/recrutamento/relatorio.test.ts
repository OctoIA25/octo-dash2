/**
 * Relatório de recrutamento (P3.8).
 *
 * Os números são os de produção, medidos em 21/09/2026: 5 candidatos, todos com
 * origem "outro" (que é o PADRÃO da coluna), e dois carimbos de etapa que nunca
 * foram preenchidos.
 *
 * O caso que carrega o arquivo: ZERO TEM DOIS SIGNIFICADOS. "Ninguém converteu"
 * e "ninguém anota" viram o mesmo 0, e o segundo lido como o primeiro faz o
 * gestor concluir que o processo trava onde ele só não é registrado.
 */

import { describe, it, expect } from 'vitest';
import {
  avisoDaOrigem, conversao, conversoes, etapasSemRegistro, listaEmPortugues, periodoAntesDoRegistro,
  somaFecha, type EtapaDoFunil,
} from './relatorio';

const etapa = (over: Partial<EtapaDoFunil> = {}): EtapaDoFunil => ({
  ordem: 1, etapa: 'lead', rotulo: 'Candidatura', alcancaram: 10, registrado_sempre: 10, ...over,
});

describe('conversao', () => {
  it('divide e mostra o número cru junto', () => {
    const c = conversao(etapa({ alcancaram: 10 }), etapa({ ordem: 2, alcancaram: 4 }));
    expect(c.pct).toBe(40);
    expect(c.texto).toBe('40% (4 de 10)');
    expect(c.motivo).toBe('ok');
  });

  /**
   * O caso de produção: `ts_qualificado` é 0 de 5. Mostrar "0%" acusaria o
   * processo de travar ali, quando a verdade é que ninguém anota a etapa.
   */
  it('etapa que ninguém anota não vira 0% de conversão', () => {
    const c = conversao(etapa({ alcancaram: 10 }), etapa({ ordem: 2, alcancaram: 0, registrado_sempre: 0 }));
    expect(c.pct).toBeNull();
    expect(c.texto).toBe('etapa não é registrada');
    expect(c.motivo).toBe('sem_registro');
  });

  /** Diferente de: a etapa É anotada, e ninguém converteu mesmo. */
  it('etapa anotada com zero conversão mostra 0% de verdade', () => {
    const c = conversao(etapa({ alcancaram: 10 }), etapa({ ordem: 2, alcancaram: 0, registrado_sempre: 3 }));
    expect(c.pct).toBe(0);
    expect(c.motivo).toBe('ok');
  });

  it('sem ninguém na etapa anterior, não há o que dividir', () => {
    const c = conversao(etapa({ alcancaram: 0 }), etapa({ ordem: 2, alcancaram: 0, registrado_sempre: 5 }));
    expect(c.pct).toBeNull();
    expect(c.motivo).toBe('sem_base');
  });
});

describe('conversoes', () => {
  it('encadeia as etapas na ordem, dois a dois', () => {
    const c = conversoes([
      etapa({ ordem: 2, rotulo: 'Primeiro contato', alcancaram: 6 }),
      etapa({ ordem: 1, rotulo: 'Candidatura', alcancaram: 10 }),
      etapa({ ordem: 3, rotulo: 'Qualificado', alcancaram: 3 }),
    ]);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ de: 'Candidatura', para: 'Primeiro contato' });
    expect(c[0].resultado.pct).toBe(60);
    expect(c[1]).toMatchObject({ de: 'Primeiro contato', para: 'Qualificado' });
    expect(c[1].resultado.pct).toBe(50);
  });

  it('uma etapa só não tem degrau', () => {
    expect(conversoes([etapa()])).toEqual([]);
    expect(conversoes([])).toEqual([]);
  });
});

describe('etapasSemRegistro', () => {
  /** Em produção: primeiro contato e qualificado, 0 de 5 cada. */
  it('aponta as etapas que ninguém anota', () => {
    expect(etapasSemRegistro([
      etapa({ rotulo: 'Candidatura', registrado_sempre: 5 }),
      etapa({ ordem: 2, rotulo: 'Primeiro contato', registrado_sempre: 0 }),
      etapa({ ordem: 3, rotulo: 'Qualificado', registrado_sempre: 0 }),
    ])).toEqual(['Primeiro contato', 'Qualificado']);
  });

  it('tudo anotado não gera aviso', () => {
    expect(etapasSemRegistro([etapa()])).toEqual([]);
  });
});

describe('avisoDaOrigem', () => {
  /**
   * O caso real: 5 de 5 em "outro". Sem o aviso, isso se lê como "todos vieram
   * de outro lugar" — quando significa que ninguém preencheu.
   */
  it('diz que "outro" é o padrão quando ele domina', () => {
    const a = avisoDaOrigem({ origem_no_padrao: 5, total: 5 });
    expect(a).toContain('100%');
    expect(a).toContain('PADRÃO');
    expect(a).toContain('não vem sendo preenchida');
  });

  it('minoria em outro é só uma nota, sem alarde', () => {
    const a = avisoDaOrigem({ origem_no_padrao: 2, total: 10 });
    expect(a).toContain('2 de 10');
    expect(a).not.toContain('não vem sendo preenchida');
  });

  it('ninguém no padrão não precisa de aviso', () => {
    expect(avisoDaOrigem({ origem_no_padrao: 0, total: 10 })).toBeNull();
    expect(avisoDaOrigem({ origem_no_padrao: 0, total: 0 })).toBeNull();
  });
});

describe('somaFecha', () => {
  /** O critério de pronto do plano: a soma por origem bate com o total. */
  it('confere se ninguém sumiu do agrupamento', () => {
    expect(somaFecha([{ candidatos: 3 }, { candidatos: 2 }], 5)).toEqual({ fecha: true, soma: 5 });
    expect(somaFecha([{ candidatos: 3 }], 5)).toEqual({ fecha: false, soma: 3 });
  });

  it('lista vazia com total zero fecha', () => {
    expect(somaFecha([], 0).fecha).toBe(true);
  });
});

describe('periodoAntesDoRegistro', () => {
  it('avisa quando o período pega o que não era registrado', () => {
    expect(periodoAntesDoRegistro('2026-05-01', '2026-09-21')).toBe(true);
    expect(periodoAntesDoRegistro('2026-10-01', '2026-09-21')).toBe(false);
    expect(periodoAntesDoRegistro('2026-09-21', '2026-09-21')).toBe(false);
  });
});

describe('listaEmPortugues', () => {
  /**
   * Visto na tela em 21/09: "Reunião feita e Matrícula e Onboard". Um
   * `join(' e ')` escreve como ninguém escreve, e a frase inteira perde a
   * credibilidade por causa disso.
   */
  it('usa vírgula e um "e" só no fim', () => {
    expect(listaEmPortugues(['Reunião feita', 'Matrícula', 'Onboard']))
      .toBe('Reunião feita, Matrícula e Onboard');
    expect(listaEmPortugues(['Matrícula', 'Onboard'])).toBe('Matrícula e Onboard');
    expect(listaEmPortugues(['Onboard'])).toBe('Onboard');
  });

  it('lista vazia é texto vazio', () => {
    expect(listaEmPortugues([])).toBe('');
    expect(listaEmPortugues(['', 'Onboard'])).toBe('Onboard');
  });
});
