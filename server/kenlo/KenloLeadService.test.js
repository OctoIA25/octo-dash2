import { describe, it, expect, vi } from 'vitest';
import { createKenloLeadService } from './KenloLeadService.js';

const integration = { tenant_id: 't1' };
const ENV = { KENLO_PER_PAGE: '2' };

describe('KenloLeadService', () => {
  it('fetchAllPages para na página menor que perPage', async () => {
    const apiClient = {
      getJson: vi.fn()
        .mockResolvedValueOnce({ status: 200, body: { data: [{ _id: 'a' }, { _id: 'b' }] } })
        .mockResolvedValueOnce({ status: 200, body: { data: [{ _id: 'c' }] } }),
    };
    const svc = createKenloLeadService({ apiClient, processEnv: ENV });
    const { leads } = await svc.fetchAllPages(integration, { mediaOrigin: 8 });
    expect(leads.map((l) => l._id)).toEqual(['a', 'b', 'c']);
    expect(apiClient.getJson).toHaveBeenCalledTimes(2);
    expect(apiClient.getJson.mock.calls[0][1]).toContain('idMediaOrigin=8');
    expect(apiClient.getJson.mock.calls[0][1]).toContain('perPage=2');
  });

  it('fetchAllPages interrompe em erro HTTP retornando o que tem', async () => {
    const apiClient = {
      getJson: vi.fn()
        .mockResolvedValueOnce({ status: 200, body: { data: [{ _id: 'a' }, { _id: 'b' }] } })
        .mockResolvedValueOnce({ status: 0, body: null }),
    };
    const svc = createKenloLeadService({ apiClient, processEnv: ENV });
    const { leads, status } = await svc.fetchAllPages(integration, { mediaOrigin: 8 });
    expect(leads).toHaveLength(2);
    expect(status).toBe(0);
  });

  it('fetchDetails mescla detalhe e tolera falha por lead', async () => {
    const apiClient = {
      getJson: vi.fn()
        .mockResolvedValueOnce({ status: 200, body: { interest: { reference: 'R1' } } })
        .mockResolvedValueOnce({ status: 500, body: null }),
    };
    const svc = createKenloLeadService({ apiClient, processEnv: ENV });
    const out = await svc.fetchDetails(integration, [{ _id: 'a' }, { _id: 'b' }]);
    expect(out.find((l) => l._id === 'a').interest.reference).toBe('R1');
    expect(out.find((l) => l._id === 'b')).toEqual({ _id: 'b' }); // sem detalhe, intacto
  });
});
