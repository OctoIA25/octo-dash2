import { describe, it, expect } from 'vitest';
import { validateRecurrence, computeNextOccurrence } from './recurrence.js';

describe('validateRecurrence', () => {
  it('daily válido', () => { expect(validateRecurrence({ frequency: 'daily', time: '09:00' })).toEqual({ ok: true }); });
  it('weekly válido com day_of_week', () => { expect(validateRecurrence({ frequency: 'weekly', day_of_week: 1, time: '09:00' })).toEqual({ ok: true }); });
  it('weekly sem day_of_week → erro', () => { expect(validateRecurrence({ frequency: 'weekly', time: '09:00' }).ok).toBe(false); });
  it('frequency inválida → erro', () => { expect(validateRecurrence({ frequency: 'monthly', time: '09:00' }).ok).toBe(false); });
  it('time mal-formado → erro', () => { expect(validateRecurrence({ frequency: 'daily', time: '25:00' }).ok).toBe(false); });
  it('time sem :, → erro', () => { expect(validateRecurrence({ frequency: 'daily', time: '0900' }).ok).toBe(false); });
  it('null → erro', () => { expect(validateRecurrence(null).ok).toBe(false); });
  it('day_of_week fora de 0-6 → erro', () => { expect(validateRecurrence({ frequency: 'weekly', day_of_week: 7, time: '09:00' }).ok).toBe(false); });
});

describe('computeNextOccurrence', () => {
  // Referência: quarta-feira 2026-07-08 12:00:00 UTC. getUTCDay(): dom=0..sáb=6. 2026-07-08 é quarta (3).
  const wed1200 = Date.parse('2026-07-08T12:00:00Z');
  it('daily com horário ainda no futuro hoje → hoje', () => {
    expect(computeNextOccurrence({ frequency: 'daily', time: '15:00' }, wed1200)).toBe('2026-07-08T15:00:00.000Z');
  });
  it('daily com horário já passado hoje → amanhã', () => {
    expect(computeNextOccurrence({ frequency: 'daily', time: '09:00' }, wed1200)).toBe('2026-07-09T09:00:00.000Z');
  });
  it('weekly no mesmo dia, horário futuro → hoje', () => {
    // quarta = 3; agora quarta 12:00; alvo quarta 15:00 → hoje
    expect(computeNextOccurrence({ frequency: 'weekly', day_of_week: 3, time: '15:00' }, wed1200)).toBe('2026-07-08T15:00:00.000Z');
  });
  it('weekly no mesmo dia, horário passado → +7 dias', () => {
    expect(computeNextOccurrence({ frequency: 'weekly', day_of_week: 3, time: '09:00' }, wed1200)).toBe('2026-07-15T09:00:00.000Z');
  });
  it('weekly em dia futuro da semana → esse dia', () => {
    // alvo sexta = 5; de quarta → +2 dias = 2026-07-10
    expect(computeNextOccurrence({ frequency: 'weekly', day_of_week: 5, time: '09:00' }, wed1200)).toBe('2026-07-10T09:00:00.000Z');
  });
  it('weekly em dia anterior da semana → próxima semana', () => {
    // alvo segunda = 1; de quarta → +5 dias = 2026-07-13
    expect(computeNextOccurrence({ frequency: 'weekly', day_of_week: 1, time: '09:00' }, wed1200)).toBe('2026-07-13T09:00:00.000Z');
  });
});
