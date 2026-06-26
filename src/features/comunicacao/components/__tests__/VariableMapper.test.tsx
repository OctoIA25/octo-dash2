import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VariableMapper } from '../VariableMapper';

describe('VariableMapper', () => {
  it('sem variáveis mostra a nota', () => {
    render(<VariableMapper variables={[]} mapping={{}} onChange={() => {}} />);
    expect(screen.getByText(/não usa variáveis/i)).toBeInTheDocument();
  });
  it('escolher campo do lead chama onChange', () => {
    const onChange = vi.fn();
    render(<VariableMapper variables={['1']} mapping={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/variável 1/i), { target: { value: 'name' } });
    expect(onChange).toHaveBeenCalledWith({ 1: { type: 'lead_field', value: 'name' } });
  });
  it('escolher valor fixo revela o input de texto', () => {
    const onChange = vi.fn();
    render(<VariableMapper variables={['1']} mapping={{ 1: { type: 'fixed', value: '' } }} onChange={onChange} />);
    expect(screen.getByLabelText(/texto fixo 1/i)).toBeInTheDocument();
  });
});
