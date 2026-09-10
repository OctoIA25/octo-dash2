import { describe, it, expect } from 'vitest';
import { unirCorretores, distMbti, distDisc } from '../distribuicoes';
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

describe('unirCorretores com universo', () => {
  it('não inventa linha para id que ficou fora do universo', () => {
    // Bia (id 2) tem DISC mas não está no universo (ex.: duplicata deduplicada).
    // Antes ela era recriada pelo laço de corretoresPorTipo e a lista mostrava
    // mais gente do que o denominador contava — o card dizia "2 de 1".
    const universo = [{ id: 1, nome: 'Ana', email: 'ana@x.com', foraDaEquipe: false, semCadastro: false }];
    const lista = unirCorretores(disc, null, null, universo);
    expect(lista.map((c) => c.id)).toEqual([1]);
  });
});

describe('destaque "mais comum"', () => {
  const statsDisc = (d: number, i: number, sc: number, c: number) =>
    ({ distribuicao: { D: { count: d }, I: { count: i }, S: { count: sc }, C: { count: c } } }) as unknown as DISCStats;

  it('aponta o tipo quando há vencedor isolado', () => {
    expect(distDisc(statsDisc(3, 1, 0, 0)).destaque).toBe('D');
  });

  it('não destaca nada quando ninguém fez o teste', () => {
    // antes: exibia "Dominância — MAIS COMUM — 0 pessoas · 0%"
    expect(distDisc(statsDisc(0, 0, 0, 0)).destaque).toBeUndefined();
  });

  it('não destaca nada em caso de empate no topo', () => {
    // antes: o empate era resolvido pela ordem D,I,S,C e D levava o selo
    expect(distDisc(statsDisc(2, 2, 1, 0)).destaque).toBeUndefined();
  });
});

describe('distMbti', () => {
  it('mostra só tipos com pessoas, ordenados', () => {
    const { itens } = distMbti(mbti);
    expect(itens.every((i) => i.count > 0)).toBe(true);
    expect(itens[0].chave).toBe('INTJ');
  });
});
