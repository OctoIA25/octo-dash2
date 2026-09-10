-- =============================================================================
-- Auditoria do isolamento por tenant nas tabelas que guardam dado de lead.
-- SÓ LEITURA. Rodar no SQL editor do Supabase e conferir as 5 seções.
--
-- Existe porque nem o repositório nem o service_role provam o estado APLICADO
-- das policies: o service_role bypassa RLS e pg_policies não é exposta pelo
-- PostgREST. Só dá para verificar de dentro do banco.
--
-- Contexto: incidente de 10/set/2026 — leads do Lotus Brokers atribuídos a
-- corretores da Imobiliaria Japi ficaram legíveis e editáveis por eles, porque
-- leads_select_policy começava com `assigned_agent_id = auth.uid()::text`, sem
-- checar tenant.
-- =============================================================================

-- 1) RLS LIGADO? -------------------------------------------------------------
-- Toda linha tem que vir com rls_ligado = true. `false` = tabela aberta para
-- qualquer autenticado, policy nenhuma importa.
SELECT
  c.relname                AS tabela,
  c.relrowsecurity         AS rls_ligado,
  c.relforcerowsecurity    AS rls_forcado,
  CASE WHEN c.relrowsecurity THEN 'ok' ELSE '>>> ABERTA <<<' END AS veredito
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('leads','kenlo_leads','bolsao','proposals','lead_events',
                    'lia_followups','tenant_brokers','tenant_memberships',
                    'imoveis_corretores','roleta_participantes','whatsapp_conversations')
ORDER BY c.relrowsecurity, c.relname;

-- 2) ALGUMA POLICY DÁ ACESSO SEM CHECAR TENANT? ------------------------------
-- Heurística: a expressão cita auth.uid() mas NÃO cita tenant. É o formato
-- exato do buraco que vazou. Espera-se ZERO linhas.
SELECT
  tablename AS tabela, policyname AS policy, cmd,
  coalesce(qual, with_check) AS expressao,
  '>>> SEM CHECAGEM DE TENANT <<<' AS veredito
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads','kenlo_leads','bolsao','proposals','lead_events',
                    'lia_followups','whatsapp_conversations')
  AND coalesce(qual, with_check) ILIKE '%auth.uid()%'
  AND coalesce(qual, with_check) NOT ILIKE '%tenant%'
ORDER BY tablename, policyname;

-- 3) AS DUAS POLICIES DE `leads` FORAM CORRIGIDAS? ---------------------------
-- Nenhuma das duas pode mais citar assigned_agent_id.
-- (migration 20260910_fix_leads_rls_cross_tenant_assignee.sql)
SELECT
  policyname AS policy, cmd,
  CASE WHEN qual ILIKE '%assigned_agent_id%'
       THEN '>>> MIGRATION NAO APLICADA <<<' ELSE 'ok' END AS veredito,
  qual AS expressao
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'leads'
ORDER BY policyname;

-- 4) O INVARIANTE VALE NA BASE INTEIRA? --------------------------------------
-- Todo lead atribuído tem que ter corretor que é membro do tenant do lead.
-- Espera-se fora_do_tenant = 0.
SELECT
  count(*) FILTER (WHERE l.assigned_agent_id IS NOT NULL)                    AS atribuidos,
  count(*) FILTER (
    WHERE l.assigned_agent_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships tm
                       WHERE tm.tenant_id = l.tenant_id
                         AND tm.user_id::text = lower(l.assigned_agent_id))
  ) AS fora_do_tenant
FROM public.leads l;

-- Se a contagem acima não for 0, esta lista mostra quem:
SELECT t.name AS tenant, l.assigned_agent_name AS corretor, count(*) AS leads
FROM public.leads l
JOIN public.tenants t ON t.id = l.tenant_id
WHERE l.assigned_agent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = l.tenant_id
                     AND tm.user_id::text = lower(l.assigned_agent_id))
GROUP BY 1, 2
ORDER BY 3 DESC;

-- 5) AS TRAVAS DE BANCO ESTÃO NO LUGAR? --------------------------------------
-- (migration 20260910_leads_assignee_tenant_guard.sql). Espera-se 2 linhas.
SELECT tgname AS trigger, c.relname AS tabela, 'ok' AS veredito
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
WHERE NOT tg.tgisinternal
  AND tg.tgname IN ('tr_leads_zz_assignee_guard','tr_membership_delete_clears_leads')
ORDER BY tgname;
