import { describe, it, expect } from 'vitest';
import { resolveStartDate } from './dateWindow.js';

const cfg = { syncWindowDays: 60, syncOverlapMin: 5 };
const NOW = Date.parse('2026-06-26T12:00:00.000Z');

describe('resolveStartDate', () => {
  it('BACKFILL usa janela histórica (now - syncWindowDays)', () => {
    const out = resolveStartDate({ syncMode: 'BACKFILL', cfg, now: () => NOW });
    expect(out).toBe('2026-04-27'); // 60 dias antes de 06-26
  });

  it('LIVE usa lastSyncAt menos a margem de overlap', () => {
    const lastSyncAt = '2026-06-26T11:58:00.000Z';
    const out = resolveStartDate({ syncMode: 'LIVE', lastSyncAt, cfg, now: () => NOW });
    expect(out).toBe('2026-06-26'); // 11:58 - 5min = 11:53 mesmo dia
  });

  it('LIVE sem lastSyncAt cai para a janela histórica (defensivo)', () => {
    const out = resolveStartDate({ syncMode: 'LIVE', lastSyncAt: null, cfg, now: () => NOW });
    expect(out).toBe('2026-04-27');
  });
});
