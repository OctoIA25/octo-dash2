/**
 * A.5 · o que a tela da safra diz. A conta é do banco
 * (supabase/tests/funil_de_safra.test.sql); aqui, o que aparece quando.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FunilDeSafra as Safra } from '@/features/leads/services/funilDeSafraService';

const carregar = vi.fn<(...a: unknown[]) => Promise<Safra>>();
vi.mock('@/features/leads/services/funilDeSafraService', () => ({
  carregarFunilDeSafra: (...a: unknown[]) => carregar(...a),
}));

import { FunilDeSafra } from '../FunilDeSafra';

const outubro = { de: '2026-10-01', ate: '2026-10-31' };
const montar = (periodo: { de: string; ate: string } | null) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FunilDeSafra tenantId="lotus" periodo={periodo} atuacao="todos" />
  </QueryClientProvider>,
);

const safra = (o: Partial<Safra> = {}): Safra => ({
  entraram: 7, porEtapa: [6, 5, 5, 4, 4, 4, 4], fecharam: 4, fecharamComData: 3,
  medianaDias: 10, viva: 2, arquivados: 1, inicioDoHistorico: '2026-09-10T12:00:00Z', ...o,
});

beforeEach(() => carregar.mockReset());

describe('o funil de safra na tela', () => {
  it('datas livres inválidas: pede para completar e não consulta nada', () => {
    montar(null);
    expect(screen.getByText(/Complete as duas datas do período personalizado/)).toBeInTheDocument();
    expect(carregar).not.toHaveBeenCalled();
  });

  it('mostra quem entrou, o % que fechou, a mediana e quantos ficaram de fora dela', async () => {
    carregar.mockResolvedValue(safra());
    montar(outubro);
    expect(await screen.findByText(/leads entraram no período/)).toHaveTextContent('7 leads entraram no período');
    expect(screen.getByText('57%')).toBeInTheDocument();
    expect(screen.getByText('4 de 7')).toBeInTheDocument();
    expect(screen.getByText('10 dias')).toBeInTheDocument();
    expect(screen.getByText(/4 ficaram de fora do cálculo/)).toBeInTheDocument();
    expect(screen.getByText(/1 arquivados/)).toBeInTheDocument();
  });

  it('sem nenhum lead no período diz "Sem dados" — nunca zero', async () => {
    carregar.mockResolvedValue(safra({ entraram: 0, porEtapa: [0, 0, 0, 0, 0, 0, 0], fecharam: 0, fecharamComData: 0, medianaDias: null, viva: 0, arquivados: 0 }));
    montar(outubro);
    expect(await screen.findByText(/Sem dados: nenhum lead entrou neste período/)).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('sem fechamento datado, a mediana é "Sem dados", não "0 dias"', async () => {
    carregar.mockResolvedValue(safra({ fecharam: 1, fecharamComData: 0, medianaDias: null }));
    montar(outubro);
    expect(await screen.findByText('Sem dados')).toBeInTheDocument();
    expect(screen.queryByText('0 dias')).toBeNull();
  });
});
