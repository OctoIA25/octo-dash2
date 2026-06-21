/**
 * Regras puras dos KPIs configuráveis: validação de rascunho e cálculo de
 * progresso. Sem React, sem Supabase — 100% testável (molde de metas/models).
 */
import { NATIVE_METRIC_KEYS } from './kpiTypes';
import type { DashboardKpiDraft } from './kpiTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Valida um rascunho. Retorna mensagens de erro (vazio = válido). */
export function validateKpiDraft(draft: DashboardKpiDraft): string[] {
  const errors: string[] = [];
  if (!draft.name || draft.name.trim() === '') {
    errors.push('Nome é obrigatório.');
  }

  if (draft.source === 'crm') {
    if (!draft.metricKey) {
      errors.push('KPI do CRM exige uma métrica de origem.');
    } else if (!NATIVE_METRIC_KEYS.includes(draft.metricKey as never)) {
      errors.push('Métrica de origem desconhecida.');
    }
  } else if (draft.metricKey) {
    errors.push('Apenas KPIs do CRM usam métrica de origem.');
  }
  return errors;
}

/** Progresso de uma meta: percent clampeado 0–100; rawPercent bruto. */
export function resolveProgress(
  target: number | null,
  realized: number | null,
): { percent: number; rawPercent: number } {
  if (!target || target <= 0 || realized == null) {
    return { percent: 0, rawPercent: 0 };
  }
  const rawPercent = Math.round((realized / target) * 100 * 10) / 10;
  return { percent: clampPercent(rawPercent), rawPercent };
}
