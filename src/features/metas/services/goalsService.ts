/**
 * Camada de acesso a dados das Metas (Supabase).
 *
 * Responsabilidades:
 *  - traduzir entre o formato do banco (snake_case) e o domínio (camelCase);
 *  - aplicar o isolamento por tenant em toda operação;
 *  - registrar o histórico de alterações.
 *
 * Não contém regra de negócio de progresso — isso vive no domínio.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Goal, GoalConfig, GoalDraft, GoalHistoryEntry } from '../domain/types';

const GOALS_TABLE = 'goals';
const HISTORY_TABLE = 'goal_history';

interface GoalRow {
  id: string;
  tenant_id: string;
  name: string;
  category_id: string;
  model: Goal['model'];
  description: string;
  status: Goal['status'];
  start_date: string;
  end_date: string;
  owner_name: string;
  target_value: number | string;
  current_value: number | string;
  unit: Goal['unit'];
  source: Goal['source'];
  scope: Goal['scope'];
  is_featured: boolean;
  config: GoalConfig | Record<string, never>;
  created_at: string;
  updated_at: string;
}

interface GoalHistoryRow {
  id: string;
  goal_id: string;
  changed_by_name: string;
  change_type: string;
  summary: string;
  created_at: string;
}

interface ActorContext {
  tenantId: string;
  actorName: string;
}

// ---------------------------------------------------------------------------
// Mapeamento DB <-> domínio
// ---------------------------------------------------------------------------

function toNumber(value: number | string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Garante uma config coerente com o modelo (defensivo contra dados antigos). */
function normalizeConfig(model: Goal['model'], config: GoalRow['config']): GoalConfig {
  if (config && 'kind' in config && config.kind) return config as GoalConfig;
  switch (model) {
    case 'scaled':
      return { kind: 'scaled', levels: [] };
    case 'custom':
      return { kind: 'custom', objective: '', unitLabel: '', milestones: [], successCriteria: '' };
    case 'simple':
    default:
      return { kind: 'simple' };
  }
}

function mapRowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    categoryId: row.category_id,
    model: row.model,
    description: row.description ?? '',
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    ownerName: row.owner_name ?? '',
    targetValue: toNumber(row.target_value),
    currentValue: toNumber(row.current_value),
    unit: row.unit,
    source: row.source ?? 'manual',
    scope: row.scope ?? 'team',
    isFeatured: row.is_featured ?? false,
    config: normalizeConfig(row.model, row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDraftToRow(draft: GoalDraft, tenantId: string) {
  return {
    tenant_id: tenantId,
    name: draft.name.trim(),
    category_id: draft.categoryId,
    model: draft.model,
    description: draft.description.trim(),
    status: draft.status,
    start_date: draft.startDate,
    end_date: draft.endDate,
    owner_name: draft.ownerName.trim(),
    target_value: draft.targetValue,
    current_value: draft.currentValue,
    unit: draft.unit,
    source: draft.source,
    scope: draft.scope,
    config: draft.config,
  };
}

function mapHistoryRow(row: GoalHistoryRow): GoalHistoryEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    changedByName: row.changed_by_name ?? '',
    changeType: row.change_type,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

/** Resume as diferenças relevantes entre duas versões de uma meta. */
function describeChanges(previous: Goal, draft: GoalDraft): string {
  const parts: string[] = [];
  if (previous.status !== draft.status) {
    parts.push(draft.status === 'active' ? 'Ativada' : 'Desativada');
  }
  if (previous.currentValue !== draft.currentValue) {
    parts.push(`progresso ${previous.currentValue} → ${draft.currentValue}`);
  }
  if (previous.targetValue !== draft.targetValue) {
    parts.push(`alvo ${previous.targetValue} → ${draft.targetValue}`);
  }
  if (previous.name !== draft.name.trim()) parts.push('Nome alterado');
  if (previous.endDate !== draft.endDate) parts.push('Prazo alterado');
  return parts.length > 0 ? parts.join('; ') : 'Detalhes atualizados';
}

async function recordHistory(
  goalId: string,
  context: ActorContext,
  changeType: string,
  summary: string,
): Promise<void> {
  const { error } = await supabase.from(HISTORY_TABLE).insert({
    goal_id: goalId,
    tenant_id: context.tenantId,
    changed_by_name: context.actorName,
    change_type: changeType,
    summary,
  });
  // Histórico é auxiliar: falha aqui não deve quebrar a operação principal.
  if (error) console.warn('[goalsService] Falha ao registrar histórico:', error.message);
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function fetchGoals(tenantId: string): Promise<Goal[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[goalsService] Erro ao buscar metas:', error.message);
    throw new Error('Não foi possível carregar as metas.');
  }
  return (data as GoalRow[]).map(mapRowToGoal);
}

export async function fetchGoalHistory(goalId: string): Promise<GoalHistoryEntry[]> {
  if (!goalId) return [];
  const { data, error } = await supabase
    .from(HISTORY_TABLE)
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[goalsService] Erro ao buscar histórico:', error.message);
    return [];
  }
  return (data as GoalHistoryRow[]).map(mapHistoryRow);
}

export async function createGoal(draft: GoalDraft, context: ActorContext): Promise<Goal> {
  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .insert(mapDraftToRow(draft, context.tenantId))
    .select('*')
    .single();

  if (error || !data) {
    console.error('[goalsService] Erro ao criar meta:', error?.message);
    throw new Error('Não foi possível criar a meta.');
  }

  const goal = mapRowToGoal(data as GoalRow);
  await recordHistory(goal.id, context, 'created', 'Meta criada');
  return goal;
}

export async function updateGoal(
  id: string,
  previous: Goal,
  draft: GoalDraft,
  context: ActorContext,
): Promise<Goal> {
  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .update(mapDraftToRow(draft, context.tenantId))
    .eq('id', id)
    .eq('tenant_id', context.tenantId)
    .select('*')
    .single();

  if (error || !data) {
    console.error('[goalsService] Erro ao atualizar meta:', error?.message);
    throw new Error('Não foi possível atualizar a meta.');
  }

  const goal = mapRowToGoal(data as GoalRow);
  const statusChanged = previous.status !== draft.status;
  await recordHistory(
    goal.id,
    context,
    statusChanged ? 'status_changed' : 'updated',
    describeChanges(previous, draft),
  );
  return goal;
}

export async function deleteGoal(id: string, tenantId: string): Promise<void> {
  const { error } = await supabase
    .from(GOALS_TABLE)
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[goalsService] Erro ao excluir meta:', error.message);
    throw new Error('Não foi possível excluir a meta.');
  }
}

// ---------------------------------------------------------------------------
// Meta destacada (tela inicial)
// ---------------------------------------------------------------------------

/** Retorna a meta destacada do tenant (ou null). */
export async function fetchFeaturedGoal(tenantId: string): Promise<Goal | null> {
  if (!tenantId) return null;
  const { data, error } = await supabase
    .from(GOALS_TABLE)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_featured', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[goalsService] Erro ao buscar meta destacada:', error.message);
    return null;
  }
  return data ? mapRowToGoal(data as GoalRow) : null;
}

/**
 * Define a meta destacada do tenant, garantindo unicidade: remove o
 * destaque anterior antes de aplicar o novo (o índice único parcial no
 * banco também protege contra concorrência).
 */
export async function setFeaturedGoal(tenantId: string, goalId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from(GOALS_TABLE)
    .update({ is_featured: false })
    .eq('tenant_id', tenantId)
    .eq('is_featured', true);

  if (clearError) {
    console.error('[goalsService] Erro ao limpar destaque:', clearError.message);
    throw new Error('Não foi possível atualizar o destaque.');
  }

  const { error } = await supabase
    .from(GOALS_TABLE)
    .update({ is_featured: true })
    .eq('id', goalId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[goalsService] Erro ao destacar meta:', error.message);
    throw new Error('Não foi possível destacar a meta.');
  }
}

/** Remove o destaque de uma meta. */
export async function unsetFeaturedGoal(tenantId: string, goalId: string): Promise<void> {
  const { error } = await supabase
    .from(GOALS_TABLE)
    .update({ is_featured: false })
    .eq('id', goalId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[goalsService] Erro ao remover destaque:', error.message);
    throw new Error('Não foi possível remover o destaque.');
  }
}

// ---------------------------------------------------------------------------
// Sincronização do valor realizado (auto-update via CRM)
// ---------------------------------------------------------------------------

/**
 * Atualiza apenas o valor realizado de uma meta (usado pela sincronização
 * automática com o CRM) e registra no histórico.
 */
export async function updateGoalCurrentValue(
  id: string,
  value: number,
  context: ActorContext,
): Promise<void> {
  const { error } = await supabase
    .from(GOALS_TABLE)
    .update({ current_value: value })
    .eq('id', id)
    .eq('tenant_id', context.tenantId);

  if (error) {
    console.error('[goalsService] Erro ao sincronizar valor:', error.message);
    throw new Error('Não foi possível sincronizar o valor da meta.');
  }

  await recordHistory(id, context, 'progress_synced', `Progresso sincronizado: ${value}`);
}
