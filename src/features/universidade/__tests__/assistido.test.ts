import { describe, expect, it } from 'vitest';
import { comecar, duracaoBR, lerDuracao, lerPosicao, pausar, percentual } from '../assistido';

const tocar = (inicio: number, posicoes: number[]) => posicoes.reduce(lerPosicao, comecar(inicio));

describe('A.7 · quanto foi assistido de verdade', () => {
  it('tocando normal, soma o que passou', () => {
    expect(tocar(0, [0, 1, 2, 3, 4]).total).toBe(4);
  });
  it('em 2×, ainda é assistir', () => {
    expect(tocar(0, [10, 12, 14, 16]).total).toBe(6);
  });
  it('arrastar até o fim não soma o salto', () => {
    expect(tocar(0, [0, 1, 2, 595, 596]).total).toBe(3);
  });
  it('voltar a barra não soma nem desconta', () => {
    expect(tocar(0, [100, 101, 20, 21]).total).toBe(2);
  });
  it('depois da pausa, a primeira leitura só marca a posição', () => {
    const a = pausar(tocar(30, [0, 1, 2]));
    expect(lerPosicao(lerPosicao(a, 2), 3).total).toBe(33);
  });
  it('percentual com teto de 100', () => {
    expect(percentual(45, 100)).toBe(45);
    expect(percentual(130, 100)).toBe(100);
    expect(percentual(5, 0)).toBe(0);
  });
});

describe('A.7 · duração da aula', () => {
  it('lê mm:ss, h:mm:ss e segundos', () => {
    expect(lerDuracao('4:05')).toBe(245);
    expect(lerDuracao('1:02:03')).toBe(3723);
    expect(lerDuracao('90')).toBe(90);
  });
  it('recusa o que não é duração', () => {
    expect(lerDuracao('4:65')).toBeNull();
    expect(lerDuracao('abc')).toBeNull();
    expect(lerDuracao('0:00')).toBeNull();
  });
  it('escreve de volta', () => {
    expect(duracaoBR(245)).toBe('4:05');
    expect(duracaoBR(3723)).toBe('1:02:03');
  });
});
