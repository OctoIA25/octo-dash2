-- ============================================================
-- Conserto imediato: text = uuid quebrou as duas funções
--
-- A migration anterior comparava `leads.assigned_agent_id` (TEXT) com o
-- retorno de `usuario_assistente_ia()` (uuid). Postgres só resolve operador
-- em tempo de EXECUÇÃO dentro de plpgsql: a migration foi aceita, e as duas
-- funções passaram a estourar na primeira chamada com
--
--     operator does not exist: text = uuid
--
-- Ou seja: subiu verde e quebrou em produção. Os cinco testes de TypeScript
-- que eu tinha escrito não alcançam isto — eles cobrem a regra do card, não
-- a do banco. O teste que passou a existir junto com este arquivo
-- (`supabase/tests/com_a_lia_dona_do_lead.test.sql`) CHAMA as duas funções,
-- que é a única forma de o erro aparecer antes do usuário.
--
-- Esta migration é segura em qualquer estado: se a comparação já estiver
-- certa, ela não faz nada.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.leads_ultima_movimentacao(p_tenant_id uuid, p_lead_ids text[])
RETURNS TABLE(lead_id text, ultima timestamp with time zone, fonte text,
              lia_passou boolean, lia_atendeu boolean, dona_lia boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_assistente text := public.usuario_assistente_ia(p_tenant_id)::text;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN;
  END IF;

  IF p_lead_ids IS NULL OR cardinality(p_lead_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH alvo AS (
    SELECT DISTINCT unnest(p_lead_ids) AS lid
  ),
  dona AS (
    SELECT l.id::text AS lid,
           (lower(btrim(l.assigned_agent_id)) = v_assistente) AS e_a_lia
    FROM leads l JOIN alvo a ON a.lid = l.id::text
    WHERE l.tenant_id = p_tenant_id
  ),
  eventos AS (
    SELECT e.lead_id AS lid, e.created_at, e.event_type, e.ator_tipo
    FROM lead_events e
    JOIN alvo a ON a.lid = e.lead_id
    WHERE e.tenant_id = p_tenant_id
  ),
  handoff AS (
    SELECT
      e.lid,
      bool_or(e.event_type IN ('lia.handoff_corretor', 'lia.lead_passado_corretor', 'lia.lead_distribuido')) AS passou,
      bool_or(e.event_type LIKE 'lia.%') AS atendeu
    FROM eventos e
    GROUP BY e.lid
  ),
  movimentos AS (
    SELECT e.lid, e.created_at AS quando, 'evento'::text AS fonte
    FROM eventos e
    WHERE e.event_type <> 'lead.created'
      AND NOT (e.event_type = 'lead.assigned' AND e.ator_tipo = 'sistema')
    UNION ALL
    SELECT t.lead_id, t.executado_em, 'toque'
    FROM lead_toques t
    JOIN alvo a ON a.lid = t.lead_id
    WHERE t.tenant_id = p_tenant_id AND t.executado_em IS NOT NULL
    UNION ALL
    SELECT c.lead_id::text, c.last_message_at, 'conversa'
    FROM whatsapp_conversations c
    JOIN alvo a ON a.lid = c.lead_id::text
    WHERE c.tenant_id = p_tenant_id AND c.last_message_at IS NOT NULL
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.lid) m.lid, m.quando, m.fonte
    FROM movimentos m
    WHERE m.quando IS NOT NULL AND m.quando <= now()
    ORDER BY m.lid, m.quando DESC
  )
  SELECT u.lid, u.quando, u.fonte,
         COALESCE(h.passou, false), COALESCE(h.atendeu, false),
         COALESCE(d.e_a_lia, false)
  FROM ultimo u
  LEFT JOIN handoff h ON h.lid = u.lid
  LEFT JOIN dona d ON d.lid = u.lid;
END;
$function$;

DO $do$
DECLARE
  v_def text;
  v_novo text;
  v_errado text := 'WHEN b.assigned_agent_id = public.usuario_assistente_ia(p_tenant_id) THEN ''com_lia''';
  v_certo  text := 'WHEN lower(btrim(b.assigned_agent_id)) = public.usuario_assistente_ia(p_tenant_id)::text THEN ''com_lia''';
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE proname = 'leads_graficos' AND pronamespace = 'public'::regnamespace;

  IF position(v_certo in v_def) > 0 THEN
    RAISE NOTICE 'leads_graficos ja corrigida';
    RETURN;
  END IF;

  IF position(v_errado in v_def) = 0 THEN
    RAISE EXCEPTION 'nao achei a comparacao quebrada em leads_graficos';
  END IF;

  v_novo := replace(v_def, v_errado, v_certo);
  IF v_novo = v_def THEN RAISE EXCEPTION 'a substituicao nao mudou nada'; END IF;
  EXECUTE v_novo;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
