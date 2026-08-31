/**
 * Consulta à GA4 Data API (batchRunReports) e normalização para o shape que a
 * visão "Site" de Relatórios > Marketing consome. 5 reports numa chamada só
 * (limite do batch é 5): série temporal, origens, páginas, dispositivos e
 * cidades. A API devolve strings — convertemos para número aqui, uma vez.
 */
const API_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties';

export const RANGES = { '7d': 7, '28d': 28, '90d': 90 };
const TOP_N = '10';

export function buildBatchRequest(range) {
  const days = RANGES[range] || 28;
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];
  const desc = (metricName) => [{ metric: { metricName }, desc: true }];
  return {
    requests: [
      {
        dateRanges,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'engagementRate' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      },
      { dateRanges, dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }], metrics: [{ name: 'sessions' }], orderBys: desc('sessions'), limit: TOP_N },
      { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: desc('screenPageViews'), limit: TOP_N },
      { dateRanges, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'sessions' }], orderBys: desc('sessions') },
      { dateRanges, dimensions: [{ name: 'city' }], metrics: [{ name: 'sessions' }], orderBys: desc('sessions'), limit: TOP_N },
    ],
  };
}

const dim = (r, i) => r.dimensionValues?.[i]?.value ?? '';
const met = (r, i) => Number(r.metricValues?.[i]?.value ?? 0);
const isoDate = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

export function normalizeBatchResponse(json) {
  const [ts, src, pg, dev, cit] = (json.reports || []).map((r) => r.rows || []);
  return {
    timeseries: (ts || []).map((r) => ({ date: isoDate(dim(r, 0)), sessions: met(r, 0), users: met(r, 1), pageviews: met(r, 2), engagementRate: met(r, 3) })),
    sources: (src || []).map((r) => ({ source: dim(r, 0), medium: dim(r, 1), sessions: met(r, 0) })),
    pages: (pg || []).map((r) => ({ path: dim(r, 0), views: met(r, 0) })),
    devices: (dev || []).map((r) => ({ device: dim(r, 0), sessions: met(r, 0) })),
    cities: (cit || []).map((r) => ({ city: dim(r, 0), sessions: met(r, 0) })),
  };
}

async function callDataApi({ propertyId, method, body, getAccessToken, fetchImpl }) {
  if (!/^\d+$/.test(String(propertyId))) throw new Error('ga_invalid_property');
  const token = await getAccessToken();
  const res = await fetchImpl(`${API_BASE}/${propertyId}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 403) throw new Error('ga_access_denied');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ga_api_error_${res.status}`);
  return json;
}

export async function fetchGaReport({ propertyId, range, getAccessToken, fetchImpl = fetch }) {
  const json = await callDataApi({ propertyId, method: 'batchRunReports', body: buildBatchRequest(range), getAccessToken, fetchImpl });
  return normalizeBatchResponse(json);
}

/** Chamada mínima usada pelo "Testar e salvar": prova que o Leitor foi concedido. */
export async function probeProperty({ propertyId, getAccessToken, fetchImpl = fetch }) {
  await callDataApi({
    propertyId,
    method: 'runReport',
    body: { dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'sessions' }], limit: '1' },
    getAccessToken,
    fetchImpl,
  });
  return true;
}
