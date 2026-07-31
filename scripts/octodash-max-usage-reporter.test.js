import { describe, it, expect, vi } from 'vitest';
import reporter from './octodash-max-usage-reporter.cjs';
const { parseGetUsageLines, parseUsageText, postReport } = reporter;

// Fixture aproximando a resposta REAL capturada na verificação (CLI 2.1.215):
const getUsageLine = JSON.stringify({
  type: 'control_response',
  response: {
    request_id: 'r1',
    subtype: 'success',
    response: {
      subscription_type: 'max',
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: 69, resets_at: '2026-07-30T17:00:00.000Z' },
        seven_day: { utilization: 10, resets_at: '2026-08-06T00:00:00.000Z' },
      },
    },
  },
});

describe('parseGetUsageLines (busca profunda, defensivo)', () => {
  it('extrai week/5h/resets do shape real', () => {
    const r = parseGetUsageLines(['{"type":"system"}', getUsageLine]);
    expect(r).toEqual({ weekPct: 10, fiveHourPct: 69, resetsAt: '2026-08-06T00:00:00.000Z' });
  });
  it('envelope diferente (rate_limits mais fundo/raso) ainda acha', () => {
    const alt = JSON.stringify({ rate_limits: { seven_day: { utilization: 42 } } });
    expect(parseGetUsageLines([alt]).weekPct).toBe(42);
  });
  it('linhas inválidas/shape sem rate_limits → null', () => {
    expect(parseGetUsageLines(['not json', '{"a":1}'])).toBeNull();
    expect(parseGetUsageLines([JSON.stringify({ rate_limits: { seven_day: { utilization: 'x' } } })])).toBeNull();
  });
});

describe('parseUsageText (fallback /usage)', () => {
  it('extrai o % da semana do texto', () => {
    const txt = 'Current session: 70% used · resets 5pm\nCurrent week (all models): 11% used · resets Aug 6\nCurrent week (Fable): 17% used';
    expect(parseUsageText(txt)).toEqual({ weekPct: 11, fiveHourPct: 70, resetsAt: null });
  });
  it('sem match → null', () => { expect(parseUsageText('nada aqui')).toBeNull(); });
});

describe('postReport (fail-silent)', () => {
  const env = { OCTODASH_URL: 'https://x.test', OCTODASH_API_KEY: 'k1' };
  it('POSTa no ingest com Bearer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const ok = await postReport(fetchImpl, env, { weekPct: 10, fiveHourPct: 69, resetsAt: 'z' });
    expect(ok).toBe(true);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://x.test/api/v1/anthropic/usage-report');
    expect(opts.headers.Authorization).toBe('Bearer k1');
    expect(JSON.parse(opts.body).week_pct).toBe(10);
  });
  it('fetch lança → false, nunca propaga', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    await expect(postReport(fetchImpl, env, { weekPct: 10 })).resolves.toBe(false);
  });
  it('sem envs → false sem chamar fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(postReport(fetchImpl, {}, { weekPct: 10 })).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
