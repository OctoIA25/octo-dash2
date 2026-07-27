import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do supabase client usado pelo authedFetch (sessão com access_token).
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-token' } } })),
      refreshSession: vi.fn(async () => ({ error: null })),
    },
  },
}));

import {
  fetchTelemetrySummary,
  fetchTelemetryTimeseries,
  fmtMs,
  fmtRate,
  fmtTokens,
  fmtUsd,
} from './telemetryDashboardService';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';

describe('telemetryDashboardService — query params e auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('summary: janela 30d é o default do servidor (sem from); filtros entram na query', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { events: 1 } }),
    } as Response);

    await fetchTelemetrySummary({ tenantId: TENANT, window: '30d', agent: 'lia', model: 'gpt-4.1-mini', status: 'error' });

    const url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/v1/agent-telemetry/summary');
    expect(url.searchParams.get('tenantId')).toBe(TENANT);
    expect(url.searchParams.get('agent')).toBe('lia');
    expect(url.searchParams.get('model')).toBe('gpt-4.1-mini');
    expect(url.searchParams.get('status')).toBe('error');
    expect(url.searchParams.get('from')).toBeNull(); // 30d = default do servidor
    expect(url.searchParams.get('window')).toBeNull();
    const init = fetchSpy.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
  });

  it('janela 7d vira from explícito; all vira window=all', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ points: [] }),
    } as Response);

    await fetchTelemetryTimeseries({ tenantId: TENANT, window: '7d' }, 'hour');
    let url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://x');
    expect(url.searchParams.get('bucket')).toBe('hour');
    const from = Date.parse(url.searchParams.get('from') ?? '');
    expect(Date.now() - from).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    expect(Date.now() - from).toBeLessThan(7.1 * 24 * 3600 * 1000);

    await fetchTelemetryTimeseries({ tenantId: TENANT, window: 'all' }, 'day');
    url = new URL(String(fetchSpy.mock.calls[1][0]), 'http://x');
    expect(url.searchParams.get('window')).toBe('all');
    expect(url.searchParams.get('from')).toBeNull();
  });

  it('resposta não-ok vira Error com o código do backend (caminho de erro do React Query)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'not_a_member' }),
    } as Response);

    await expect(fetchTelemetrySummary({ tenantId: TENANT, window: '30d' })).rejects.toThrow('not_a_member');
  });
});

describe('formatação — null é "—", nunca zero fingido', () => {
  it('fmtUsd', () => {
    expect(fmtUsd(null)).toBe('—');
    expect(fmtUsd(0.004)).toBe('< US$ 0,01');
    expect(fmtUsd(1.5)).toBe('US$ 1,50');
  });

  it('fmtTokens', () => {
    expect(fmtTokens(null)).toBe('—');
    expect(fmtTokens(950)).toBe('950');
    expect(fmtTokens(1500)).toBe('1,5k');
    expect(fmtTokens(2_400_000)).toBe('2,4M');
  });

  it('fmtMs', () => {
    expect(fmtMs(null)).toBe('—');
    expect(fmtMs(850)).toBe('850 ms');
    expect(fmtMs(2400)).toBe('2,4 s');
  });

  it('fmtRate com denominador zero é "—"', () => {
    expect(fmtRate(1, 0)).toBe('—');
    expect(fmtRate(1, 4)).toBe('25%');
  });
});
