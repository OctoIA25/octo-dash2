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

  it('cache persiste entre chamadas de assign do MESMO tenant (streaming por página)', async () => {
    const byCode = vi.fn().mockResolvedValue({ id: 'c1', nome: 'Ana' });
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: byCode, findCorretorInSystem: vi.fn() });
    // duas "páginas" com o mesmo código → só 1 lookup ao todo
    await assigner.assign('t1', [{ interest_reference: 'IM-1' }]);
    await assigner.assign('t1', [{ interest_reference: 'IM-1' }]);
    expect(byCode).toHaveBeenCalledTimes(1);
  });

  it('reset() limpa o cache entre tenants (evita vazamento)', async () => {
    const byCode = vi.fn().mockResolvedValue({ id: 'c1', nome: 'Ana' });
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: byCode, findCorretorInSystem: vi.fn() });
    await assigner.assign('t1', [{ interest_reference: 'IM-1' }]);
    assigner.reset();
    await assigner.assign('t2', [{ interest_reference: 'IM-1' }]);
    expect(byCode).toHaveBeenCalledTimes(2); // cache limpo → novo lookup
  });

  // O engine roda os tenants em PARALELO (crmSync/engine.js: Promise.allSettled sobre
  // runTenantCycle) com UMA instância de assigner (kenloScheduler). Sem tenant na chave,
  // o código de imóvel de um tenant devolve o corretor de outro.
  it('NÃO vaza corretor entre tenants quando a chave do cache colide', async () => {
    const byCode = vi.fn(async (tenantId) => ({ id: `broker-${tenantId}`, nome: `Corretor ${tenantId}` }));
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: byCode, findCorretorInSystem: vi.fn() });

    // Mesmo código de imóvel ("AP100") existe nos dois tenants — colisão realista.
    await assigner.assign('tenant-A', [{ interest_reference: 'AP100' }]);
    const [leadB] = await assigner.assign('tenant-B', [{ interest_reference: 'AP100' }]);

    expect(leadB.attended_by_id).toBe('broker-tenant-B');
  });

  it('NÃO vaza corretor por nome entre tenants', async () => {
    const byName = vi.fn(async (tenantId) => ({ id: `user-${tenantId}`, nome: 'João Silva' }));
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: vi.fn().mockResolvedValue(null), findCorretorInSystem: byName });

    await assigner.assign('tenant-A', [{ attended_by_name: 'João Silva' }]);
    const [leadB] = await assigner.assign('tenant-B', [{ attended_by_name: 'João Silva' }]);

    expect(leadB.attended_by_id).toBe('user-tenant-B');
  });

  it('tenants intercalados (sync concorrente) mantêm cada lead no seu corretor', async () => {
    // Simula o interleaving real: cada lookup cede o event loop, como uma query.
    const byCode = vi.fn(async (tenantId) => {
      await new Promise((r) => setTimeout(r, 0));
      return { id: `broker-${tenantId}`, nome: `Corretor ${tenantId}` };
    });
    const assigner = createBrokerAssigner({ getCorretorByPropertyCode: byCode, findCorretorInSystem: vi.fn() });

    const [a, b] = await Promise.all([
      assigner.assign('tenant-A', [{ interest_reference: 'AP100' }]),
      assigner.assign('tenant-B', [{ interest_reference: 'AP100' }]),
    ]);

    expect(a[0].attended_by_id).toBe('broker-tenant-A');
    expect(b[0].attended_by_id).toBe('broker-tenant-B');
  });
});
