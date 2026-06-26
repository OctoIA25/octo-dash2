import { describe, it, expect } from 'vitest';
import { localTimeToUtc, utcTimeToLocal, describeRecurrence, localDayTimeToUtc, utcDayTimeToLocal } from '../recurrence';

describe('localTimeToUtc / utcTimeToLocal (BR UTC-3)', () => {
  it('09:00 local → 12:00 UTC', () => { expect(localTimeToUtc('09:00')).toBe('12:00'); });
  it('23:00 local → 02:00 UTC (vira o dia)', () => { expect(localTimeToUtc('23:00')).toBe('02:00'); });
  it('round-trip', () => { expect(utcTimeToLocal(localTimeToUtc('14:30'))).toBe('14:30'); });
  it('00:00 local → 03:00 UTC', () => { expect(localTimeToUtc('00:00')).toBe('03:00'); });
  it('02:00 UTC → 23:00 local', () => { expect(utcTimeToLocal('02:00')).toBe('23:00'); });
});

describe('localDayTimeToUtc / utcDayTimeToLocal', () => {
  it('domingo 23:00 local → segunda 02:00 UTC (cruza meia-noite)', () => {
    expect(localDayTimeToUtc(0, '23:00')).toEqual({ day_of_week: 1, time: '02:00' });
  });
  it('quarta 09:00 local → quarta 12:00 UTC (sem cruzar)', () => {
    expect(localDayTimeToUtc(3, '09:00')).toEqual({ day_of_week: 3, time: '12:00' });
  });
  it('round-trip', () => {
    const utc = localDayTimeToUtc(0, '23:00');
    expect(utcDayTimeToLocal(utc.day_of_week, utc.time)).toEqual({ day_of_week: 0, time: '23:00' });
  });
});

describe('describeRecurrence', () => {
  it('daily', () => { expect(describeRecurrence({ frequency: 'daily', time: '12:00' })).toMatch(/Diariamente às 09:00/); });
  it('weekly segunda', () => { expect(describeRecurrence({ frequency: 'weekly', day_of_week: 1, time: '12:00' })).toMatch(/Toda segunda às 09:00/i); });
  it('null → vazio', () => { expect(describeRecurrence(null)).toBe(''); });
});
