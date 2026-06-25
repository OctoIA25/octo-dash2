import { describe, it, expect } from 'vitest';
import { createTenantRateLimiter } from './rateLimiter.js';

describe('createTenantRateLimiter', () => {
  it('bloqueia ao exceder o burst e libera após refill', () => {
    let t = 0;
    const rl = createTenantRateLimiter({ ratePerSec: 10, burst: 2, now: () => t });
    expect(rl.tryRemove('t1')).toBe(true);
    expect(rl.tryRemove('t1')).toBe(true);
    expect(rl.tryRemove('t1')).toBe(false); // estourou o burst
    t = 1000; // +1s → +10 tokens, mas o cap é o burst (2)
    expect(rl.tryRemove('t1')).toBe(true);
    expect(rl.tryRemove('t1')).toBe(true);
    expect(rl.tryRemove('t1')).toBe(false);
  });

  it('isola tenants (buckets independentes)', () => {
    let t = 0;
    const rl = createTenantRateLimiter({ ratePerSec: 1, burst: 1, now: () => t });
    expect(rl.tryRemove('a')).toBe(true);
    expect(rl.tryRemove('b')).toBe(true); // bucket separado de 'a'
    expect(rl.tryRemove('a')).toBe(false); // 'a' já esgotou
  });

  it('refill é proporcional ao tempo decorrido (cap no burst)', () => {
    let t = 0;
    const rl = createTenantRateLimiter({ ratePerSec: 10, burst: 10, now: () => t });
    // esgota os 10
    for (let i = 0; i < 10; i++) expect(rl.tryRemove('t1')).toBe(true);
    expect(rl.tryRemove('t1')).toBe(false);
    t = 500; // +0,5s → +5 tokens
    for (let i = 0; i < 5; i++) expect(rl.tryRemove('t1')).toBe(true);
    expect(rl.tryRemove('t1')).toBe(false);
    t = 100000; // muito tempo → recarrega, mas nunca passa do burst (10)
    for (let i = 0; i < 10; i++) expect(rl.tryRemove('t1')).toBe(true);
    expect(rl.tryRemove('t1')).toBe(false);
  });

  it('tryRemove(n) consome n tokens de uma vez; falha se não houver n', () => {
    let t = 0;
    const rl = createTenantRateLimiter({ ratePerSec: 1, burst: 5, now: () => t });
    expect(rl.tryRemove('t1', 3)).toBe(true);  // 5 → 2
    expect(rl.tryRemove('t1', 3)).toBe(false); // só 2 disponíveis, não consome
    expect(rl.tryRemove('t1', 2)).toBe(true);  // 2 → 0
  });

  it('primeiro acesso de um tenant começa cheio (burst)', () => {
    let t = 1234; // now arbitrário no primeiro acesso
    const rl = createTenantRateLimiter({ ratePerSec: 1, burst: 3, now: () => t });
    expect(rl.tryRemove('novo', 3)).toBe(true); // bucket inicia cheio
    expect(rl.tryRemove('novo')).toBe(false);
  });
});
