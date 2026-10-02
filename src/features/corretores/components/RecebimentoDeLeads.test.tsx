import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecebimentoDeLeads } from './RecebimentoDeLeads';

describe('RecebimentoDeLeads', () => {
  it('Bloqueado grava receives_auto_leads=false com motivo pausa, sem perder o resto do limite', () => {
    const onChange = vi.fn();
    render(<RecebimentoDeLeads nome="t" valor={{ limit_exempt: true }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/bloqueado para receber leads/i));
    expect(onChange).toHaveBeenCalledWith({ limit_exempt: true, receives_auto_leads: false, motivo: 'pausa' });
  });

  it('Liberado limpa o bloqueio e o motivo', () => {
    const onChange = vi.fn();
    render(<RecebimentoDeLeads nome="t" valor={{ receives_auto_leads: false, motivo: 'captador' }} onChange={onChange} />);
    expect(screen.getByText('Captador')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/liberado para receber leads/i));
    expect(onChange).toHaveBeenCalledWith({ receives_auto_leads: undefined, motivo: undefined });
  });
});
