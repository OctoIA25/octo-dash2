import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const canal = vi.hoisted(() => ({ handler: null as null | ((p: { new: unknown }) => void) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => {
      const c = {
        on: (_evento: string, _filtro: unknown, h: (p: { new: unknown }) => void) => { canal.handler = h; return c; },
        subscribe: () => c,
      };
      return c;
    },
    removeChannel: vi.fn(),
  },
}));

const buscar = vi.hoisted(() => vi.fn());
vi.mock('@/features/notificacoes/services/notificationsService', () => ({
  fetchNotificationsForUser: buscar,
  markNotificationAsRead: vi.fn(async () => true),
  markAllNotificationsAsRead: vi.fn(async () => true),
  clearReadNotifications: vi.fn(async () => true),
}));

import { NotificationsProvider, useNotifications } from './NotificationsContext';

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, tenant_id: 't-a', user_id: 'u-1', title: id, body: null, type: 'comunicado', read_at: null,
  created_at: '2026-10-01T12:00:00Z', link_type: null, link_id: null, comunicado_id: null, metadata: {}, ...extra,
});

const wrapper = ({ children }: { children: ReactNode }) => <NotificationsProvider>{children}</NotificationsProvider>;
const montar = () => renderHook(() => useNotifications(), { wrapper });
const ids = (r: ReturnType<typeof montar>['result']) => r.current.notifications.map((n) => n.id);

describe('NotificationsContext', () => {
  beforeEach(() => { buscar.mockReset(); canal.handler = null; });

  it('trocar de imobiliária não deixa a lista da anterior na tela', async () => {
    buscar.mockResolvedValueOnce([linha('da-a')]).mockResolvedValueOnce([linha('da-b', { tenant_id: 't-b' })]);
    const { result } = montar();
    await act(async () => { await result.current.loadNotifications('t-a', 'u-1'); });
    expect(ids(result)).toEqual(['da-a']);
    await act(async () => { await result.current.loadNotifications('t-b', 'u-1'); });
    expect(ids(result)).toEqual(['da-b']);
  });

  it('a resposta atrasada da casa anterior não entra na lista da nova', async () => {
    let soltarA: (v: unknown) => void = () => {};
    buscar
      .mockImplementationOnce(() => new Promise((ok) => { soltarA = ok; }))
      .mockResolvedValueOnce([linha('da-b', { tenant_id: 't-b' })]);
    const { result } = montar();
    let cargaA: Promise<void> = Promise.resolve();
    act(() => { cargaA = result.current.loadNotifications('t-a', 'u-1'); });
    await act(async () => { await result.current.loadNotifications('t-b', 'u-1'); });
    await act(async () => { soltarA([linha('da-a')]); await cargaA; });
    expect(ids(result)).toEqual(['da-b']);
  });

  it('falha na carga vira loadError, não lista vazia calada', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    buscar.mockRejectedValueOnce(new Error('rede'));
    const { result } = montar();
    await act(async () => { await result.current.loadNotifications('t-a', 'u-1'); });
    expect(result.current.loadError).toBe(true);
    erro.mockRestore();
  });

  it('linha antiga com metadata nulo vira metadata vazio', async () => {
    buscar.mockResolvedValueOnce([linha('antiga', { metadata: null, type: 'info' })]);
    const { result } = montar();
    await act(async () => { await result.current.loadNotifications('t-a', 'u-1'); });
    expect(result.current.notifications[0].metadata).toEqual({});
  });

  it('o que chega pelo Realtime entra no topo e avisa quem assina aoChegar', async () => {
    buscar.mockResolvedValueOnce([linha('antiga')]);
    const { result } = montar();
    await act(async () => { await result.current.loadNotifications('t-a', 'u-1'); });
    await waitFor(() => expect(canal.handler).not.toBeNull());
    const ouvinte = vi.fn();
    let cancelar: () => void = () => {};
    act(() => { cancelar = result.current.aoChegar(ouvinte); });
    act(() => canal.handler!({ new: linha('nova', { created_at: '2026-10-01T13:00:00Z' }) }));
    expect(ids(result)).toEqual(['nova', 'antiga']);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(ouvinte.mock.calls[0][0].id).toBe('nova');
    cancelar();
    act(() => canal.handler!({ new: linha('outra') }));
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('rajada dentro de um único render avisa uma vez por chegada', async () => {
    buscar.mockResolvedValueOnce([]);
    const { result } = montar();
    await act(async () => { await result.current.loadNotifications('t-a', 'u-1'); });
    await waitFor(() => expect(canal.handler).not.toBeNull());
    const ouvinte = vi.fn();
    act(() => { result.current.aoChegar(ouvinte); });
    act(() => {
      canal.handler!({ new: linha('um') });
      canal.handler!({ new: linha('dois') });
    });
    expect(ouvinte.mock.calls.map((c) => c[0].id)).toEqual(['um', 'dois']);
  });

  it('Realtime de outra imobiliária é ignorado', async () => {
    buscar.mockResolvedValueOnce([]);
    const { result } = montar();
    await act(async () => { await result.current.loadNotifications('t-a', 'u-1'); });
    await waitFor(() => expect(canal.handler).not.toBeNull());
    const ouvinte = vi.fn();
    act(() => { result.current.aoChegar(ouvinte); });
    act(() => canal.handler!({ new: linha('de-outra', { tenant_id: 't-z' }) }));
    expect(ids(result)).toEqual([]);
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('Limpar lidas mantém as não lidas', async () => {
    buscar.mockResolvedValueOnce([linha('lida', { read_at: '2026-10-01T12:30:00Z' }), linha('nao-lida')]);
    const { result } = montar();
    await act(async () => { await result.current.loadNotifications('t-a', 'u-1'); });
    await act(async () => { await result.current.clearRead(); });
    expect(ids(result)).toEqual(['nao-lida']);
  });
});
