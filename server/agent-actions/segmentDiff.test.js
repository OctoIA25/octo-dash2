import { describe, it, expect } from 'vitest';
import { diffPublics } from './segmentDiff.js';

const k = (id, phone, sourceLeadId = null) => ({ id, name: 'X', phone, source: 'kenlo', sourceLeadId });
const c = (id, phone, sourceLeadId = null) => ({ id, name: 'X', phone, source: 'crm', sourceLeadId });

describe('diffPublics', () => {
  it('casa por source_lead_id (chave forte), mesmo com telefones diferentes', () => {
    const d = diffPublics([k('K1', '11999990000')], [c('C1', '11000000000', 'K1')]);
    expect(d.inBoth).toBe(1);
    expect(d.matchedBy.sourceLeadId).toBe(1);
    expect(d.onlyInPrimary).toBe(0);
    expect(d.onlyInSecondary).toBe(0);
  });

  it('casa por telefone quando não há id de origem (formatos diferentes)', () => {
    const d = diffPublics([k('K1', '5511999990000')], [c('C1', '(11) 99999-0000')]);
    expect(d.inBoth).toBe(1);
    expect(d.matchedBy.phone).toBe(1);
    expect(d.matchedBy.sourceLeadId).toBe(0);
  });

  it('classifica only-in-primary e only-in-secondary; mascara telefone na amostra', () => {
    const d = diffPublics([k('K1', '11111111111')], [c('C1', '22222222222')]);
    expect(d.onlyInPrimary).toBe(1);
    expect(d.onlyInSecondary).toBe(1);
    expect(d.inBoth).toBe(0);
    expect(d.onlyInPrimarySample[0].phone).toMatch(/\*/);            // mascarado
    expect(d.onlyInPrimarySample[0].phone).not.toContain('1111111'); // não vaza
  });

  it('telefone vazio não casa por telefone', () => {
    const d = diffPublics([k('K1', '')], [c('C1', '')]);
    expect(d.inBoth).toBe(0);
    expect(d.onlyInPrimary).toBe(1);
    expect(d.onlyInSecondary).toBe(1);
  });

  it('um secondary não casa com dois primaries (match consumido)', () => {
    // dois primaries com o MESMO telefone, um só secondary com esse telefone
    const d = diffPublics([k('K1', '11999990000'), k('K2', '11999990000')], [c('C1', '11999990000')]);
    expect(d.inBoth).toBe(1);        // só um primary casa
    expect(d.onlyInPrimary).toBe(1); // o outro fica sozinho
    expect(d.onlyInSecondary).toBe(0);
  });

  it('respeita sampleSize', () => {
    const prims = Array.from({ length: 10 }, (_, i) => k(`K${i}`, `1199999${String(i).padStart(4, '0')}`));
    const d = diffPublics(prims, [], { sampleSize: 3 });
    expect(d.onlyInPrimary).toBe(10);
    expect(d.onlyInPrimarySample).toHaveLength(3);
  });

  it('contagens base', () => {
    const d = diffPublics([k('K1', '11999990000')], [c('C1', '11999990000'), c('C2', '22222222222')]);
    expect(d.primaryCount).toBe(1);
    expect(d.secondaryCount).toBe(2);
    expect(d.inBoth).toBe(1);
    expect(d.onlyInSecondary).toBe(1);
  });
});
