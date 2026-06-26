import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../services/templatesService', () => ({
  listTemplates: vi.fn(async () => ({ ok: true, templates: [
    { id: 'tpl1', name: 'Promo', approval_status: 'approved', body: 'Olá {{1}}', variables: ['1'], category: 'MARKETING', language: 'pt_BR', channel: 'whatsapp', example_values: ['x'], provider_template_id: 'p', rejected_reason: null, created_by_email: null, created_at: '', updated_at: '' },
    { id: 'tpl2', name: 'SemVar', approval_status: 'approved', body: 'Olá, tudo bem?', variables: [], category: 'MARKETING', language: 'pt_BR', channel: 'whatsapp', example_values: [], provider_template_id: 'p2', rejected_reason: null, created_by_email: null, created_at: '', updated_at: '' },
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
  it('fluxo completo até a etapa 5 mostra o preview com a variável mapeada (exemplo)', async () => {
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'Reativação' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 2
    await waitFor(() => expect(screen.getByLabelText(/público/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 3
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 4
    // mapeia {{1}} → Nome do lead antes de avançar
    fireEvent.change(screen.getByLabelText('Variável 1'), { target: { value: 'name' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 5
    await waitFor(() => expect(screen.getByTestId('whatsapp-preview-bubble')).toHaveTextContent('Olá (Nome do lead)'));
  });
  it('bloqueia ao avançar da etapa 4 sem mapear as variáveis do template', async () => {
    const svc = await import('sonner');
    (svc.toast.error as ReturnType<typeof vi.fn>).mockClear();
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    await waitFor(() => screen.getByLabelText(/público/i));
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 3
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 4
    // tenta avançar sem mapear {{1}}
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    expect((svc.toast.error as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('Mapeie todas as variáveis do template.');
    // continua na etapa 4 (o mapeador ainda está visível)
    expect(screen.getByLabelText('Variável 1')).toBeInTheDocument();
  });
  it('template sem variáveis não bloqueia a etapa 4', async () => {
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('SemVar')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl2' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    await waitFor(() => screen.getByLabelText(/público/i));
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 3
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 4
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 5 (não bloqueia)
    await waitFor(() => expect(screen.getByTestId('whatsapp-preview-bubble')).toHaveTextContent('Olá, tudo bem?'));
  });
  it('disparar na etapa 5 chama dispatchCampaign (com variável mapeada)', async () => {
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
    fireEvent.change(screen.getByLabelText('Variável 1'), { target: { value: 'name' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /disparar/i }));
    await waitFor(() => expect((svc.createCampaign as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    await waitFor(() => expect((svc.dispatchCampaign as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    // o variableMapping mapeado vai no input de criação
    const input = (svc.createCampaign as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(input.variableMapping).toEqual({ 1: { type: 'lead_field', value: 'name' } });
  });
  it('agendar na etapa 5 chama createCampaign com scheduledAt e NÃO dispara', async () => {
    const svc = await import('../../services/campaignsService');
    (svc.createCampaign as ReturnType<typeof vi.fn>).mockClear();
    (svc.dispatchCampaign as ReturnType<typeof vi.fn>).mockClear();
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    await waitFor(() => screen.getByLabelText(/público/i));
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.change(screen.getByLabelText('Variável 1'), { target: { value: 'name' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 5
    // seleciona "Agendar" e informa data bem no futuro
    fireEvent.click(screen.getByRole('radio', { name: /agendar/i }));
    fireEvent.change(screen.getByLabelText(/data e hora do agendamento/i), { target: { value: '2035-01-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /agendar/i }));
    await waitFor(() => expect((svc.createCampaign as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    const input = (svc.createCampaign as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(input.scheduledAt).toBeTruthy();
    expect(svc.dispatchCampaign as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
  it('repetir (recorrência) na etapa 5 chama createCampaign com recurrence (time em UTC) e NÃO dispara', async () => {
    const svc = await import('../../services/campaignsService');
    (svc.createCampaign as ReturnType<typeof vi.fn>).mockClear();
    (svc.dispatchCampaign as ReturnType<typeof vi.fn>).mockClear();
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    await waitFor(() => screen.getByLabelText(/público/i));
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.change(screen.getByLabelText('Variável 1'), { target: { value: 'name' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 5
    // seleciona "Repetir", frequência diária (default) e horário 09:00
    fireEvent.click(screen.getByRole('radio', { name: /repetir/i }));
    fireEvent.change(screen.getByLabelText(/^horário$/i), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /ativar recorrência/i }));
    await waitFor(() => expect((svc.createCampaign as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    const input = (svc.createCampaign as ReturnType<typeof vi.fn>).mock.calls[0][1];
    // 09:00 local (BR UTC-3) → 12:00 UTC
    expect(input.recurrence).toEqual({ frequency: 'daily', time: '12:00' });
    expect(svc.dispatchCampaign as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
  it('repetir semanal revela o seletor de dia da semana', async () => {
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    await waitFor(() => screen.getByLabelText(/público/i));
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.change(screen.getByLabelText('Variável 1'), { target: { value: 'name' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 5
    fireEvent.click(screen.getByRole('radio', { name: /repetir/i }));
    // diária por padrão: sem seletor de dia
    expect(screen.queryByLabelText(/dia da semana/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/frequência/i), { target: { value: 'weekly' } });
    // semanal: revela o seletor de dia
    expect(screen.getByLabelText(/dia da semana/i)).toBeInTheDocument();
  });
  it('agendar com data no passado é bloqueado (não chama createCampaign)', async () => {
    const svc = await import('../../services/campaignsService');
    const sonner = await import('sonner');
    (svc.createCampaign as ReturnType<typeof vi.fn>).mockClear();
    (sonner.toast.error as ReturnType<typeof vi.fn>).mockClear();
    render(<CampanhaWizard {...props} />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/nome da campanha/i), { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText(/template/i), { target: { value: 'tpl1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    await waitFor(() => screen.getByLabelText(/público/i));
    fireEvent.change(screen.getByLabelText(/público/i), { target: { value: 'aud1' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.change(screen.getByLabelText('Variável 1'), { target: { value: 'name' } });
    fireEvent.click(screen.getByRole('button', { name: /avançar/i })); // → etapa 5
    fireEvent.click(screen.getByRole('radio', { name: /agendar/i }));
    fireEvent.change(screen.getByLabelText(/data e hora do agendamento/i), { target: { value: '2000-01-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /agendar/i }));
    expect((sonner.toast.error as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect(svc.createCampaign as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
