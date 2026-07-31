/**
 * Orquestra a integração Anthropic: config → client → cálculo → snapshot.
 * Uma função por passo (sem monólito). O scheduler chama getWeeklyUsage por
 * tenant; a rota da UI lê o snapshot já persistido. Denominador do percentual
 * = ANTHROPIC_WEEKLY_BUDGET_USD (env global); limiar = alertThresholdBps (tenant).
 */
import { loadAnthropicEnv } from './config.js';
import { fetchCostReport, AnthropicApiError } from './client.js';
import { createAnthropicConfigResolver } from './configResolver.js';
import { sumCostUsd, computePercentage, classifyState, buildUsageDto } from './usage.js';

const TABLE = 'tenant_anthropic_config';

/** Janela de 7 dias: startsAt no início do dia UTC de (now − 7d); endsAt = now. */
export function weekWindow(now = Date.now()) {
  const end = new Date(now);
  const startDay = new Date(now - 7 * 24 * 60 * 60 * 1000);
  startDay.setUTCHours(0, 0, 0, 0);
  return { startsAt: startDay.toISOString(), endsAt: end.toISOString() };
}

export function createAnthropicService({ supabase, resolver, clientImpl = fetchCostReport, processEnv = process.env, now = Date.now }) {
  const env = loadAnthropicEnv(processEnv);
  const cfgResolver = resolver || createAnthropicConfigResolver({ supabase, processEnv, now });

  async function persistSnapshot(tenantId, dto) {
    const { error } = await supabase.from(TABLE).upsert({
      tenant_id: tenantId,
      status: dto.status,
      last_usage_usd: dto.usage.current,
      last_percentage: dto.usage.percentage,
      last_window_start: dto.window.startsAt,
      last_window_end: dto.window.endsAt,
      last_state: dto.status,
      last_error: null, // preenchido só no ramo de erro abaixo
      last_synced_at: dto.fetchedAt,
      updated_at: new Date().toISOString(),
      weekly_limit_usd: dto.usage.limit, // repurpose: denominador usado (env) p/ o card do Status
    }, { onConflict: 'tenant_id' });
    if (error) console.error(`[anthropic] persistSnapshot falhou tenant=${tenantId}: ${error.message}`);
  }

  async function persistError(tenantId, dto, errorCode) {
    const { error } = await supabase.from(TABLE).upsert({
      tenant_id: tenantId, status: dto.status, last_state: dto.status,
      last_window_start: dto.window.startsAt, last_window_end: dto.window.endsAt,
      last_error: errorCode, last_synced_at: dto.fetchedAt, updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
    if (error) console.error(`[anthropic] persistError falhou tenant=${tenantId}: ${error.message}`);
  }

  async function getWeeklyUsage(tenantId) {
    const window = weekWindow(now());
    const fetchedAt = new Date(now()).toISOString();
    const cfg = await cfgResolver.resolveConfig(tenantId);

    // Tenant no modo MAX: o snapshot pertence ao ingest (reporter). Recalcular
    // aqui (rotas /usage e /refresh, ou um tick que escapou do filtro do
    // scheduler) apagaria o % da assinatura e re-armaria o dedup do alerta.
    // Devolve um espelho do snapshot persistido, SEM persistir nada.
    if (cfg?.mode === 'max') {
      const { data: row } = await supabase
        .from(TABLE)
        .select('last_state,last_percentage,last_window_start,last_window_end,last_synced_at')
        .eq('tenant_id', tenantId).maybeSingle();
      return buildUsageDto({
        current: null, limit: null,
        percentage: row?.last_percentage == null ? null : Number(row.last_percentage),
        state: row?.last_state ?? 'not_configured',
        window: { startsAt: row?.last_window_start ?? null, endsAt: row?.last_window_end ?? null },
        fetchedAt: row?.last_synced_at ?? fetchedAt,
      });
    }

    const hasKey = Boolean(cfg?.apiKey);
    const hasBudget = env.budgetUsd > 0;
    const thresholdBps = cfg?.alertThresholdBps ?? 1430;

    if (!hasKey || !hasBudget) {
      const state = classifyState({ hasKey, hasBudget, errorCode: null, percentage: null, thresholdBps });
      const dto = buildUsageDto({ current: null, limit: hasBudget ? env.budgetUsd : null, percentage: null, state, window, fetchedAt });
      await persistSnapshot(tenantId, dto);
      return dto;
    }

    let buckets;
    try {
      buckets = await clientImpl({ apiKey: cfg.apiKey, startingAt: window.startsAt, endingAt: window.endsAt });
    } catch (err) {
      const code = err instanceof AnthropicApiError ? err.code : 'provider_error';
      const state = classifyState({ hasKey, hasBudget, errorCode: code, percentage: null, thresholdBps });
      const dto = buildUsageDto({ current: null, limit: env.budgetUsd, percentage: null, state, window, fetchedAt });
      await persistError(tenantId, dto, code);
      return dto;
    }

    const current = sumCostUsd(buckets);
    const percentage = computePercentage(current, env.budgetUsd);
    const state = classifyState({ hasKey, hasBudget, errorCode: null, percentage, thresholdBps });
    const dto = buildUsageDto({ current, limit: env.budgetUsd, percentage, state, window, fetchedAt });
    await persistSnapshot(tenantId, dto);
    return dto;
  }

  return { getWeeklyUsage, persistSnapshot };
}
