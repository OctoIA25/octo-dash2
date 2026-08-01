-- Fecha o escape anônimo das policies de `leads`.
--
-- PROBLEMA
-- As três policies abaixo terminavam com `OR (auth.uid() IS NULL)`, que é
-- verdadeiro para qualquer requisição SEM JWT. Como a anon key vai no bundle do
-- Vite (é pública por natureza), na prática a tabela inteira estava aberta:
--
--   curl "$URL/rest/v1/leads?select=id" -H "apikey: $ANON"   (sem Authorization)
--   → 200, content-range 0-999/2869, 4 tenant_ids distintos
--
-- Valia para SELECT (ler PII de todos os tenants), UPDATE e INSERT (alterar e
-- criar lead em qualquer tenant). DELETE já não tinha o escape.
--
-- POR QUE A CLÁUSULA EXISTIA (provável)
-- server/api-server.js e proxy-production.js caem para a anon key quando
-- SUPABASE_SERVICE_ROLE_KEY não está definida. Verificado em 01/ago/2026:
-- produção sobe com `(service_role)`, que bypassa RLS — nada do servidor
-- depende deste escape.
--
-- POR QUE É SEGURO REMOVER
--  - nenhuma rota pública do app consulta o Supabase (/apidocs não toca o banco);
--  - as policies `portal_anon_select_*` (tenant Japi Lançamentos) são de
--    tenant_brokers/tenant_memberships e continuam intactas — o portal público
--    lista corretores, não cria leads;
--  - os 522 leads desse tenant vêm de Santa Ângela (474), ZAP (35), Lia (12) e
--    1 manual: todos server-side (service_role) ou autenticados. Nenhum insert
--    anônimo depende deste escape.
--
-- As demais cláusulas de cada policy ficam idênticas — só a última sai.
-- kenlo_leads já estava correta e não é tocada aqui.

alter policy leads_select_policy on public.leads
using (
  assigned_agent_id = (auth.uid())::text
  or exists (
    select 1 from tenant_memberships tm
    where tm.user_id = auth.uid() and tm.tenant_id = leads.tenant_id
  )
  or (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
);

-- UPDATE: with_check é null, então o Postgres usa esta mesma expressão para
-- filtrar as linhas E para validar a linha resultante.
alter policy leads_update_policy on public.leads
using (
  assigned_agent_id = (auth.uid())::text
  or tenant_id in (select user_tenant_ids())
  or (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
);

alter policy leads_insert_policy on public.leads
with check (
  exists (
    select 1 from tenant_memberships tm
    where tm.user_id = auth.uid() and tm.tenant_id = leads.tenant_id
  )
  or (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
);

-- VERIFICAÇÃO (rodar antes e depois, com a anon key e SEM Authorization):
--   curl -sI "$URL/rest/v1/leads?select=id" -H "apikey: $ANON" \
--        -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range
--   antes: 0-0/2869   →   depois: 0-0/0
--
-- ROLLBACK: re-adicionar `or auth.uid() is null` ao final das três expressões.
--
-- PENDENTE (deliberadamente fora daqui, para não misturar performance com
-- correção de segurança): trocar `auth.uid()` por `(select auth.uid())` nas
-- policies força o initPlan e evita reavaliar a função por linha — ganho real
-- em `leads`/`kenlo_leads`. Fazer em migration própria, com rollback separado.
