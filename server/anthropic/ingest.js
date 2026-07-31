/**
 * Ingest do modo MAX: recebe o % oficial da assinatura (reporter get_usage na
 * máquina com OAuth do Max) e grava o snapshot + dispara o alerta de transição.
 * Sem semântica de USD (assinatura não tem gasto em dólar): colunas USD = null.
 * Auth acontece FORA (validateApiKey nos entrypoints — tenant vem da key).
 */
import { createAnthropicConfigResolver } from './configResolver.js';
import { evaluateThreshold, buildUsageDto } from './usage.js';
import { checkAndSendOwnerAlert as defaultAlert } from './alerts.js';

const TABLE = 'tenant_anthropic_config';

/** epoch em segundos OU ISO → ISO; inválido → null. */
function parseResetsAt(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v * 1000).toISOString();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function ingestMaxUsage(supabase, tenantId, body, deps = {}) {
  const resolver = deps.resolver || createAnthropicConfigResolver({ supabase });
  const alert = deps.checkAndSendOwnerAlert || defaultAlert;
  const now = deps.now || Date.now;

  const pct = Number(body?.week_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, code: 'invalid_payload' };

  const cfg = await resolver.resolveConfig(tenantId);
  if (cfg?.mode !== 'max') return { ok: false, code: 'mode_not_max' };

  // prevState DIRETO da linha (o cache TTL do resolver poderia devolver estado velho
  // e quebrar o dedup por transição).
  let prevState = null;
  try {
    const { data } = await supabase.from(TABLE).select('last_state').eq('tenant_id', tenantId).maybeSingle();
    prevState = data?.last_state ?? null;
  } catch { prevState = null; }

  const percentage = Math.round(pct * 100) / 100;
  const state = evaluateThreshold(percentage, cfg.alertThresholdBps ?? 1430);
  const windowEnd = parseResetsAt(body?.resets_at);
  const windowStart = windowEnd ? new Date(Date.parse(windowEnd) - 7 * 24 * 60 * 60 * 1000).toISOString() : null;
  const fetchedAt = new Date(now()).toISOString();

  const { error } = await supabase.from(TABLE).upsert({
    tenant_id: tenantId, status: state, last_state: state,
    last_percentage: percentage, last_usage_usd: null, weekly_limit_usd: null,
    last_window_start: windowStart, last_window_end: windowEnd,
    last_error: null, last_synced_at: fetchedAt, updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' });
  if (error) {
    console.error(`[anthropic] ingest persist falhou tenant=${tenantId}: ${error.message}`);
    return { ok: false, code: 'persist_failed' };
  }
  resolver.invalidate?.(tenantId);

  const dto = buildUsageDto({
    current: null, limit: null, percentage, state,
    window: { startsAt: windowStart, endsAt: windowEnd }, fetchedAt,
  });
  await alert(supabase, { dto, prevState, tenantId }); // best-effort (nunca lança)

  if (body?.source) console.log(`[anthropic] ingest max tenant=${tenantId} pct=${percentage} source=${String(body.source).slice(0, 80)}`);
  return { ok: true, status: state };
}
