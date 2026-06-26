import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../CampanhaWizard', () => ({ CampanhaWizard: () => <div>WIZARD</div> }));
function baseCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp1', name: 'Reativação', status: 'active', template_id: 't', audience_id: 'a',
    max_recipients: null, send_window: {}, throttle_per_min: null, avoid_resend: false,
    variable_mapping: {}, internal_note: null, notify_on_complete: false, schedule: { mode: 'now' },
    scheduled_at: null, schedule_status: 'none', schedule_error: null,
    created_by_email: null, created_at: '', updated_at: '',
    runs_count: 2, total_sent: 238, total_failed: 1, last_dispatched_at: '2026-06-26T09:00:00Z',
    ...overrides,
  };
}

vi.mock('../../services/campaignsService', () => ({
  listCampaigns: vi.fn(async () => ({ ok: true, campaigns: [baseCampaign()] })),
  deleteCampaign: vi.fn(async () => ({ ok: true })),
  listCampaignRuns: vi.fn(async () => ({ ok: true, runs: [] })),
  cancelSchedule: vi.fn(async () => ({ ok: true })),
}));

import { CampanhasManager } from '../CampanhasManager';
import * as svc from '../../services/campaignsService';

describe('CampanhasManager', () => {
  it('lista campanhas com nome e total enviado', async () => {
    (svc.listCampaigns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, campaigns: [baseCampaign()] });
    render(<CampanhasManager />);
    await waitFor(() => expect(screen.getByText('Reativação')).toBeInTheDocument());
    expect(screen.getByText(/238/)).toBeInTheDocument();
  });
  it('botão nova campanha abre o wizard', async () => {
    (svc.listCampaigns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, campaigns: [baseCampaign()] });
    render(<CampanhasManager />);
    await waitFor(() => expect(screen.getByText('Reativação')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /nova campanha/i }));
    expect(screen.getByText('WIZARD')).toBeInTheDocument();
  });
  it('campanha agendada mostra selo e botão cancelar; cancelar chama cancelSchedule', async () => {
    (svc.listCampaigns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      campaigns: [baseCampaign({ id: 'camp2', name: 'Agendada X', schedule_status: 'scheduled', scheduled_at: '2035-01-01T10:00:00Z' })],
    });
    (svc.cancelSchedule as ReturnType<typeof vi.fn>).mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CampanhasManager />);
    await waitFor(() => expect(screen.getByText('Agendada X')).toBeInTheDocument());
    // selo de agendamento (com o relógio) — distinto do nome da campanha
    expect(screen.getByText(/🕒 Agendada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancelar agendamento/i }));
    await waitFor(() => expect((svc.cancelSchedule as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('t1', 'camp2'));
  });
  it('campanha recorrente mostra selo recorrente e botão cancelar recorrência; cancelar chama cancelSchedule', async () => {
    (svc.listCampaigns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      campaigns: [baseCampaign({
        id: 'camp4', name: 'Recorrente Z', schedule_status: 'scheduled',
        scheduled_at: '2030-01-07T12:00:00Z',
        recurrence: { frequency: 'weekly', day_of_week: 1, time: '12:00' },
      })],
    });
    (svc.cancelSchedule as ReturnType<typeof vi.fn>).mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CampanhasManager />);
    await waitFor(() => expect(screen.getByText('Recorrente Z')).toBeInTheDocument());
    // describeRecurrence: weekly day_of_week=1 time='12:00' UTC → "Toda segunda às 09:00"
    expect(screen.getByText(/Toda segunda/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancelar recorrência/i }));
    await waitFor(() => expect((svc.cancelSchedule as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('t1', 'camp4'));
  });
  it('campanha com falha de agendamento mostra o motivo', async () => {
    (svc.listCampaigns as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      campaigns: [baseCampaign({ id: 'camp3', name: 'Falhou Y', schedule_status: 'error', schedule_error: 'template_not_approved' })],
    });
    render(<CampanhasManager />);
    await waitFor(() => expect(screen.getByText('Falhou Y')).toBeInTheDocument());
    expect(screen.getByText(/Falha no agendamento/)).toBeInTheDocument();
    expect(screen.getByText(/template_not_approved/)).toBeInTheDocument();
  });
});
