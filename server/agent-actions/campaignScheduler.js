/**
 * Worker de campanhas agendadas. Roda no loop do scheduler (5s): busca as
 * campanhas 'scheduled' vencidas, faz claim atômico (anti-duplicação) e dispara
 * via executeCampaignDispatch. Falha → schedule_status='error' + motivo. Nunca lança.
 */
const CAMPAIGNS_TABLE = 'communication_campaigns';
const SYSTEM_USER = { id: null, email: 'system@scheduler', role: 'owner', brokerName: null };

export async function runDueCampaigns(supabase, deps = {}) {
  const { executeCampaignDispatch, nowMs = Date.now(), limit = 50 } = deps;
  const nowIso = new Date(nowMs).toISOString();
  let processed = 0; let dispatched = 0; let failed = 0;

  const { data: due, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select('id, tenant_id, audience_id, template_id, max_recipients, variable_mapping')
    .eq('schedule_status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (error || !due) return { processed: 0, dispatched: 0, failed: 0 };

  for (const camp of due) {
    processed += 1;
    try {
      // Claim atômico: só uma instância marca 'dispatched' a partir de 'scheduled'.
      const { data: claimed } = await supabase
        .from(CAMPAIGNS_TABLE)
        .update({ schedule_status: 'dispatched' })
        .eq('id', camp.id).eq('schedule_status', 'scheduled')
        .select('id');
      if (!claimed || claimed.length === 0) continue; // outra instância venceu

      const result = await executeCampaignDispatch(supabase, {
        campaign: camp, tenantId: camp.tenant_id, user: SYSTEM_USER, deps,
      });
      if (result.ok) {
        dispatched += 1;
      } else {
        failed += 1;
        await supabase.from(CAMPAIGNS_TABLE)
          .update({ schedule_status: 'error', schedule_error: result.detail ? `${result.error}: ${result.detail}` : (result.error || 'dispatch_failed') })
          .eq('id', camp.id);
      }
    } catch (e) {
      failed += 1;
      await supabase.from(CAMPAIGNS_TABLE)
        .update({ schedule_status: 'error', schedule_error: e?.message || 'dispatch_failed' })
        .eq('id', camp.id).then(() => {}, () => {});
    }
  }
  return { processed, dispatched, failed };
}
