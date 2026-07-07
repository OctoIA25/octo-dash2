import { describe, it, expect, vi } from 'vitest';
import { memoizeTtl } from './ttlMemo.js';

describe('memoizeTtl', () => {
  it('reusa o resultado dentro do TTL e refaz após expirar', async () => {
    let clock = 1000;
    const fn = vi.fn(async (id) => `valor-${id}-${clock}`);
    const memo = memoizeTtl(fn, 100, { now: () => clock });

    expect(await memo('t1')).toBe('valor-t1-1000');
    clock = 1050; // dentro do TTL
    expect(await memo('t1')).toBe('valor-t1-1000');
    expect(fn).toHaveBeenCalledTimes(1);

    clock = 1101; // expirou
    expect(await memo('t1')).toBe('valor-t1-1101');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('chaves distintas não se misturam', async () => {
    const fn = vi.fn(async (id) => id.toUpperCase());
    const memo = memoizeTtl(fn, 1000, { now: () => 0 });
    expect(await memo('a')).toBe('A');
    expect(await memo('b')).toBe('B');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('resultado reprovado por shouldCache não fica no cache', async () => {
    const results = [{ ok: false }, { ok: true }, { ok: true }];
    let i = 0;
    const loader = vi.fn(async () => results[i++]);
    const memo = memoizeTtl(loader, 1000, { now: () => 0, shouldCache: (r) => r.ok });

    expect(await memo('t1')).toEqual({ ok: false }); // não cacheia
    expect(await memo('t1')).toEqual({ ok: true }); // refez e cacheou
    expect(await memo('t1')).toEqual({ ok: true }); // veio do cache
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keyOf customizado agrupa args equivalentes', async () => {
    const loader = vi.fn(async (ids) => new Set(ids));
    const memo = memoizeTtl(loader, 1000, { now: () => 0, keyOf: (ids) => [...ids].sort().join(',') });
    await memo(['b', 'a']);
    await memo(['a', 'b']);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
