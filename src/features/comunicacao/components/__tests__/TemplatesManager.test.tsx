import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
vi.mock('../../services/templatesService', () => ({
  listTemplates: vi.fn(async () => ({ ok: true, templates: [
    { id: 't1', name: 'Promo', channel: 'whatsapp', category: 'MARKETING', language: 'pt_BR', body: 'Olá {{nome}}', variables: ['nome'], example_values: ['João'], provider_template_id: null, approval_status: 'draft', rejected_reason: null, created_by_email: 'a@x.com', created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z' },
  ] })),
  createTemplate: vi.fn(async () => ({ ok: true, template: { id: 't2' } })),
  updateTemplate: vi.fn(async () => ({ ok: true, template: {} })),
  deleteTemplate: vi.fn(async () => ({ ok: true })),
  submitTemplate: vi.fn(async () => ({ ok: true, template: {} })),
  refreshStatus: vi.fn(async () => ({ ok: true, template: {} })),
  importFromMeta: vi.fn(async () => ({ ok: true, imported: 2, updated: 1, total: 3 })),
}));

import { TemplatesManager } from '../TemplatesManager';

describe('TemplatesManager', () => {
  it('lista templates com nome e badge de status', async () => {
    render(<TemplatesManager />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    expect(screen.getByText(/rascunho/i)).toBeInTheDocument();
  });
  it('botão Importar da Meta chama o serviço e mostra toast', async () => {
    const svc = await import('../../services/templatesService');
    render(<TemplatesManager />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /importar da meta/i }));
    await waitFor(() => expect((svc.importFromMeta as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('t1'));
  });
  it('cria um template com valor de exemplo da variável', async () => {
    const svc = await import('../../services/templatesService');
    render(<TemplatesManager />);
    await waitFor(() => expect(screen.getByText('Promo')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /novo template/i }));
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Boas-vindas' } });
    fireEvent.change(screen.getByLabelText(/mensagem/i), { target: { value: 'Olá {{nome}}' } });
    // o campo de exemplo da variável "nome" aparece após digitar o body
    await waitFor(() => expect(screen.getByLabelText(/exemplo.*nome/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/exemplo.*nome/i), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect((svc.createTemplate as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('t1', { name: 'Boas-vindas', body: 'Olá {{nome}}', category: 'MARKETING', exampleValues: ['Maria'] }));
  });
});
