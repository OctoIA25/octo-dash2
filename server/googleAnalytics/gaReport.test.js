import { describe, it, expect, vi } from 'vitest';
import { buildBatchRequest, normalizeBatchResponse, fetchGaReport, probeProperty } from './gaReport.js';

const row = (dims, mets) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: mets.map((value) => ({ value: String(value) })),
});

describe('buildBatchRequest', () => {
  it('monta 5 reports com o período pedido', () => {
    const body = buildBatchRequest('7d');
    expect(body.requests).toHaveLength(5);
    expect(body.requests[0].dateRanges).toEqual([{ startDate: '7daysAgo', endDate: 'today' }]);
    expect(body.requests[0].dimensions).toEqual([{ name: 'date' }]);
  });

  it('range desconhecido cai em 28d', () => {
    expect(buildBatchRequest('xx').requests[0].dateRanges[0].startDate).toBe('28daysAgo');
  });
});

describe('normalizeBatchResponse', () => {
  it('converte os 5 reports para o shape do front', () => {
    const out = normalizeBatchResponse({
      reports: [
        { rows: [row(['20260801'], [10, 8, 25, 0.55])] },
        { rows: [row(['google', 'organic'], [7])] },
        { rows: [row(['/imovel/123'], [12])] },
        { rows: [row(['mobile'], [9])] },
        { rows: [row(['Jundiaí'], [5])] },
      ],
    });
    expect(out.timeseries).toEqual([{ date: '2026-08-01', sessions: 10, users: 8, pageviews: 25, engagementRate: 0.55 }]);
    expect(out.sources).toEqual([{ source: 'google', medium: 'organic', sessions: 7 }]);
    expect(out.pages).toEqual([{ path: '/imovel/123', views: 12 }]);
    expect(out.devices).toEqual([{ device: 'mobile', sessions: 9 }]);
    expect(out.cities).toEqual([{ city: 'Jundiaí', sessions: 5 }]);
  });

  it('propriedade sem dados (reports sem rows) vira listas vazias', () => {
    const out = normalizeBatchResponse({ reports: [{}, {}, {}, {}, {}] });
    expect(out.timeseries).toEqual([]);
    expect(out.sources).toEqual([]);
  });
});

describe('fetchGaReport', () => {
  const getAccessToken = vi.fn(async () => 'tok');

  it('POST no batchRunReports da propriedade com Bearer', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ reports: [{}, {}, {}, {}, {}] }) }));
    await fetchGaReport({ propertyId: '123456', range: '7d', getAccessToken, fetchImpl });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123456:batchRunReports');
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('propertyId não-numérico é rejeitado antes de ir à rede', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchGaReport({ propertyId: '123/evil', range: '7d', getAccessToken, fetchImpl }))
      .rejects.toThrow('ga_invalid_property');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('403 vira ga_access_denied', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    await expect(fetchGaReport({ propertyId: '1', range: '7d', getAccessToken, fetchImpl }))
      .rejects.toThrow('ga_access_denied');
  });
});

describe('probeProperty', () => {
  it('runReport mínimo; sucesso retorna true', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await expect(probeProperty({ propertyId: '1', getAccessToken: async () => 't', fetchImpl })).resolves.toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://analyticsdata.googleapis.com/v1beta/properties/1:runReport');
  });
});
