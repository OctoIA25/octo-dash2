import { describe, it, expect } from 'vitest';
import { mergeUnionByPhone } from './segmentUnion.js';

// Linha no formato de saída de mapRow (KENLO_SOURCE/LEADS_SOURCE).
const row = (over = {}) => ({
  id: 'x', name: '', phone: '', assignedAgent: null,
  archivedAt: null, updatedAt: null, source: 'crm', sourceLeadId: null, ...over,
});

describe('mergeUnionByPhone — união deduplicada por telefone', () => {
  it('só leads → retorna as leads', () => {
    const leads = [row({ id: 'l1', phone: '11999990000', source: 'crm' })];
    expect(mergeUnionByPhone(leads, [])).toEqual(leads);
  });

  it('só kenlo → retorna as kenlo', () => {
    const kenlo = [row({ id: 'k1', phone: '11999990000', source: 'kenlo' })];
    expect(mergeUnionByPhone([], kenlo)).toEqual(kenlo);
  });

  it('vazio dos dois → vazio', () => {
    expect(mergeUnionByPhone([], [])).toEqual([]);
  });

  it('mesmo telefone nos dois → 1 linha, a do CRM vence (kenlo descartada)', () => {
    const leads = [row({ id: 'l1', name: 'CRM João', phone: '11999990000', source: 'crm' })];
    const kenlo = [row({ id: 'k1', name: 'Kenlo João', phone: '11999990000', source: 'kenlo' })];
    const out = mergeUnionByPhone(leads, kenlo);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'l1', source: 'crm' });
  });

  it('formatos diferentes que normalizam igual → dedup (DDI 55 + 9º dígito)', () => {
    // leads com DDI: 55 11 99999-0000 ; kenlo sem DDI e sem 9: 11 9999-0000
    const leads = [row({ id: 'l1', phone: '5511999990000', source: 'crm' })];
    const kenlo = [row({ id: 'k1', phone: '1199990000', source: 'kenlo' })];
    const out = mergeUnionByPhone(leads, kenlo);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('crm');
  });

  it('kenlo com telefone novo (não no CRM) → entra na união', () => {
    const leads = [row({ id: 'l1', phone: '11999990000', source: 'crm' })];
    const kenlo = [row({ id: 'k1', phone: '11888880000', source: 'kenlo' })];
    const out = mergeUnionByPhone(leads, kenlo);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.source).sort()).toEqual(['crm', 'kenlo']);
  });

  it('telefone vazio dos dois lados não casa → ambos mantidos', () => {
    const leads = [row({ id: 'l1', phone: '', source: 'crm' })];
    const kenlo = [row({ id: 'k1', phone: '', source: 'kenlo' })];
    expect(mergeUnionByPhone(leads, kenlo)).toHaveLength(2);
  });
});
