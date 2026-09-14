import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeadsData } from './useLeadsData';

// Regressão: o auto-update ignorava `enabled` e, depois de uma carga, seguia
// varrendo o tenant inteiro a cada 5 min em qualquer rota.

const { fetchSupabaseLeadsData } = vi.hoisted(() => ({
  fetchSupabaseLeadsData: vi.fn(),
}));

vi.mock('@/services/supabaseService', () => ({
  fetchSupabaseLeadsData,
  getSupabaseFallbackData: vi.fn(() => []),
  fetchAllSupabaseData: vi.fn(),
}));

// 10 min + margem: dois ticks do intervalo (5 min) — o segundo já com o cache em
// memória expirado.
const ALEM_DO_AUTO_UPDATE = 610_000;

describe('useLeadsData — enabled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchSupabaseLeadsData.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não busca enquanto enabled=false', async () => {
    renderHook(() => useLeadsData({ enabled: false }));
    await act(() => vi.advanceTimersByTimeAsync(ALEM_DO_AUTO_UPDATE));

    expect(fetchSupabaseLeadsData).not.toHaveBeenCalled();
  });

  it('busca ao montar com enabled=true e para o auto-update ao desligar', async () => {
    const { rerender } = renderHook(({ enabled }) => useLeadsData({ enabled }), {
      initialProps: { enabled: true },
    });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(fetchSupabaseLeadsData).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    await act(() => vi.advanceTimersByTimeAsync(ALEM_DO_AUTO_UPDATE));

    expect(fetchSupabaseLeadsData).toHaveBeenCalledTimes(1);
  });

  it('religar com cache expirado dispara uma única varredura, mesmo lenta', async () => {
    fetchSupabaseLeadsData.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 60_000)),
    );
    const { rerender } = renderHook(({ enabled }) => useLeadsData({ enabled }), {
      initialProps: { enabled: true },
    });
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    rerender({ enabled: false });
    await act(() => vi.advanceTimersByTimeAsync(360_000)); // cache de 5 min expira
    const chamadasAntes = fetchSupabaseLeadsData.mock.calls.length;

    rerender({ enabled: true });
    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(fetchSupabaseLeadsData).toHaveBeenCalledTimes(chamadasAntes + 1);
  });

  it('religar enquanto a varredura está em voo não abre outra', async () => {
    fetchSupabaseLeadsData.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 90_000)),
    );
    const { rerender } = renderHook(({ enabled }) => useLeadsData({ enabled }), {
      initialProps: { enabled: true },
    });
    for (const enabled of [false, true, false, true]) {
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      rerender({ enabled });
    }
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(fetchSupabaseLeadsData).toHaveBeenCalledTimes(1);
  });
});
