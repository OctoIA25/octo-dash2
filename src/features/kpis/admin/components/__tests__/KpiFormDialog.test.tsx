import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KpiFormDialog } from '../KpiFormDialog';

describe('KpiFormDialog', () => {
  it('bloqueia submit sem nome', async () => {
    const onSubmit = vi.fn();
    render(<KpiFormDialog open kpi={null} isSubmitting={false} onOpenChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });
  it('com nome, submete o draft', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<KpiFormDialog open kpi={null} isSubmitting={false} onOpenChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Meu KPI' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Meu KPI', source: 'manual', metricKey: null })));
  });
});
