/**
 * "Passaram" é contado no banco sobre a base inteira. Com o funil recortado
 * (período, Lançamento/Pronto), ele dividia pelo total recortado e passava
 * de 100%. Com filtro, o funil não pergunta e diz por quê.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ currentTheme: 'light' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
const carregar = vi.fn(() => new Promise(() => {}));
vi.mock('@/features/leads/services/funilPassaramService', () => ({
  carregarPassaramPorEtapa: (...a: unknown[]) => carregar(...a),
}));

import { EnhancedFunnelChart } from '../EnhancedFunnelChart';

beforeEach(() => {
  carregar.mockClear();
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
});

describe('EnhancedFunnelChart — "passaram" só sem filtro', () => {
  it('sem filtro, pergunta ao banco quantos passaram', () => {
    render(<EnhancedFunnelChart leads={[]} />);
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it('com filtro, não pergunta e explica que mostra só o "agora"', () => {
    render(<EnhancedFunnelChart leads={[]} contarPassaram={false} />);
    expect(carregar).not.toHaveBeenCalled();
    expect(screen.getByText(/Com filtro, o funil mostra quem está em cada etapa agora/)).toBeInTheDocument();
  });
});
