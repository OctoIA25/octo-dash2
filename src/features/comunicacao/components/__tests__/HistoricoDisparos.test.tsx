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
});
