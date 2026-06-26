import { describe, it, expect } from 'vitest';
import { validateSegment, SEGMENT_TYPES } from './segmentSchema.js';

describe('validateSegment', () => {
  it('aceita archived (sem params)', () => {
    expect(validateSegment({ type: 'archived' })).toEqual({ ok: true, segment: { type: 'archived' } });
  });
  it('normaliza archived_period (days numérico)', () => {
    expect(validateSegment({ type: 'archived_period', days: '30', lixo: 1 })).toEqual({ ok: true, segment: { type: 'archived_period', days: 30 } });
  });
  it('normaliza no_contact', () => {
    expect(validateSegment({ type: 'no_contact', days: 15 })).toEqual({ ok: true, segment: { type: 'no_contact', days: 15 } });
  });
  it('normaliza by_broker (broker string)', () => {
    expect(validateSegment({ type: 'by_broker', broker: 'Maria' })).toEqual({ ok: true, segment: { type: 'by_broker', broker: 'Maria' } });
  });
  it('normaliza interest', () => {
    expect(validateSegment({ type: 'interest', interest: 'apartamento' })).toEqual({ ok: true, segment: { type: 'interest', interest: 'apartamento' } });
  });
  it('normaliza explicit_list (names string[])', () => {
    expect(validateSegment({ type: 'explicit_list', names: ['João', '', 2] })).toEqual({ ok: true, segment: { type: 'explicit_list', names: ['João', '2'] } });
  });
  it('rejeita tipo desconhecido', () => {
    expect(validateSegment({ type: 'nope' })).toEqual({ ok: false, error: 'invalid_segment' });
  });
  it('rejeita ausência de type', () => {
    expect(validateSegment(null)).toEqual({ ok: false, error: 'invalid_segment' });
    expect(validateSegment({})).toEqual({ ok: false, error: 'invalid_segment' });
  });
  it('rejeita archived_period sem days / days inválido', () => {
    expect(validateSegment({ type: 'archived_period' }).ok).toBe(false);
    expect(validateSegment({ type: 'archived_period', days: 'abc' }).ok).toBe(false);
    expect(validateSegment({ type: 'archived_period', days: -1 }).ok).toBe(false);
  });
  it('rejeita archived_period com days 0', () => {
    expect(validateSegment({ type: 'archived_period', days: 0 }).ok).toBe(false);
    expect(validateSegment({ type: 'no_contact', days: 0 }).ok).toBe(false);
  });
  it('aceita days >= 1', () => {
    expect(validateSegment({ type: 'archived_period', days: 1 }).ok).toBe(true);
  });
  it('rejeita by_broker/interest vazios', () => {
    expect(validateSegment({ type: 'by_broker', broker: '   ' }).ok).toBe(false);
    expect(validateSegment({ type: 'interest', interest: '' }).ok).toBe(false);
  });
  it('rejeita explicit_list vazia', () => {
    expect(validateSegment({ type: 'explicit_list', names: [] }).ok).toBe(false);
    expect(validateSegment({ type: 'explicit_list', names: ['', null] }).ok).toBe(false);
  });
  it('SEGMENT_TYPES tem os 6 tipos', () => {
    expect(SEGMENT_TYPES).toEqual(['explicit_list', 'archived', 'archived_period', 'by_broker', 'no_contact', 'interest']);
  });
});
