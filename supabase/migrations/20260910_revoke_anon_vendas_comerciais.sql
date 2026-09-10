-- Fecha para o `anon` as tabelas do livro comercial.
--
-- SITUAÇÃO VERIFICADA EM PRODUÇÃO: com a chave anon — que vai embutida no
-- bundle JS, ou seja, é pública — estas tabelas respondem SEM autenticação:
--
--   commercial_sales                        74 linhas
--   commercial_sales_import_batches       2599 linhas
--   commercial_sales_broker_summary         26 linhas
--   commercial_sales_team_leader_summary     9 linhas
--   commercial_sales_monthly_summary         8 linhas
--
-- O conteúdo inclui R$ 27,6 milhões de VGV, R$ 1,4 milhão em comissões,
-- percentuais de repasse, valores por team leader, e PII: cliente_nome,
-- corretor_nome e corretor_email.
--
-- CAUSA: o schema public tem GRANT default de SELECT/INSERT/UPDATE/DELETE para
-- `anon` em ~120 tabelas, e nestas o RLS não barra a leitura. O REVOKE ataca a
-- camada de privilégio, que independe de policy — mesmo que exista policy
-- permissiva, sem privilégio de tabela não há acesso.
--
-- POR QUE ISTO NÃO QUEBRA O APP: todo acesso a estas tabelas no código passa
-- pelo client `supabase` (commercialSalesService.ts), que envia o JWT do
-- usuário logado — role `authenticated`, não `anon`. Não há nenhum caminho de
-- fetch cru para elas (verificado por grep em src/ e server/).
--
-- ⚠️ APLICAR MANUALMENTE no Supabase.

BEGIN;

REVOKE ALL ON public.commercial_sales                        FROM anon;
REVOKE ALL ON public.commercial_sales_import_batches         FROM anon;
REVOKE ALL ON public.commercial_sales_broker_summary         FROM anon;
REVOKE ALL ON public.commercial_sales_team_leader_summary    FROM anon;
REVOKE ALL ON public.commercial_sales_monthly_summary        FROM anon;

COMMIT;

-- Conferência depois de aplicar — com a ANON key, deve dar 401/42501 em vez de
-- devolver linhas:
--   curl -s "$SUPABASE_URL/rest/v1/commercial_sales?select=id&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- E logado (JWT de usuário do tenant) deve continuar funcionando normalmente:
--   Relatórios > aba Financeiro, e o ranking de corretores.
