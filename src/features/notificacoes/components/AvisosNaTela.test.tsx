import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { NotificationItem } from '@/contexts/NotificationsContext';

const ctx = vi.hoisted(() => ({
  ouvinte: null as null | ((i: unknown) => void),
  cancelar: vi.fn(),
  markAsRead: vi.fn(),
}));
vi.mock('@/contexts/NotificationsContext', () => ({
  useNotifications: () => ({
    aoChegar: (fn: (i: unknown) => void) => { ctx.ouvinte = fn; return ctx.cancelar; },
    markAsRead: ctx.markAsRead,
  }),
}));

const bloop = vi.hoisted(() => ({ mostrarBloop: vi.fn() }));
vi.mock('./NotificationBloop', () => bloop);

import { AvisosNaTela } from './AvisosNaTela';

const item = (id: string, extra: Partial<NotificationItem> = {}): NotificationItem => ({
  id, title: id, createdAt: '2026-10-01T12:00:00Z', read: false, metadata: {}, ...extra,
});

const Onde = () => <p data-testid="onde">{useLocation().pathname}</p>;
const montar = () => render(<MemoryRouter><AvisosNaTela /><Onde /></MemoryRouter>);

describe('AvisosNaTela', () => {
  beforeEach(() => {
    ctx.ouvinte = null; ctx.cancelar.mockReset(); ctx.markAsRead.mockReset(); bloop.mostrarBloop.mockReset();
    localStorage.clear();
  });

  it('duas chegadas seguidas mostram dois bloops', () => {
    montar();
    act(() => { ctx.ouvinte!(item('a')); ctx.ouvinte!(item('b')); });
    expect(bloop.mostrarBloop).toHaveBeenCalledTimes(2);
  });

  it('desmontar cancela a assinatura e remontar não reexibe nada', () => {
    const { unmount } = montar();
    act(() => { ctx.ouvinte!(item('a')); });
    unmount();
    expect(ctx.cancelar).toHaveBeenCalled();
    bloop.mostrarBloop.mockReset();
    montar();
    expect(bloop.mostrarBloop).not.toHaveBeenCalled();
  });

  it('com o interruptor desligado não mostra bloop', () => {
    localStorage.setItem('octo:avisos-na-tela', '0');
    montar();
    act(() => { ctx.ouvinte!(item('a')); });
    expect(bloop.mostrarBloop).not.toHaveBeenCalled();
  });

  it('abrir o bloop marca como lida e navega ao destino', () => {
    montar();
    act(() => { ctx.ouvinte!(item('a', { linkType: 'lead', linkId: 'L1' })); });
    act(() => { bloop.mostrarBloop.mock.calls[0][1](item('a', { linkType: 'lead', linkId: 'L1' })); });
    expect(ctx.markAsRead).toHaveBeenCalledWith('a');
    expect(screen.getByTestId('onde').textContent).not.toBe('/');
  });

  it('sem destino, abrir leva a /notificacoes', () => {
    montar();
    act(() => { ctx.ouvinte!(item('a')); });
    act(() => { bloop.mostrarBloop.mock.calls[0][1](item('a')); });
    expect(screen.getByTestId('onde').textContent).toBe('/notificacoes');
  });
});
