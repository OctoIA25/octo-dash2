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
  fetchTelemetryCosts,
  fetchTelemetryEscalations,
  fetchTelemetryQuality,
  fetchTelemetrySummary,
  fetchTelemetryTimeseries,
  submitEvaluation,
  fmtBrl,
  fmtMinutes,
  fmtMs,
  fmtPercent,
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

  it('escalations: endpoint dedicado com tenantId e janela (30d = sem from)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ escalations: { total: 0 } }),
    } as Response);

    await fetchTelemetryEscalations({ tenantId: TENANT, window: '30d' });

    const url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/v1/agent-telemetry/escalations');
    expect(url.searchParams.get('tenantId')).toBe(TENANT);
    expect(url.searchParams.get('from')).toBeNull();
  });

  it('costs: endpoint dedicado com tenantId e janela', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ costs: { total: { cost_brl: null } } }),
    } as Response);

    await fetchTelemetryCosts({ tenantId: TENANT, window: '90d' });

    const url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/v1/agent-telemetry/costs');
    expect(url.searchParams.get('tenantId')).toBe(TENANT);
    expect(Date.parse(url.searchParams.get('from') ?? '')).toBeLessThan(Date.now());
  });

  it('quality: endpoint dedicado com tenantId e agente opcional', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ quality: { not_evaluated: 0 } }),
    } as Response);

    await fetchTelemetryQuality({ tenantId: TENANT, window: '30d' }, 'elaine');

    const url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/v1/agent-telemetry/quality');
    expect(url.searchParams.get('tenantId')).toBe(TENANT);
    expect(url.searchParams.get('agent')).toBe('elaine');
  });

  it('submitEvaluation: POST com verdict; não envia evaluator (o backend usa o JWT)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await submitEvaluation({ tenantId: TENANT, agentSlug: 'elaine', executionId: 'conv-1', verdict: 'incorrect' });

    const [urlArg, init] = fetchSpy.mock.calls[0];
    expect(new URL(String(urlArg), 'http://x').pathname).toBe('/api/v1/agent-telemetry/evaluations');
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(String(init?.body));
    expect(sent.verdict).toBe('incorrect');
    expect(sent.agentSlug).toBe('elaine');
    expect(sent).not.toHaveProperty('evaluator_user_id');
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

  it('fmtMinutes: null é "—"; escala min → h → dias (cauda longa de escalonamento)', () => {
    expect(fmtMinutes(null)).toBe('—');
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(90)).toBe('1,5 h');
    expect(fmtMinutes(2880)).toBe('2 d');
  });

  it('fmtPercent: null é "—" (sem dado); 0 é "0%" (dado real de zero fechamento)', () => {
    expect(fmtPercent(null)).toBe('—');
    expect(fmtPercent(0)).toBe('0%');
    expect(fmtPercent(0.5)).toBe('50%');
  });

  it('fmtBrl: null é "—" (sem câmbio/custo); < R$0,01 não vira zero fingido', () => {
    expect(fmtBrl(null)).toBe('—');
    expect(fmtBrl(0)).toBe('R$ 0,00');
    expect(fmtBrl(0.004)).toBe('< R$ 0,01');
    expect(fmtBrl(1234.5)).toBe('R$ 1.234,50');
  });
});
