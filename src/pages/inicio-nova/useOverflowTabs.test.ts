import { describe, it, expect } from 'vitest';
import { partitionTabs } from './useOverflowTabs';

interface T {
  id: string;
  w: number;
}

/** Helper: monta o Map de larguras a partir das abas de teste. */
function widthsOf(tabs: T[]): Map<string, number> {
  return new Map(tabs.map((t) => [t.id, t.w]));
}

/** Larguras reais medidas em /relatorios (6 abas). */
const RELATORIOS: T[] = [
  { id: 'marketing', w: 99 },
  { id: 'metricas', w: 151 },
  { id: 'metricas-individuais', w: 154 },
  { id: 'imoveis', w: 85 },
  { id: 'financeiro', w: 101 },
  { id: 'excel', w: 71 },
];

describe('partitionTabs', () => {
  it('mostra todas as abas quando ainda não há medições', () => {
    const { visibleTabs, overflowTabs } = partitionTabs(RELATORIOS, new Map(), 0, 'marketing');
    expect(visibleTabs).toEqual(RELATORIOS);
    expect(overflowTabs).toEqual([]);
  });

  it('cenário 3 abas: tudo cabe, sem overflow', () => {
    const tabs = RELATORIOS.slice(0, 3);
    const { visibleTabs, overflowTabs } = partitionTabs(tabs, widthsOf(tabs), 800, 'marketing');
    expect(visibleTabs).toHaveLength(3);
    expect(overflowTabs).toEqual([]);
  });

  it('cenário desktop largo: tudo cabe', () => {
    const { overflowTabs } = partitionTabs(RELATORIOS, widthsOf(RELATORIOS), 1200, 'marketing');
    expect(overflowTabs).toEqual([]);
  });

  it('desktop médio: parte das abas vai para o overflow', () => {
    const { visibleTabs, overflowTabs } = partitionTabs(RELATORIOS, widthsOf(RELATORIOS), 600, 'marketing');
    expect(visibleTabs.length).toBeGreaterThan(0);
    expect(overflowTabs.length).toBeGreaterThan(0);
    // A soma visível + overflow preserva todas as abas.
    expect(visibleTabs.length + overflowTabs.length).toBe(6);
  });

  it('promove a aba ativa quando ela cairia no overflow', () => {
    // Largura suficiente para ~3 abas; a ativa é a última (excel).
    const { visibleTabs } = partitionTabs(RELATORIOS, widthsOf(RELATORIOS), 600, 'excel');
    expect(visibleTabs.some((t) => t.id === 'excel')).toBe(true);
  });

  it('REGRESSÃO: trilho estreito (tablet) ainda mostra a aba ativa', () => {
    // Cenário real medido: trilho ~116px, ativa = excel (última).
    // Antes do fix, visibleTabs ficava vazio e a ativa sumia.
    const { visibleTabs } = partitionTabs(RELATORIOS, widthsOf(RELATORIOS), 116, 'excel');
    expect(visibleTabs.length).toBeGreaterThanOrEqual(1);
    expect(visibleTabs.some((t) => t.id === 'excel')).toBe(true);
  });

  it('trilho estreito sem aba ativa definida: não quebra', () => {
    const { visibleTabs, overflowTabs } = partitionTabs(RELATORIOS, widthsOf(RELATORIOS), 116, null);
    expect(visibleTabs.length + overflowTabs.length).toBe(6);
  });

  it('cenário 20 abas: degrada para poucas visíveis + resto no overflow', () => {
    const many: T[] = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, w: 100 }));
    const { visibleTabs, overflowTabs } = partitionTabs(many, widthsOf(many), 500, 't0');
    expect(visibleTabs.length).toBeGreaterThan(0);
    expect(visibleTabs.length).toBeLessThan(20);
    expect(visibleTabs.length + overflowTabs.length).toBe(20);
  });
});
