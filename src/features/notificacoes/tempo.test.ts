import { describe, it, expect } from 'vitest';
import { agruparPorDia, rotuloDoDia } from './tempo';

const agora = new Date(2026, 9, 1, 15, 0); // 01/10/2026 15:00, hora local

describe('rotuloDoDia', () => {
  it('pelo dia do calendário, não por 24 h', () => {
    expect(rotuloDoDia(new Date(2026, 9, 1, 0, 5), agora)).toBe('Hoje');
    expect(rotuloDoDia(new Date(2026, 8, 30, 23, 59), agora)).toBe('Ontem');
    expect(rotuloDoDia(new Date(2026, 8, 25, 10, 0), agora)).toBe('Esta semana'); // 6 dias
    expect(rotuloDoDia(new Date(2026, 8, 24, 10, 0), agora)).toBe('Anteriores'); // 7 dias
  });

  it('relógio do servidor adiantado (data no futuro) conta como hoje', () => {
    expect(rotuloDoDia(new Date(2026, 9, 1, 15, 3), agora)).toBe('Hoje');
  });
});

describe('agruparPorDia', () => {
  it('mantém a ordem dos itens e dos grupos, e omite grupo vazio', () => {
    const itens = [
      { id: 'a', createdAt: new Date(2026, 9, 1, 14).toISOString() },
      { id: 'b', createdAt: new Date(2026, 8, 20).toISOString() },
      { id: 'c', createdAt: new Date(2026, 9, 1, 9).toISOString() },
    ];
    expect(agruparPorDia(itens, agora).map((g) => [g.rotulo, g.itens.map((i) => i.id)])).toEqual([
      ['Hoje', ['a', 'c']],
      ['Anteriores', ['b']],
    ]);
  });
});
