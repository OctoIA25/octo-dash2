import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ tenantId: 't1' }),
}));
vi.mock('../../services/historicoService', () => ({
  listRuns: vi.fn(async () => ({
    ok: true,
    runs: [
      { id: 'r1', command_text: 'envie para arquivados', status: 'done', found_count: 10, eligible_count: 8, sent_count: 8, failed_count: 0, deduplicated_count: 0, requested_by_email: 'a@x.com', created_at: '2026-06-20T10:00:00Z', completed_at: '2026-06-20T10:01:00Z' },
    ],
    limit: 50, offset: 0,
  })),
  getRunProgress: vi.fn(),
}));
vi.mock('../../services/disparadorService', () => ({
  getRunReport: vi.fn(async () => ({
    ok: true,
    run: { id: 'r1', status: 'done', found_count: 10, eligible_count: 8, no_whatsapp_count: 2, excluded_count: 0, sent_count: 7, failed_count: 1 },
    failures: [{ lead_name: 'João', lead_phone: '5511999990000', status: 'failed', error: 'timeout' }],
  })),
}));

import { HistoricoDisparos } from '../HistoricoDisparos';

describe('HistoricoDisparos', () => {
  it('renderiza a lista de disparos', async () => {
    render(<HistoricoDisparos />);
    await waitFor(() => expect(screen.getByText(/envie para arquivados/i)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText(/enviados/i)).toBeInTheDocument();   // mostra o rótulo de contagem
  });

  it('estado vazio quando não há disparos', async () => {
    const svc = await import('../../services/historicoService');
    (svc.listRuns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, runs: [], limit: 50, offset: 0 });
    render(<HistoricoDisparos />);
    await waitFor(() => expect(screen.getByText(/nenhum disparo/i)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('clicar numa linha abre o detalhe com as falhas', async () => {
    render(<HistoricoDisparos />);
    await waitFor(() => expect(screen.getByText(/envie para arquivados/i)).toBeInTheDocument(), { timeout: 2000 });
    await userEvent.click(screen.getByText(/envie para arquivados/i));
    await waitFor(() => expect(screen.getByText(/João/)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText(/timeout/i)).toBeInTheDocument();
  });

  it('resposta ok:false do getRunProgress não zera a barra (mantém progresso anterior)', async () => {
    const svc = await import('../../services/historicoService');
    (svc.listRuns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      runs: [{ id: 'r3', command_text: 'disparo ok-false', status: 'running', found_count: 500, eligible_count: 500, sent_count: 0, failed_count: 0, deduplicated_count: 0, requested_by_email: 'a@x.com', created_at: '2026-06-25T11:00:00Z', completed_at: null }],
      limit: 50, offset: 0,
    });
    // Retorna erro — o estado anterior (0 done, total fallback = found_count) não deve ser substituído por um objeto inválido
    (svc.getRunProgress as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'timeout' });

    render(<HistoricoDisparos />);
    await waitFor(() => expect(screen.getByText(/disparo ok-false/i)).toBeInTheDocument(), { timeout: 2000 });
    // A barra ainda exibe "0 / 500" (fallback do found_count), não quebra nem some
    await waitFor(() => expect(screen.getByText(/0\s*\/\s*500/)).toBeInTheDocument(), { timeout: 6000 });
  });

  it('run em andamento exibe barra de progresso via getRunProgress', async () => {
    const svc = await import('../../services/historicoService');
    (svc.listRuns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      runs: [{ id: 'r2', command_text: 'disparo grande', status: 'running', found_count: 10000, eligible_count: 10000, sent_count: 0, failed_count: 0, deduplicated_count: 0, requested_by_email: 'a@x.com', created_at: '2026-06-25T10:00:00Z', completed_at: null }],
      limit: 50, offset: 0,
    });
    (svc.getRunProgress as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 'running', done: 3200, failed: 0, pending: 6800, total: 10000 });

    render(<HistoricoDisparos />);
    await waitFor(() => expect(screen.getByText(/disparo grande/i)).toBeInTheDocument(), { timeout: 2000 });
    await waitFor(() => expect(screen.getByText(/3\.?200/)).toBeInTheDocument(), { timeout: 6000 });
  });
});
