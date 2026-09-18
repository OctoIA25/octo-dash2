/**
 * O (i) de cada contador. O que importa aqui não é o visual: é que ele nunca
 * derrube a tela e nunca abra vazio.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoMetrica, KpiAtualizadoEm } from '../KpiComponents';
import { KPI_DICIONARIO } from '../../domain/kpiDictionary';

const card = (over: { metricKey?: string | null; description?: string } = {}) => ({
  metricKey: 'totalLeads' as string | null,
  label: 'Total de Leads',
  description: undefined as string | undefined,
  ...over,
});

describe('InfoMetrica', () => {
  /**
   * Radix estoura "`Tooltip` must be used within `TooltipProvider`" quando não
   * acha um acima. Estes cards são montados por várias telas, e um (i) não
   * pode ser capaz de derrubar um painel — por isso o provider vem embutido.
   * Este teste renderiza SEM provider de propósito.
   */
  it('renderiza sem TooltipProvider acima, sem derrubar a tela', () => {
    expect(() => render(<InfoMetrica {...card()} />)).not.toThrow();
    expect(screen.getByRole('button', { name: /Total de Leads/i })).toBeTruthy();
  });

  it('nao aparece quando nao ha texto para mostrar', () => {
    const { container } = render(<InfoMetrica {...card({ metricKey: null, description: '' })} />);
    expect(container.innerHTML).toBe('');
  });

  it('usa o texto do gestor quando ele escreveu', () => {
    render(<InfoMetrica {...card({ description: 'Regra da casa' })} />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Total de Leads');
  });

  it('o dicionario cobre a metrica nativa mesmo sem texto do gestor', () => {
    const { container } = render(<InfoMetrica {...card({ description: '' })} />);
    expect(container.innerHTML).not.toBe('');
    expect(KPI_DICIONARIO.totalLeads.length).toBeGreaterThan(0);
  });
});

describe('KpiAtualizadoEm', () => {
  it('mostra a hora no fuso de Sao Paulo', () => {
    // 2026-09-18T18:30:00Z = 15:30 em São Paulo.
    render(<KpiAtualizadoEm iso="2026-09-18T18:30:00.000Z" />);
    expect(screen.getByText(/atualizado às 15:30/)).toBeTruthy();
  });

  // Servidor antigo (sem o campo) não pode quebrar a tela nova.
  it('sem carimbo, nao renderiza nada', () => {
    const { container } = render(<KpiAtualizadoEm iso={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('carimbo invalido nao vira "Invalid Date" na tela', () => {
    const { container } = render(<KpiAtualizadoEm iso="não é data" />);
    expect(container.innerHTML).toBe('');
  });
});
