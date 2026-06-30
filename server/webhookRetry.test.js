import { describe, it, expect } from 'vitest';
import { computeNextAttempt, MAX_WEBHOOK_ATTEMPTS } from './webhookRetry.js';

describe('computeNextAttempt', () => {
  const base = Date.parse('2026-06-30T12:00:00.000Z');

  it('1ª tentativa: backoff de ~60s (2^1 * 30s)', () => {
    const next = Date.parse(computeNextAttempt(1, base));
    expect(next - base).toBe(60_000);
  });

  it('aplica teto de 1h para attempts altos', () => {
    const next = Date.parse(computeNextAttempt(20, base));
    expect(next - base).toBe(60 * 60 * 1000);
  });

  it('MAX_WEBHOOK_ATTEMPTS é 6', () => {
    expect(MAX_WEBHOOK_ATTEMPTS).toBe(6);
  });
});
