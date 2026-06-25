import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TrendingUp } from 'lucide-react';
import { KpiCategorySection } from '../KpiCategorySection';
import type { CategoryColor } from '../kpiCategoryConfig';
import type { KpiSummaryCard } from '../../types';

const COLOR: CategoryColor = {
  headerBg: 'bg-emerald-50',
  headerText: 'text-emerald-700',
  headerIcon: 'text-emerald-600',
  heroValue: 'text-emerald-700',
  heroBorder: 'border-l-emerald-400',
};

const card = (over: Partial<KpiSummaryCard>): KpiSummaryCard => ({
  id: Math.random().toString(), metricKey: null, source: 'crm', unit: 'count',
  label: 'X', displayOrder: 0, rawValue: 0, displayValue: '0',
  target: null, progressPercent: null, trend: null, category: 'comercial', isFeatured: false, ...over,
});

describe('KpiCategorySection', () => {
  it('renderiza título e contagem', () => {
    render(<KpiCategorySection category="comercial" title="Comercial" icon={TrendingUp} color={COLOR}
      cards={[card({ label: 'VGV', isFeatured: true }), card({ label: 'VGC' })]} />);
    expect(screen.getByText('Comercial')).toBeInTheDocument();
    expect(screen.getByText('VGV')).toBeInTheDocument();
    expect(screen.getByText('VGC')).toBeInTheDocument();
  });

  it('aplica a cor-assinatura da categoria na faixa do cabeçalho', () => {
    render(<KpiCategorySection category="comercial" title="Comercial" icon={TrendingUp} color={COLOR}
      cards={[card({ label: 'VGV' })]} />);
    // O header é o <button> que controla o colapso; deve carregar o fundo tonal.
    const header = screen.getByRole('button', { name: /Comercial/ });
    expect(header.className).toContain('bg-emerald-50');
  });

  it('não renderiza nada quando sem cards e sem extra', () => {
    const { container } = render(<KpiCategorySection category="x" title="Vazia" icon={TrendingUp} color={COLOR} cards={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza o extra (visualização) quando fornecido', () => {
    render(<KpiCategorySection category="comercial" title="Comercial" icon={TrendingUp} color={COLOR}
      cards={[card({})]} extra={<div>FUNIL_AQUI</div>} />);
    expect(screen.getByText('FUNIL_AQUI')).toBeInTheDocument();
  });

  it('mantém o painel no DOM com atributo hidden quando fechado (aria-controls sempre resolve)', () => {
    const { container } = render(
      <KpiCategorySection category="comercial" title="Comercial" icon={TrendingUp} color={COLOR}
        cards={[card({ label: 'VGV' })]} defaultOpen={false} />
    );
    const panel = container.querySelector('[hidden]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('hidden');
    expect(panel).toHaveTextContent('VGV');
  });
});
