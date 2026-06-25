import { describe, it, expect } from 'vitest';
import { describeSegment } from '../describeSegment';

describe('describeSegment', () => {
  it('archived', () => { expect(describeSegment({ type: 'archived' })).toMatch(/arquivados/i); });
  it('archived_period', () => { expect(describeSegment({ type: 'archived_period', days: 30 })).toMatch(/30 dias/i); });
  it('no_contact', () => { expect(describeSegment({ type: 'no_contact', days: 15 })).toMatch(/15 dias/i); });
  it('by_broker', () => { expect(describeSegment({ type: 'by_broker', broker: 'Maria' })).toMatch(/Maria/); });
  it('interest', () => { expect(describeSegment({ type: 'interest', interest: 'apartamento' })).toMatch(/apartamento/i); });
  it('explicit_list', () => { expect(describeSegment({ type: 'explicit_list', names: ['João', 'Ana'] })).toMatch(/João/); });
});
