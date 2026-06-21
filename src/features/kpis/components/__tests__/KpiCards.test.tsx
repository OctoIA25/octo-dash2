import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCards } from '../KpiComponents';
import type { KpiSummaryCard } from '../../types';

const card: KpiSummaryCard = {
  id: 'k1', label: 'Vendas', metricKey: 'vendas', source: 'crm', unit: 'count',
  displayOrder: 0, rawValue: 8, displayValue: '8', target: 10, progressPercent: 80,
  trend: { percent: 5, positive: true },
};

describe('KpiCards', () => {
  it('mostra o valor, a meta e o progresso', () => {
    render(<KpiCards cards={[card]} isLoading={false} />);
    expect(screen.getByText('Vendas')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/Meta:/)).toHaveTextContent('10');
    expect(screen.getByText('80%')).toBeInTheDocument();
  });
  it('sem meta: não renderiza bloco de progresso', () => {
    render(<KpiCards cards={[{ ...card, id: 'k2', target: null, progressPercent: null }]} isLoading={false} />);
    expect(screen.queryByText(/Meta:/)).not.toBeInTheDocument();
  });
});
