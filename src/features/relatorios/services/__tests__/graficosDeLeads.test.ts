/**
 * A média móvel de 7 dias do gráfico "leads por dia" (P1.10).
 *
 * O caso que importa é o primeiro: a linha NÃO pode começar no dia 1. Uma
 * "média de 7 dias" calculada sobre um dia só desenha um pico que não existe,
 * e é o tipo de erro que ninguém percebe olhando o gráfico — só olhando o
 * código.
 */
import { describe, it, expect } from 'vitest';
import { mediaMovel } from '../graficosDeLeadsService';

const serie = (totais: number[]) =>
  totais.map((total, i) => ({ dia: `2026-09-${String(i + 1).padStart(2, '0')}`, total }));

describe('média móvel de 7 dias', () => {
  it('não existe antes do sétimo dia', () => {
    const r = mediaMovel(serie([10, 10, 10, 10, 10, 10]));
    expect(r.every((p) => p.media === null)).toBe(true);
  });

  it('no sétimo dia passa a existir', () => {
    const r = mediaMovel(serie([10, 10, 10, 10, 10, 10, 10]));
    expect(r.slice(0, 6).every((p) => p.media === null)).toBe(true);
    expect(r[6].media).toBe(10);
  });

  it('é a média dos SETE últimos, e acompanha a mudança', () => {
    // 7 dias de zero, depois 7 dias de 7: no último dia a média é 7.
    const r = mediaMovel(serie([0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 7, 7, 7, 7]));
    expect(r[6].media).toBe(0);
    expect(r[13].media).toBe(7);
    // No meio, a janela mistura os dois: 4 zeros e 3 setes = 3.
    expect(r[9].media).toBe(3);
  });

  it('não altera os totais do dia — só acrescenta a média', () => {
    const entrada = serie([3, 1, 4, 1, 5, 9, 2]);
    const r = mediaMovel(entrada);
    expect(r.map((p) => p.total)).toEqual([3, 1, 4, 1, 5, 9, 2]);
    expect(r.map((p) => p.dia)).toEqual(entrada.map((p) => p.dia));
  });

  it('arredonda em uma casa, sem virar dízima na tela', () => {
    const r = mediaMovel(serie([1, 1, 1, 1, 1, 1, 2]));
    expect(r[6].media).toBe(1.1);
  });

  it('série vazia não explode', () => {
    expect(mediaMovel([])).toEqual([]);
  });

  it('janela configurável, para quem quiser 30 dias', () => {
    const r = mediaMovel(serie(Array.from({ length: 30 }, () => 5)), 30);
    expect(r[28].media).toBeNull();
    expect(r[29].media).toBe(5);
  });

  it('total ausente conta como zero, e não como NaN', () => {
    // Um dia sem total vindo do banco não pode apagar a linha inteira.
    const comBuraco = serie([1, 1, 1, 1, 1, 1, 1]).map((p, i) =>
      i === 3 ? ({ ...p, total: undefined as unknown as number }) : p);
    const r = mediaMovel(comBuraco);
    expect(Number.isFinite(r[6].media as number)).toBe(true);
    expect(r[6].media).toBe(0.9);
  });
});
