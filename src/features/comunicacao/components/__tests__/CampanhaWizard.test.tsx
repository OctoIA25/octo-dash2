import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../services/templatesService', () => ({
  listTemplates: vi.fn(async () => ({ ok: true, templates: [
    { id: 'tpl1', name: 'Promo', approval_status: 'approved', body: 'Olá {{nome}}', variables: ['nome'], category: 'MARKETING', language: 'pt_BR', channel: 'whatsapp', example_values: ['x'], provider_template_id: 'p', rejected_reason: null, created_by_email: null, created_at: '', updated_at: '' },
  ] })),
}));
vi.mock('../../services/audiencesService', () => ({
  listAudiences: vi.fn(async () => ({ ok: true, audiences: [{ id: 'aud1', name: 'Arquivados', segment: { type: 'archived' }, created_by_email: null, created_at: '', updated_at: '' }] })),
  getAudienceCount: vi.fn(async () => ({ ok: true, count: 42 })),
}));
vi.mock('../../services/campaignsService', () => ({
  createCampaign: vi.fn(async () => ({ ok: true, campaign: { id: 'camp1' } })),
  updateCampaign: vi.fn(async () => ({ ok: true, campaign: { id: 'camp1' } })),
  dispatchCampaign: vi.fn(async () => ({ ok: true, runId: 'r1' })),
}));

import { CampanhaWizard } from '../CampanhaWizard';

const props = { tenantId: 't1', editing: null, onClose: vi.fn(), onSaved: vi.fn() };

describe('CampanhaWizard', () => {
  it('etapa 1 exige nome e template antes de avançar', async () => {
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    // sem nome/template, continua na etapa 1 (toast de erro)
    const svc = await import('sonner');
    expect((svc.toast.error as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
  it('fluxo completo até a etapa 5 mostra o preview com o body do template', async () => {
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'Reativação' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 2
    await waitFor(() => expect(screen.getByLabelText(/público/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 3
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 4
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 5
    await waitFor(() => expect(screen.getByTestId('whatsapp-preview-bubble')).toHaveTextContent('Olá {{nome}}'));
  });
  it('disparar na etapa 5 chama dispatchCampaign', async () => {
    const svc = await import('../../services/campaignsService');
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    await waitFor(() => screen.getByLabelText(/público/i));
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /disparar/i }));
    await waitFor(() => expect((svc.createCampaign as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    await waitFor(() => expect((svc.dispatchCampaign as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
  });
});
