import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KpiHeroCard, KpiCompactCard } from '../KpiComponents';
import type { KpiSummaryCard } from '../../types';

const base: KpiSummaryCard = {
  id: 'k1', metricKey: 'vgv', source: 'crm', unit: 'currency',
  label: 'VGV Gerado', displayOrder: 0, rawValue: 2430000, displayValue: 'R$ 2.430.000',
  target: null, progressPercent: null, trend: { percent: 12, positive: true },
  category: 'comercial', isFeatured: true,
};

describe('KpiHeroCard', () => {
  it('mostra label e valor formatado', () => {
    render(<KpiHeroCard card={base} />);
    expect(screen.getByText('VGV Gerado')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.430.000')).toBeInTheDocument();
  });
  it('mostra selo de origem para manual', () => {
    render(<KpiHeroCard card={{ ...base, source: 'manual' }} />);
    expect(screen.getByText(/manual/i)).toBeInTheDocument();
  });
  it('NÃO mostra selo para crm', () => {
    render(<KpiHeroCard card={base} />);
    expect(screen.queryByText(/manual|planilha/i)).not.toBeInTheDocument();
  });
  it('aplica a cor da categoria no número quando fornecida', () => {
    render(<KpiHeroCard card={base} valueColor="text-emerald-700" borderColor="border-l-emerald-400" />);
    expect(screen.getByText('R$ 2.430.000').className).toContain('text-emerald-700');
  });
  it('sem comparação (trend nulo): não renderiza o texto "sem comparação"', () => {
    render(<KpiHeroCard card={{ ...base, trend: null }} />);
    expect(screen.queryByText(/sem comparação/i)).not.toBeInTheDocument();
  });
});

describe('KpiCompactCard', () => {
  it('mostra label e valor', () => {
    render(<KpiCompactCard card={{ ...base, label: 'VGC', displayValue: 'R$ 243.000' }} />);
    expect(screen.getByText('VGC')).toBeInTheDocument();
    expect(screen.getByText('R$ 243.000')).toBeInTheDocument();
  });
});

describe('KpiHeroCard — barra de progresso', () => {
  it('clamp: progressPercent > 100 renderiza barra com width 100%', () => {
    const cardComMeta: KpiSummaryCard = {
      ...base,
      target: 1000000,
      progressPercent: 150,
    };
    const { container } = render(<KpiHeroCard card={cardComMeta} />);
    const bar = container.querySelector('.bg-emerald-500');
    expect(bar).not.toBeNull();
    expect((bar as HTMLElement).style.width).toBe('100%');
  });
});
