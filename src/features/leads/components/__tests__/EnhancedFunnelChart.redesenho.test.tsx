/**
 * "Cannot read properties of null (reading 'style')" ao sair do funil
 * (achado em 28/09/2026 navegando Comercial → Meus Leads).
 *
 * O funil redesenha 350 ms depois de cada mudança de tamanho, esperando a
 * transição da sidebar. A limpeza destruía o gráfico mas não cancelava esse
 * redesenho — que chegava depois, num gráfico destruído fora da página, e o
 * CanvasJS quebrava. Os mesmos 5 gráficos têm o padrão; este trava o funil.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ currentTheme: 'light' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
vi.mock('@/features/leads/services/funilPassaramService', () => ({
  carregarPassaramPorEtapa: () => new Promise(() => {}),
}));

vi.mock('@/features/leads/services/funilVendasService', () => ({
  contarVendasDoFunil: () => new Promise(() => {}),
}));

import { EnhancedFunnelChart } from '../EnhancedFunnelChart';

const comQuery = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

let observado: (() => void) | null = null;
const renders = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  renders.mockReset();
  observado = null;
  (globalThis as any).ResizeObserver = class {
    constructor(cb: () => void) { observado = cb; }
    observe() {}
    disconnect() {}
  };
  (window as any).CanvasJS = {
    Chart: class {
      render() { renders(); }
      destroy() {}
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as any).CanvasJS;
});

describe('EnhancedFunnelChart — redesenho ao redimensionar', () => {
  it('redesenha enquanto está na tela', () => {
    render(<EnhancedFunnelChart leads={[]} />, { wrapper: comQuery() });
    renders.mockClear();

    act(() => { observado?.(); vi.advanceTimersByTime(400); });

    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('não redesenha depois de sair da tela', () => {
    const { unmount } = render(<EnhancedFunnelChart leads={[]} />, { wrapper: comQuery() });
    renders.mockClear();

    act(() => { observado?.(); });   // redesenho agendado para daqui a 350 ms
    unmount();                        // e a pessoa sai antes disso
    act(() => { vi.advanceTimersByTime(400); });

    expect(renders).not.toHaveBeenCalled();
  });
});
