/**
 * Orquestra a integração Anthropic: config → client → cálculo → snapshot.
 * Uma função por passo (sem monólito). O scheduler chama getWeeklyUsage por
 * tenant; a rota da UI lê o snapshot já persistido.
 */
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
    const hasKey = Boolean(cfg?.apiKey);
    const hasLimit = Number.isFinite(Number(cfg?.weeklyLimitUsd)) && Number(cfg.weeklyLimitUsd) > 0;

    if (!hasKey || !hasLimit) {
      const state = classifyState({ hasKey, hasLimit, errorCode: null, percentage: null });
      const dto = buildUsageDto({ current: null, limit: cfg?.weeklyLimitUsd ?? null, percentage: null, state, window, fetchedAt });
      await persistSnapshot(tenantId, dto);
      return dto;
    }

    let buckets;
    try {
      buckets = await clientImpl({ apiKey: cfg.apiKey, startingAt: window.startsAt, endingAt: window.endsAt });
    } catch (err) {
      const code = err instanceof AnthropicApiError ? err.code : 'provider_error';
      const state = classifyState({ hasKey, hasLimit, errorCode: code, percentage: null });
      const dto = buildUsageDto({ current: null, limit: cfg.weeklyLimitUsd, percentage: null, state, window, fetchedAt });
      await persistError(tenantId, dto, code);
      return dto;
    }

    const current = sumCostUsd(buckets);
    const percentage = computePercentage(current, cfg.weeklyLimitUsd);
    const state = classifyState({ hasKey, hasLimit, errorCode: null, percentage });
    const dto = buildUsageDto({ current, limit: cfg.weeklyLimitUsd, percentage, state, window, fetchedAt });
    await persistSnapshot(tenantId, dto);
    return dto;
  }

  return { getWeeklyUsage, persistSnapshot };
}
