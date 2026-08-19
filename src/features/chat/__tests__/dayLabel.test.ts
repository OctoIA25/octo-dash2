import { describe, expect, it } from 'vitest';
import { dayLabel, groupByDay } from '../components/ChatWindow';

describe('dayLabel', () => {
  it('rotula hoje, ontem e datas antigas', () => {
    const now = new Date();
    const ontem = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(dayLabel(now)).toBe('Hoje');
    expect(dayLabel(ontem)).toBe('Ontem');
    expect(dayLabel(new Date('2026-03-05T12:00:00'))).toBe('5 de março de 2026');
  });
});

describe('groupByDay', () => {
  const msg = (id: string, iso: string) =>
    ({ id, wa_timestamp: iso, created_at: iso }) as never;

  it('agrupa mensagens consecutivas do mesmo dia', () => {
    const groups = groupByDay([
      msg('a', '2026-03-05T09:00:00'),
      msg('b', '2026-03-05T22:00:00'),
      msg('c', '2026-03-06T08:00:00'),
    ]);
    expect(groups.map((g) => g.items.map((m) => m.id))).toEqual([['a', 'b'], ['c']]);
  });

  it('devolve lista vazia sem mensagens', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
