/**
 * Miolo do disparo de uma campanha — fonte única usada pela rota HTTP
 * (disparo imediato) e pelo worker de agendamento (no horário).
 * Reusa o motor preview→confirm (deliverRecommendation é a fonte de envio).
 * Não lança: toda falha vira { ok:false, error }.
 */
export async function executeCampaignDispatch(supabase, { campaign, tenantId, user, deps }) {
  const {
    assertTemplateUsable, validateMapping, loadMetaCreds, resolvePublicSourceMode,
    previewOperation, confirmOperation, runDueActions, schedulerDeps,
  } = deps;
  try {
    const tpl = await assertTemplateUsable(tenantId, campaign.template_id);
    if (!tpl.ok) return { ok: false, error: tpl.error };
    const vcheck = validateMapping(campaign.variable_mapping, tpl.variables);
    if (!vcheck.ok) return { ok: false, error: 'incomplete_mapping' };
    const creds = await loadMetaCreds(supabase, tenantId);
    if (!creds.ok) return { ok: false, error: creds.error };
    const mode = await resolvePublicSourceMode(supabase, tenantId);
    const prev = await previewOperation(
      supabase,
      { audienceId: campaign.audience_id, tenantId, mode, campaignId: campaign.id, user },
      { maxRecipients: campaign.max_recipients ?? undefined },
    );
    if (!prev.ok || !prev.previewToken) return { ok: false, error: prev.error || 'preview_failed' };
    const conf = await confirmOperation(supabase, {
      previewToken: prev.previewToken, tenantId, message: tpl.body, templateName: tpl.name,
      variableMapping: campaign.variable_mapping ?? {}, templateVariables: tpl.variables, user,
    });
    if (!conf.ok) return { ok: false, error: conf.error || 'confirm_failed' };
    if (conf.enqueued > 0) {
      runDueActions(supabase, { deliver: schedulerDeps.deliver, schedulerDeps, getEnvironment: schedulerDeps.getEnvironment })
        .catch((err) => console.error('[campaigns] drain pós-dispatch falhou:', err?.message));
    }
    return { ok: true, runId: conf.runId, enqueued: conf.enqueued };
  } catch (e) {
    return { ok: false, error: 'dispatch_failed', detail: e?.message };
  }
}
