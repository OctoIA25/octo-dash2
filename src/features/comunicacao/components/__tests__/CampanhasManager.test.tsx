import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../CampanhaWizard', () => ({ CampanhaWizard: () => <div>WIZARD</div> }));
vi.mock('../../services/campaignsService', () => ({
  listCampaigns: vi.fn(async () => ({ ok: true, campaigns: [
    { id: 'camp1', name: 'Reativação', status: 'active', template_id: 't', audience_id: 'a', max_recipients: null, send_window: {}, throttle_per_min: null, avoid_resend: false, variable_mapping: {}, internal_note: null, notify_on_complete: false, schedule: { mode: 'now' }, created_by_email: null, created_at: '', updated_at: '', runs_count: 2, total_sent: 238, total_failed: 1, last_dispatched_at: '2026-06-26T09:00:00Z' },
  ] })),
  deleteCampaign: vi.fn(async () => ({ ok: true })),
  listCampaignRuns: vi.fn(async () => ({ ok: true, runs: [] })),
}));

import { CampanhasManager } from '../CampanhasManager';

describe('CampanhasManager', () => {
  it('lista campanhas com nome e total enviado', async () => {
    render(<CampanhasManager />);
    await waitFor(() => expect(screen.getByText('Reativação')).toBeInTheDocument());
    expect(screen.getByText(/238/)).toBeInTheDocument();
  });
  it('botão nova campanha abre o wizard', async () => {
    render(<CampanhasManager />);
    await waitFor(() => expect(screen.getByText('Reativação')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /nova campanha/i }));
    expect(screen.getByText('WIZARD')).toBeInTheDocument();
  });
});
