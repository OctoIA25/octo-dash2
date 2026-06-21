/**
 * Persistência da importação de metas/realizado, com DRY-RUN.
 *
 * Fluxo (passo 5 do wizard):
 *   resolvePlan (puro) → preview do que SERIA gravado (creates/updates).
 *   persistImport(dryRun:false) → grava o batch (auditoria), cria KPIs novos e
 *   faz upsert idempotente das metas/realizado com batch_id.
 *
 * NÃO é transacional (são múltiplas chamadas ao PostgREST). Mitigações p/ falha
 * parcial: (a) os upserts são IDEMPOTENTES (re-rodar completa o que faltou);
 * (b) a criação de KPI é RETRY-SAFE — relê o estado atual e reaproveita KPIs já
 * criados em vez de duplicar; (c) cada linha carrega batch_id, então reverter um
 * import = deletar o batch (cascade nas metas/realizado daquele batch).
 */
import { supabase } from '@/integrations/supabase/client';
import type { ImportPlan, ImportPreview } from '@/features/kpis/admin/import/targetMapping';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';
import { createKpi, fetchKpis } from './kpiAdminService';
import { upsertTarget, upsertValue } from './kpiTargetsService';

export interface ResolvedPlan {
  creates: Array<{ kpiName: string }>;
  updates: Array<{ kpiName: string; periodStart: string; value: number }>;
  conflicts: string[];
  ignored: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Classifica o plano contra os KPIs existentes. PURO (base do dry-run). */
export function resolvePlan(plan: ImportPlan, existingKpis: DashboardKpi[], _target: 'target' | 'value'): ResolvedPlan {
  const byName = new Map(existingKpis.map((k) => [norm(k.name), k]));
  const creatingNames = new Set<string>();
  const creates: ResolvedPlan['creates'] = [];
  const updates: ResolvedPlan['updates'] = [];

  for (const row of plan.rows) {
    const exists = byName.has(norm(row.kpiName));
    if (!exists && !creatingNames.has(norm(row.kpiName))) {
      creatingNames.add(norm(row.kpiName));
      creates.push({ kpiName: row.kpiName });
    }
    updates.push({ kpiName: row.kpiName, periodStart: row.periodStart, value: row.value });
  }
  return { creates, updates, conflicts: [], ignored: plan.ignoredColumns };
}

export async function persistImport(input: {
  plan: ImportPlan;
  mapping: { target: 'target' | 'value' };
  tenantId: string;
  actor: { id: string; name: string };
  fileName: string;
  sheetName: string;
  /** Interpretação congelada do Preview (auditabilidade): colunas/tipos/períodos/avisos. */
  preview: ImportPreview;
  dryRun: boolean;
  existingKpis: DashboardKpi[];
}): Promise<ResolvedPlan> {
  const resolved = resolvePlan(input.plan, input.existingKpis, input.mapping.target);
  if (input.dryRun) return resolved;

  // 1) Cria o batch (auditoria/versão) — inclui a interpretação do Preview.
  const { data: batch, error: batchErr } = await supabase.from('kpi_import_batches').insert({
    tenant_id: input.tenantId, nome_arquivo: input.fileName, sheet_name: input.sheetName,
    mapping: input.mapping, preview: input.preview, rows_created: resolved.creates.length,
    rows_updated: resolved.updates.length, rows_ignored: resolved.ignored.length,
    imported_by: input.actor.id, imported_by_name: input.actor.name,
  }).select('id').single();
  if (batchErr || !batch) throw new Error('Não foi possível registrar a importação.');

  // 2) Garante os KPIs (cria os novos como source='planilha').
  // RETRY-SAFE: relemos o estado ATUAL do banco (não confiamos só no snapshot
  // `existingKpis` do chamador). Assim, se um run anterior falhou DEPOIS de criar
  // alguns KPIs, este run os reaproveita em vez de duplicar (não há unique em name).
  const liveKpis = await fetchKpis(input.tenantId);
  const idByName = new Map(liveKpis.map((k) => [norm(k.name), k.id]));
  for (const c of resolved.creates) {
    if (idByName.has(norm(c.kpiName))) continue; // já existe (inclusive de retry) → não duplica
    const created = await createKpi(
      { name: c.kpiName, description: '', categoryId: 'geral', unit: 'count', source: 'planilha', metricKey: null, status: 'active', isVisible: true, displayOrder: 0, config: {} },
      { tenantId: input.tenantId, actorName: input.actor.name },
    );
    idByName.set(norm(c.kpiName), created.id);
  }

  // 3) Upsert de metas/realizado com batch_id (idempotente por período).
  for (const row of input.plan.rows) {
    const kpiId = idByName.get(norm(row.kpiName));
    if (!kpiId) continue;
    const common = { kpiId, tenantId: input.tenantId, periodType: row.periodType, periodStart: row.periodStart, source: 'import' as const, batchId: batch.id };
    if (input.mapping.target === 'target') await upsertTarget({ ...common, targetValue: row.value });
    else await upsertValue({ ...common, value: row.value });
  }
  return resolved;
}
