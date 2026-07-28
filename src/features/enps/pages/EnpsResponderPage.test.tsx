import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnpsResponderPage } from './EnpsResponderPage';
import { setEnpsService } from '../hooks/useEnps';
import type { EnpsService, EnpsResponderContext } from '../types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// A página usa useQueryClient (invalida a pendência ao responder), então precisa
// de um QueryClientProvider. Devolvemos o client para os testes espionarem invalidateQueries.
function renderAt(cycle: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/enps/responder?cycle=${cycle}`]}><EnpsResponderPage /></MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

const baseCtx = {
  cycle: { id: 'cyc-1', status: 'open' as const },
  questions: [
    { key: 'q_empresa' as const, type: 'nps_0_10' as const, label: 'Recomendaria a imobiliária?' },
    { key: 'q_gestor' as const, type: 'nps_0_10' as const, label: 'Recomendaria seu gestor?' },
    { key: 'q_comentario' as const, type: 'open_text' as const, required: false, label: 'Comentário?' },
  ],
  hasLeader: true,
  alreadyResponded: false,
};

// Partial<EnpsResponderContext> (não Partial<typeof baseCtx>): baseCtx.cycle.status
// é inferido como o literal 'open' via `as const`, então Partial<typeof baseCtx>
// rejeita status:'closed' no teste de ciclo fechado. O tipo real aceita ambos.
function mockService(over: Partial<EnpsResponderContext>, submit = vi.fn().mockResolvedValue({ ok: true })) {
  setEnpsService({ getResponderContext: vi.fn().mockResolvedValue({ ...baseCtx, ...over }), submitResponse: submit } as unknown as EnpsService);
  return submit;
}

describe('EnpsResponderPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('esconde a Q2 (gestor) quando o corretor não tem líder', async () => {
    mockService({ hasLeader: false });
    renderAt('cyc-1');
    await waitFor(() => expect(screen.getByText('Recomendaria a imobiliária?')).toBeInTheDocument());
    expect(screen.queryByText('Recomendaria seu gestor?')).not.toBeInTheDocument();
  });

  it('mostra a Q2 quando o corretor tem líder', async () => {
    mockService({ hasLeader: true });
    renderAt('cyc-1');
    await waitFor(() => expect(screen.getByText('Recomendaria seu gestor?')).toBeInTheDocument());
  });

  it('submete sem q_gestor e allow_individual=false quando sem líder', async () => {
    const submit = mockService({ hasLeader: false });
    renderAt('cyc-1');
    await waitFor(() => screen.getByText('Recomendaria a imobiliária?'));
    fireEvent.click(screen.getByRole('button', { name: 'Nota 9 para q_empresa' }));
    fireEvent.click(screen.getByRole('button', { name: /enviar resposta/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ cycle_id: 'cyc-1', answers: { q_empresa: 9 }, allow_individual: false }));
  });

  it('inclui q_gestor quando há líder e nota escolhida', async () => {
    const submit = mockService({ hasLeader: true });
    renderAt('cyc-1');
    await waitFor(() => screen.getByText('Recomendaria seu gestor?'));
    fireEvent.click(screen.getByRole('button', { name: 'Nota 10 para q_empresa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nota 7 para q_gestor' }));
    fireEvent.click(screen.getByRole('button', { name: /enviar resposta/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ cycle_id: 'cyc-1', answers: { q_empresa: 10, q_gestor: 7 }, allow_individual: false }));
  });

  it('curto-circuita quando já respondido', async () => {
    mockService({ alreadyResponded: true });
    renderAt('cyc-1');
    await waitFor(() => expect(screen.getByText(/já respondeu/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /enviar resposta/i })).not.toBeInTheDocument();
  });

  it('mostra estado de ciclo fechado', async () => {
    mockService({ cycle: { id: 'cyc-1', status: 'closed' } });
    renderAt('cyc-1');
    await waitFor(() => expect(screen.getByText(/pesquisa foi encerrada/i)).toBeInTheDocument());
  });

  it('invalida a query de pendência ao responder (banner some na dash)', async () => {
    mockService({ hasLeader: false });
    const { queryClient } = renderAt('cyc-1');
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() => screen.getByText('Recomendaria a imobiliária?'));
    fireEvent.click(screen.getByRole('button', { name: 'Nota 9 para q_empresa' }));
    fireEvent.click(screen.getByRole('button', { name: /enviar resposta/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['enps', 'pending'] }));
  });
});
