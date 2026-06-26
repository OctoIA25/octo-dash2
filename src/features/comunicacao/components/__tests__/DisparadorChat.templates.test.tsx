import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ currentTheme: 'claro' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../services/audiencesService', () => ({ listAudiences: vi.fn(async () => ({ ok: true, audiences: [] })) }));
vi.mock('../../services/templatesService', () => ({
  listTemplates: vi.fn(async () => ({ ok: true, templates: [
    { id: 'ap', name: 'Aprovado', approval_status: 'approved', body: 'Olá {{nome}}', category: 'MARKETING', language: 'pt_BR', channel: 'whatsapp', variables: ['nome'], example_values: ['x'], provider_template_id: 'p', rejected_reason: null, created_by_email: null, created_at: '', updated_at: '' },
    { id: 'dr', name: 'Rascunho', approval_status: 'draft', body: 'x', category: 'MARKETING', language: 'pt_BR', channel: 'whatsapp', variables: [], example_values: [], provider_template_id: null, rejected_reason: null, created_by_email: null, created_at: '', updated_at: '' },
  ] })),
}));
vi.mock('../../services/disparadorService', () => ({
  previewDisparo: vi.fn(async () => ({ ok: true, previewToken: 'tok', needsMessage: true, preview: { action: 'send_whatsapp', segment: {}, foundCount: 1, eligibleCount: 1, noWhatsappCount: 0, excludedCount: 0, message: '', sampleNames: [] } })),
  confirmDisparo: vi.fn(async () => ({ ok: true, enqueued: 1, runId: 'run-1' })),
  getRunReport: vi.fn(async () => ({ ok: true, run: { id: 'run-1', status: 'completed', found_count: 1, eligible_count: 1, no_whatsapp_count: 0, excluded_count: 0, sent_count: 1, failed_count: 0 } })),
}));

import { DisparadorChat } from '../DisparadorChat';

it('o seletor de template mostra só os aprovados e preenche a mensagem', async () => {
  render(<DisparadorChat />);
  fireEvent.change(screen.getByPlaceholderText(/Mande uma mensagem/i), { target: { value: 'arquivados' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar prévia/i }));
  await waitFor(() => expect(screen.getByLabelText(/template aprovado/i)).toBeInTheDocument());
  const select = screen.getByLabelText(/template aprovado/i) as HTMLSelectElement;
  expect(select.innerHTML).toContain('Aprovado');
  expect(select.innerHTML).not.toContain('Rascunho');
  fireEvent.change(select, { target: { value: 'ap' } });
  await waitFor(() => expect((screen.getByLabelText(/mensagem/i) as HTMLTextAreaElement).value).toContain('Olá {{nome}}'));
});

it('mostra o mapeador só quando o template tem variáveis e bloqueia confirmação se incompleto', async () => {
  const svc = await import('sonner');
  (svc.toast.error as ReturnType<typeof vi.fn>).mockClear();
  const disp = await import('../../services/disparadorService');
  render(<DisparadorChat />);
  fireEvent.change(screen.getByPlaceholderText(/Mande uma mensagem/i), { target: { value: 'arquivados' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar prévia/i }));
  await waitFor(() => expect(screen.getByLabelText(/template aprovado/i)).toBeInTheDocument());
  // sem template escolhido → sem mapeador
  expect(screen.queryByLabelText('Variável nome')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/template aprovado/i), { target: { value: 'ap' } });
  // template 'ap' tem variável {{nome}} → mapeador aparece
  await waitFor(() => expect(screen.getByLabelText('Variável nome')).toBeInTheDocument());
  // confirma sem mapear → bloqueia
  fireEvent.click(screen.getByRole('button', { name: /confirmar e enviar/i }));
  expect((svc.toast.error as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('Mapeie todas as variáveis do template.');
  expect(disp.confirmDisparo as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
});

it('mapeada a variável, confirmDisparo recebe o variableMapping', async () => {
  const disp = await import('../../services/disparadorService');
  (disp.confirmDisparo as ReturnType<typeof vi.fn>).mockClear();
  render(<DisparadorChat />);
  fireEvent.change(screen.getByPlaceholderText(/Mande uma mensagem/i), { target: { value: 'arquivados' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar prévia/i }));
  await waitFor(() => expect(screen.getByLabelText(/template aprovado/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/template aprovado/i), { target: { value: 'ap' } });
  await waitFor(() => expect(screen.getByLabelText('Variável nome')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Variável nome'), { target: { value: 'name' } });
  fireEvent.click(screen.getByRole('button', { name: /confirmar e enviar/i }));
  await waitFor(() => expect(disp.confirmDisparo as ReturnType<typeof vi.fn>).toHaveBeenCalled());
  const args = (disp.confirmDisparo as ReturnType<typeof vi.fn>).mock.calls[0];
  // (tenantId, previewToken, message, templateName, variableMapping)
  expect(args[4]).toEqual({ nome: { type: 'lead_field', value: 'name' } });
});

it('trocar de template reseta o mapa anterior', async () => {
  render(<DisparadorChat />);
  fireEvent.change(screen.getByPlaceholderText(/Mande uma mensagem/i), { target: { value: 'arquivados' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar prévia/i }));
  await waitFor(() => expect(screen.getByLabelText(/template aprovado/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/template aprovado/i), { target: { value: 'ap' } });
  await waitFor(() => expect(screen.getByLabelText('Variável nome')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Variável nome'), { target: { value: 'name' } });
  expect((screen.getByLabelText('Variável nome') as HTMLSelectElement).value).toBe('name');
  // volta para "nenhum template" → mapeador some; reescolhe 'ap' → mapa zerado
  fireEvent.change(screen.getByLabelText(/template aprovado/i), { target: { value: '' } });
  expect(screen.queryByLabelText('Variável nome')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/template aprovado/i), { target: { value: 'ap' } });
  await waitFor(() => expect(screen.getByLabelText('Variável nome')).toBeInTheDocument());
  expect((screen.getByLabelText('Variável nome') as HTMLSelectElement).value).toBe('');
});
