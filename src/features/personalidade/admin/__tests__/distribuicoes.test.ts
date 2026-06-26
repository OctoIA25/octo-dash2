import { describe, it, expect } from 'vitest';
import { unirCorretores, distMbti } from '../distribuicoes';
import type { DISCStats, EneagramaStats, MBTIStats } from '@/services/testesEstatisticasService';

const disc = {
  corretoresPorTipo: {
    D: [{ id: 1, nome: 'Ana', percentuais: {} }],
    I: [], S: [], C: [{ id: 2, nome: 'Bia', percentuais: {} }],
  },
} as unknown as DISCStats;

const eneagrama = {
  corretoresPorTipo: { 3: [{ id: 1, nome: 'Ana', tipo: '3', percentuais: {} }] },
} as unknown as EneagramaStats;

const mbti = {
  distribuicao: { 'INTJ': { count: 1, percentual: 100 }, 'ENFP': { count: 0, percentual: 0 } },
  corretoresPorTipo: { INTJ: [{ id: 1, nome: 'Ana', tipo: 'INTJ-A', percentuais: {} }] },
} as unknown as MBTIStats;

describe('unirCorretores', () => {
  it('funde os 3 testes por corretor e conta quantos fez', () => {
    const lista = unirCorretores(disc, eneagrama, mbti);
    const ana = lista.find((c) => c.id === 1)!;
    const bia = lista.find((c) => c.id === 2)!;
    expect(ana.totalFeitos).toBe(3);       // DISC + Eneagrama + MBTI
    expect(ana.discTipo).toBe('D');
    expect(ana.mbtiTipo).toBe('INTJ-A');
    expect(ana.chips.length).toBe(3);
    expect(bia.totalFeitos).toBe(1);       // só DISC
  });

  it('ordena por nome', () => {
    const nomes = unirCorretores(disc, null, null).map((c) => c.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
  });
});

describe('distMbti', () => {
  it('mostra só tipos com pessoas, ordenados', () => {
    const { itens } = distMbti(mbti);
    expect(itens.every((i) => i.count > 0)).toBe(true);
    expect(itens[0].chave).toBe('INTJ');
  });
});
