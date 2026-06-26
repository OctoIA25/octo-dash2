import { describe, it, expect, vi } from 'vitest';
import { createBrokerAssigner } from './brokerAssigner.js';

describe('brokerAssigner', () => {
  it('prioriza corretor pelo código do imóvel', async () => {
    const byCode = vi.fn().mockResolvedValue({ id: 'c1', nome: 'Ana' });
    const byName = vi.fn();
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: byCode, findCorretorInSystem: byName });
    const rows = [{ interest_reference: 'IM-1', attended_by_name: 'Outro' }];
    const out = await assigner.assign('t1', rows);
    expect(out[0].attended_by_id).toBe('c1');
    expect(out[0].attended_by_name).toBe('Ana');
    expect(byName).not.toHaveBeenCalled();
  });

  it('cai para attendedBy quando não há corretor por código', async () => {
    const byCode = vi.fn().mockResolvedValue(null);
    const byName = vi.fn().mockResolvedValue({ id: 'c2', nome: 'João', matchType: 'exact' });
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: byCode, findCorretorInSystem: byName });
    const rows = [{ interest_reference: null, attended_by_name: 'João' }];
    const out = await assigner.assign('t1', rows);
    expect(out[0].attended_by_id).toBe('c2');
  });

  it('memoiza lookups por código repetido', async () => {
    const byCode = vi.fn().mockResolvedValue({ id: 'c1', nome: 'Ana' });
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: byCode, findCorretorInSystem: vi.fn() });
    await assigner.assign('t1', [{ interest_reference: 'IM-1' }, { interest_reference: 'IM-1' }]);
    expect(byCode).toHaveBeenCalledTimes(1);
  });
});
