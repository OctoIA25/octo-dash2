import { describe, it, expect } from 'vitest';
import { localTimeToUtc, utcTimeToLocal, describeRecurrence } from '../recurrence';

describe('localTimeToUtc / utcTimeToLocal (BR UTC-3)', () => {
  it('09:00 local → 12:00 UTC', () => { expect(localTimeToUtc('09:00')).toBe('12:00'); });
  it('23:00 local → 02:00 UTC (vira o dia)', () => { expect(localTimeToUtc('23:00')).toBe('02:00'); });
  it('round-trip', () => { expect(utcTimeToLocal(localTimeToUtc('14:30'))).toBe('14:30'); });
  it('00:00 local → 03:00 UTC', () => { expect(localTimeToUtc('00:00')).toBe('03:00'); });
  it('02:00 UTC → 23:00 local', () => { expect(utcTimeToLocal('02:00')).toBe('23:00'); });
});

describe('describeRecurrence', () => {
  it('daily', () => { expect(describeRecurrence({ frequency: 'daily', time: '12:00' })).toMatch(/Diariamente às 09:00/); });
  it('weekly segunda', () => { expect(describeRecurrence({ frequency: 'weekly', day_of_week: 1, time: '12:00' })).toMatch(/Toda segunda às 09:00/i); });
  it('null → vazio', () => { expect(describeRecurrence(null)).toBe(''); });
});
