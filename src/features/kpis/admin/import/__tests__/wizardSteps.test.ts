import { describe, expect, it } from 'vitest';
import { WIZARD_STEPS, nextStep, prevStep, canAdvance } from '../wizardSteps';

describe('passos do wizard (puro)', () => {
  it('navega dentro dos limites', () => {
    expect(WIZARD_STEPS[0]).toBe('upload');
    expect(WIZARD_STEPS).toHaveLength(4); // upload, preview, mapeamento, importacao
    expect(nextStep('upload')).toBe('preview');
    expect(nextStep('importacao')).toBe('importacao'); // não passa do fim
    expect(prevStep('upload')).toBe('upload'); // não passa do início
    expect(prevStep('mapeamento')).toBe('preview');
  });
  it('gate: não avança de upload sem planilha; não importa sem plano', () => {
    expect(canAdvance('upload', { hasTable: false, hasPlan: false })).toBe(false);
    expect(canAdvance('upload', { hasTable: true, hasPlan: false })).toBe(true);
    expect(canAdvance('mapeamento', { hasTable: true, hasPlan: false })).toBe(false);
    expect(canAdvance('mapeamento', { hasTable: true, hasPlan: true })).toBe(true);
  });
});
