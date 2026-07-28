import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { EnpsPendingBanner } from './EnpsPendingBanner';
import type { EnpsPending } from '../types';

// Controla o retorno do hook useEnpsPending.
const pendingState: { current: EnpsPending } = { current: { pending: false } };
vi.mock('../hooks/useEnps', () => ({
  useEnpsPending: () => pendingState.current,
}));

function renderBanner() {
  return render(<MemoryRouter><EnpsPendingBanner /></MemoryRouter>);
}

describe('EnpsPendingBanner', () => {
  it('não renderiza nada quando não há pendência', () => {
    pendingState.current = { pending: false };
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it('mostra a faixa com mês e link de responder quando pendente', () => {
    pendingState.current = { pending: true, cycleId: 'cyc-1', periodStart: '2026-07-01' };
    renderBanner();
    expect(screen.getByText(/Pesquisa de satisfação \(eNPS\) — Julho/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /responder/i });
    expect(link).toHaveAttribute('href', '/enps/responder?cycle=cyc-1');
  });

  it('some ao clicar em dispensar (×)', () => {
    pendingState.current = { pending: true, cycleId: 'cyc-1', periodStart: '2026-07-01' };
    renderBanner();
    expect(screen.getByText(/Pesquisa de satisfação/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dispensar aviso/i }));
    expect(screen.queryByText(/Pesquisa de satisfação/i)).not.toBeInTheDocument();
  });

  it('funciona sem periodStart (mês vazio, sem quebrar)', () => {
    pendingState.current = { pending: true, cycleId: 'cyc-2', periodStart: '' };
    renderBanner();
    // título aparece sem o sufixo de mês
    expect(screen.getByText(/Pesquisa de satisfação \(eNPS\)$/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /responder/i })).toHaveAttribute('href', '/enps/responder?cycle=cyc-2');
  });
});
