import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1' }) }));
vi.mock('../../services/audiencesService', () => ({
  listAudiences: vi.fn(async () => ({ ok: true, audiences: [
    { id: 'a1', name: 'Arquivados', segment: { type: 'archived' }, created_by_email: 'a@x.com', created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z' },
  ] })),
  createAudience: vi.fn(async () => ({ ok: true, audience: { id: 'a2' } })),
  updateAudience: vi.fn(async () => ({ ok: true, audience: {} })),
  deleteAudience: vi.fn(async () => ({ ok: true })),
  getAudienceCount: vi.fn(async () => ({ ok: true, count: 42 })),
}));

import { PublicosManager } from '../PublicosManager';

describe('PublicosManager', () => {
  it('lista os públicos com descrição legível', async () => {
    render(<PublicosManager />);
    await waitFor(() => expect(screen.getByText('Arquivados')).toBeInTheDocument());
    expect(screen.getByText(/clientes arquivados/i)).toBeInTheDocument();
  });

  it('cria um público via formulário guiado', async () => {
    const svc = await import('../../services/audiencesService');
    render(<PublicosManager />);
    await waitFor(() => expect(screen.getByText('Arquivados')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /novo público/i }));
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Sem contato' } });
    fireEvent.change(screen.getByLabelText(/tipo de filtro/i), { target: { value: 'no_contact' } });
    fireEvent.change(screen.getByLabelText(/dias/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect((svc.createAudience as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('t1', { name: 'Sem contato', segment: { type: 'no_contact', days: 15 } }));
  });

  it('editar pré-popula o form e chama updateAudience', async () => {
    const svc = await import('../../services/audiencesService');
    (svc.updateAudience as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, audience: { id: 'a1' } });
    render(<PublicosManager />);
    await waitFor(() => expect(screen.getByText('Arquivados')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /editar arquivados/i }));
    // nome pré-populado
    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe('Arquivados');
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Arquivados v2' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect((svc.updateAudience as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('t1', 'a1', { name: 'Arquivados v2', segment: { type: 'archived' } }));
  });
});
