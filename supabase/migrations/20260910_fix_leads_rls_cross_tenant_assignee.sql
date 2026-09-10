-- Fecha o vazamento entre tenants pela cláusula de "corretor atribuído" em `leads`.
--
-- PROBLEMA
-- `leads_select_policy` e `leads_update_policy` começam com
--
--     assigned_agent_id = (auth.uid())::text
--
-- SEM nenhuma checagem de tenant. Basta o seu user_id estar em
-- `leads.assigned_agent_id` para ler e editar a linha — mesmo que o lead seja de
-- outra imobiliária e você não tenha membership nenhuma nela.
--
-- Isso só é inofensivo enquanto ninguém é atribuído fora do próprio tenant. Não
-- é o caso: `tenant_brokers` acumula linhas de gente que saiu do CRM e de
-- importações de outra imobiliária, e a roleta distribuía por essa tabela crua
-- (corrigido em server/leadAssignment.js, mesmo dia). Medido em 10/set/2026:
--
--   43 linhas de tenant_brokers da Imobiliaria Japi / Japi Lançamentos dentro do
--   tenant Lotus Brokers, 41 sem membership no Lotus;
--   20 leads do Lotus atribuídos a usuários que logam em "imobiliaria 9" /
--   "Imobiliaria Japi" — e que, por esta cláusula, liam e editavam esses leads.
--
-- POR QUE É SEGURO REMOVER
-- A cláusula é redundante para todo acesso legítimo: um corretor atribuído a um
-- lead do PRÓPRIO tenant já passa pela cláusula de membership logo abaixo. O
-- único acesso que ela adiciona é exatamente o que não deveria existir —
-- atribuído em tenant onde não se é membro.
--
-- O recorte "corretor vê só os leads dele" é feito na camada de aplicação (as
-- queries filtram por assigned_agent_id), não por RLS: a policy sempre liberou
-- o tenant inteiro para qualquer membro. Nada do app depende desta cláusula.
--
-- INSERT já era baseado em membership e não é tocado. DELETE não tem a cláusula.
-- `kenlo_leads` já estava correta (ver 20260801_fix_leads_rls_anon_escape.sql).

alter policy leads_select_policy on public.leads
using (
  exists (
    select 1 from tenant_memberships tm
    where tm.user_id = auth.uid() and tm.tenant_id = leads.tenant_id
  )
  or (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
);

-- UPDATE: with_check é null, então o Postgres usa esta mesma expressão para
-- filtrar as linhas E para validar a linha resultante.
alter policy leads_update_policy on public.leads
using (
  tenant_id in (select user_tenant_ids())
  or (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
);

-- VERIFICAÇÃO (rodar depois):
--
--   SELECT policyname, cmd, qual
--     FROM pg_policies
--    WHERE schemaname='public' AND tablename='leads'
--      AND policyname IN ('leads_select_policy','leads_update_policy');
--   -- nenhuma das duas pode mais conter `assigned_agent_id`
--
-- Contagem de leads atribuídos a quem não é membro do tenant do lead (deve ser
-- 0 depois da limpeza de tenant_brokers + redistribuição do mesmo dia):
--
--   SELECT count(*) FROM public.leads l
--    WHERE l.assigned_agent_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships tm
--                       WHERE tm.user_id::text = l.assigned_agent_id
--                         AND tm.tenant_id = l.tenant_id);
--
-- ROLLBACK: re-adicionar `assigned_agent_id = (auth.uid())::text or` no início
-- das duas expressões — voltando ao estado de 20260801.
