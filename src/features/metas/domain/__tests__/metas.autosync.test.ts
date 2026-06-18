import { describe, expect, it, vi } from 'vitest';

// O registry de fontes importa o client do Supabase; mockamos para manter
// o teste puro (sem rede) e focado na consistência/regras.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { GOAL_CATEGORIES } from '../categories';
import { createEmptyDraft, applyCategoryDefaults } from '../factory';
import { autoSyncableCategoryIds, getMetricSource } from '../../services/metricSources';
import { isAutoSyncGoal } from '../../services/goalsSyncService';
import type { Goal } from '../types';

describe('consistência categorias <-> fontes de métrica', () => {
  it('toda categoria com supportsAutoSync possui uma fonte registrada', () => {
    GOAL_CATEGORIES.filter((c) => c.supportsAutoSync).forEach((category) => {
      expect(getMetricSource(category.id), `fonte ausente para ${category.id}`).toBeDefined();
    });
  });

  it('toda fonte registrada corresponde a uma categoria com supportsAutoSync', () => {
    const supported = new Set(GOAL_CATEGORIES.filter((c) => c.supportsAutoSync).map((c) => c.id));
    autoSyncableCategoryIds().forEach((id) => {
      expect(supported.has(id), `categoria ${id} deveria ter supportsAutoSync`).toBe(true);
    });
  });

  it('VGC possui fonte automática (commercial_sales)', () => {
    expect(getMetricSource('vgc')).toBeDefined();
  });
});

describe('factory: source e scope', () => {
  it('createEmptyDraft usa defaults manual/team', () => {
    const draft = createEmptyDraft('2026-06-15');
    expect(draft.source).toBe('manual');
    expect(draft.scope).toBe('team');
  });

  it('applyCategoryDefaults reverte source para manual em categoria sem auto-sync', () => {
    const draft = { ...createEmptyDraft('2026-06-15'), source: 'crm' as const, categoryId: 'vgv' };
    const updated = applyCategoryDefaults(draft, 'categoria-personalizada'); // sem fonte -> manual
    expect(updated.source).toBe('manual');
  });

  it('applyCategoryDefaults preserva source crm em categoria com auto-sync', () => {
    const draft = { ...createEmptyDraft('2026-06-15'), source: 'crm' as const };
    const updated = applyCategoryDefaults(draft, 'captacao');
    expect(updated.source).toBe('crm');
  });
});

describe('isAutoSyncGoal', () => {
  const base: Goal = {
    id: 'g', tenantId: 't', name: 'n', categoryId: 'vgv', model: 'simple',
    description: '', status: 'active', startDate: '2026-01-01', endDate: '2026-12-31',
    ownerName: '', targetValue: 100, currentValue: 0, unit: 'currency',
    source: 'crm', scope: 'team', isFeatured: false, config: { kind: 'simple' },
    createdAt: '', updatedAt: '',
  };

  it('verdadeiro para meta crm com categoria que tem fonte', () => {
    expect(isAutoSyncGoal(base)).toBe(true);
  });

  it('falso para meta manual', () => {
    expect(isAutoSyncGoal({ ...base, source: 'manual' })).toBe(false);
  });

  it('falso para categoria sem fonte mesmo se crm', () => {
    expect(isAutoSyncGoal({ ...base, categoryId: 'categoria-sem-fonte' })).toBe(false);
  });
});
