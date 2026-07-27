/**
 * POST /api/v1/enps/responses — submissão de UMA resposta de eNPS.
 *
 * O `cycle` uuid do deep-link NÃO é autorização (vaza em e-mail/histórico/logs).
 * A autorização é a existência de um DISPATCH para (cycle_id, jwt.uid). Sem isso,
 * 403 (senão um corretor do tenant A com o uuid do ciclo de B injetaria resposta
 * em B — o UNIQUE não salva, o par (B-cycle, A-user) é novo).
 *
 * Atomicidade (anti duplo-submit): o UPDATE condicional has_responded false→true
 * serializa dois submits no row-lock; a resposta só é inserida se afetou 1 linha.
 *
 * Anonimato: respondent_user_id = allow_individual ? jwt.uid : NULL (self-only).
 * tenant_id vem SEMPRE da linha do dispatch, nunca do body.
 */
const DISPATCHES = 'survey_dispatches';
const RESPONSES = 'survey_responses';
const NPS_KEYS = ['q_empresa', 'q_gestor'];

function validateAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 'invalid_answers';
  if (answers.q_empresa == null) return 'missing_q_empresa';
  for (const k of NPS_KEYS) {
    if (answers[k] == null) continue;
    const n = Number(answers[k]);
    if (!Number.isInteger(n) || n < 0 || n > 10) return `invalid_score_${k}`;
  }
  if (answers.q_comentario != null && typeof answers.q_comentario !== 'string') return 'invalid_comment';
  return null;
}

export function makeSubmitHandler(supabase) {
  return async function submitHandler(req, res) {
    try {
      const userId = req.userId;
      const { cycle_id: cycleId, answers, allow_individual: allowIndividual } = req.body || {};
      if (!cycleId) return res.status(400).json({ ok: false, error: 'missing_cycle_id' });
      const answersError = validateAnswers(answers);
      if (answersError) return res.status(400).json({ ok: false, error: answersError });

      // 1. Dispatch do PRÓPRIO jwt-user neste ciclo. Ausente → 403 (anti-IDOR).
      // subject_leader_user_id NÃO existe em survey_dispatches (só em survey_responses,
      // migration:95) — selecionar só colunas reais do dispatch.
      const { data: dispatch, error: dErr } = await supabase
        .from(DISPATCHES)
        .select('id, tenant_id, cycle_id, respondent_user_id, has_responded')
        .eq('cycle_id', cycleId).eq('respondent_user_id', userId).maybeSingle();
      if (dErr) throw dErr;
      if (!dispatch) return res.status(403).json({ ok: false, error: 'no_dispatch_for_user' });
      if (dispatch.has_responded) return res.status(409).json({ ok: false, error: 'already_responded' });

      const tenantId = dispatch.tenant_id; // SEMPRE da linha, nunca do body.

      // Gestor avaliado na Q2 vem do membership do respondente (não do dispatch).
      const { data: membership, error: mErr } = await supabase
        .from('tenant_memberships').select('leader_user_id')
        .eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle();
      if (mErr) throw mErr;

      // 2. UPDATE condicional atômico: só um submit vence a transição false→true.
      const { data: claimed, error: uErr } = await supabase
        .from(DISPATCHES).update({ has_responded: true })
        .eq('cycle_id', cycleId).eq('respondent_user_id', userId).eq('has_responded', false)
        .select('id');
      if (uErr) throw uErr;
      if (!Array.isArray(claimed) || claimed.length !== 1) {
        return res.status(409).json({ ok: false, error: 'already_responded' });
      }

      // 3. Insere a resposta. respondent_user_id só com opt-in (self-only).
      const { error: iErr } = await supabase
        .from(RESPONSES)
        .insert({
          tenant_id: tenantId, cycle_id: cycleId, answers,
          subject_leader_user_id: answers.q_gestor != null ? (membership?.leader_user_id ?? null) : null,
          respondent_user_id: allowIndividual ? userId : null,
        })
        .select('id').single();
      if (iErr) { console.error('[enps] falha ao inserir resposta:', iErr); throw iErr; }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[enps] erro ao submeter resposta:', err);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  };
}
