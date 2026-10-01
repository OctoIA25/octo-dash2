/**
 * A.1 · Super Meta — os quatro "pronto quando" do Manual que moram na tela.
 * (O quinto, "o evento aparece uma única vez no extrato", é do banco:
 * supabase/tests/super_meta.test.sql.)
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { validateGoalDraft } from '../models';
import { buildGoalView } from '../metrics';
import { createEmptyDraft, changeDraftModel } from '../factory';
import { describeSuperMeta } from '../format';
import { GoalCard } from '../../components/GoalCard';
import type { Goal } from '../types';

const HOJE = '2026-11-15';

const meta = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1', tenantId: 't1', name: 'VGC Q4 · Humberto', categoryId: 'vgc', model: 'simple',
  description: '', status: 'active', startDate: '2026-10-01', endDate: '2026-12-31',
  ownerName: 'Humberto', targetValue: 45000, currentValue: 0, unit: 'currency',
  source: 'crm', scope: 'individual', isFeatured: false, config: { kind: 'simple' },
  createdAt: HOJE, updatedAt: HOJE, superTarget: 60000, ...o,
});

const nada = () => undefined;
const cartao = (g: Goal) => render(
  <GoalCard view={buildGoalView(g, HOJE)} canManage={false} onEdit={nada} onToggleStatus={nada}
    onToggleFeatured={nada} onDelete={nada} onViewHistory={nada} />,
);

describe('A.1 · Super Meta', () => {
  it('meta sem super meta é a de hoje: nenhum elemento novo', () => {
    const view = buildGoalView(meta({ superTarget: null, currentValue: 50000 }), HOJE);
    expect(view.superMeta).toBeNull();
    cartao(meta({ superTarget: null, currentValue: 50000 }));
    expect(screen.queryByText(/Super Meta/)).toBeNull();
    expect(screen.queryByTestId('marcador-da-meta')).toBeNull();
  });

  it('com super meta, em 60%, não mostra nada sobre super meta', () => {
    const g = meta({ currentValue: 27000 });
    expect(buildGoalView(g, HOJE).superMeta).toBeNull();
    cartao(g);
    expect(screen.queryByText(/Super Meta/)).toBeNull();
    expect(screen.queryByTestId('marcador-da-meta')).toBeNull();
  });

  it('ao passar de 100%, aparecem o segundo marcador e o texto — sem recarregar nada além do valor', () => {
    const view = buildGoalView(meta({ currentValue: 50000 }), HOJE);
    expect(view.superMeta).toMatchObject({ target: 60000, remaining: 10000, reached: false, metaMarkerPercent: 75 });
    cartao(meta({ currentValue: 50000 }));
    expect(screen.getByText(/meta batida · faltam R\$\s?10\.000 para a Super Meta/)).toBeInTheDocument();
    expect(screen.getByTestId('marcador-da-meta')).toHaveStyle({ left: '75%' });
  });

  it('super meta batida diz isso, e não "faltam R$ 0"', () => {
    const view = buildGoalView(meta({ currentValue: 61000 }), HOJE);
    expect(view.superMeta?.reached).toBe(true);
    expect(describeSuperMeta(view.superMeta!, 'currency')).toBe('Super Meta batida');
  });

  it('o formulário recusa super meta menor ou igual ao alvo', () => {
    const rascunho = { ...createEmptyDraft(HOJE), name: 'X', targetValue: 45000 };
    expect(validateGoalDraft({ ...rascunho, superTarget: 45000 })).toContain('A Super Meta precisa ser maior que o valor alvo.');
    expect(validateGoalDraft({ ...rascunho, superTarget: 60000 })).not.toContain('A Super Meta precisa ser maior que o valor alvo.');
    expect(validateGoalDraft({ ...rascunho, superTarget: null })).not.toContain('A Super Meta precisa ser maior que o valor alvo.');
  });

  it('trocar para meta escalonada descarta a super meta (o banco a recusaria)', () => {
    const rascunho = { ...createEmptyDraft(HOJE), superTarget: 60000 };
    expect(changeDraftModel(rascunho, 'scaled').superTarget).toBeNull();
    expect(buildGoalView(meta({ model: 'scaled', currentValue: 999999 }), HOJE).superMeta).toBeNull();
  });
});
