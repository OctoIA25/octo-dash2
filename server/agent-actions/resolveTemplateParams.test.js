import { describe, it, expect } from 'vitest';
import { resolveTemplateParams, validateMapping } from './resolveTemplateParams.js';

const lead = { name: 'João Silva', phone: '5511999990000', assignedAgent: 'Maria Corretora' };

describe('resolveTemplateParams', () => {
  it('resolve lead_field e fixed na ordem posicional', () => {
    const mapping = { 1: { type: 'lead_field', value: 'name' }, 2: { type: 'fixed', value: 'jan/26' }, 3: { type: 'lead_field', value: 'assignedAgent' } };
    expect(resolveTemplateParams(mapping, ['1', '2', '3'], lead)).toEqual(['João Silva', 'jan/26', 'Maria Corretora']);
  });
  it('phone como lead_field', () => {
    expect(resolveTemplateParams({ 1: { type: 'lead_field', value: 'phone' } }, ['1'], lead)).toEqual(['5511999990000']);
  });
  it('entrada ausente → string vazia', () => {
    expect(resolveTemplateParams({ 1: { type: 'lead_field', value: 'name' } }, ['1', '2'], lead)).toEqual(['João Silva', '']);
  });
  it('campo de lead desconhecido → string vazia', () => {
    expect(resolveTemplateParams({ 1: { type: 'lead_field', value: 'cidade' } }, ['1'], lead)).toEqual(['']);
  });
  it('lead sem o valor → string vazia', () => {
    expect(resolveTemplateParams({ 1: { type: 'lead_field', value: 'assignedAgent' } }, ['1'], { name: 'X' })).toEqual(['']);
  });
  it('templateVariables vazio → array vazio', () => {
    expect(resolveTemplateParams({}, [], lead)).toEqual([]);
  });
});

describe('validateMapping', () => {
  it('completo → ok', () => {
    const mapping = { 1: { type: 'lead_field', value: 'name' }, 2: { type: 'fixed', value: 'x' } };
    expect(validateMapping(mapping, ['1', '2'])).toEqual({ ok: true, missing: [] });
  });
  it('faltando entrada → incompleto com missing', () => {
    expect(validateMapping({ 1: { type: 'lead_field', value: 'name' } }, ['1', '2'])).toEqual({ ok: false, missing: ['2'] });
  });
  it('fixed com value vazio → incompleto', () => {
    expect(validateMapping({ 1: { type: 'fixed', value: '   ' } }, ['1'])).toEqual({ ok: false, missing: ['1'] });
  });
  it('lead_field com campo inválido → incompleto', () => {
    expect(validateMapping({ 1: { type: 'lead_field', value: 'cidade' } }, ['1'])).toEqual({ ok: false, missing: ['1'] });
  });
  it('sem variáveis → ok (template de texto fixo nunca trava)', () => {
    expect(validateMapping({}, [])).toEqual({ ok: true, missing: [] });
  });
});
