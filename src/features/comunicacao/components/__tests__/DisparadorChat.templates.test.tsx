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
  confirmDisparo: vi.fn(), getRunReport: vi.fn(),
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
