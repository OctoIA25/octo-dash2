-- A regra que libera lançamentos para a chave pública do site não filtrava
-- por imobiliária.
--
-- O QUE ESTAVA ESCRITO: `portal_anon_select_lancamentos ... USING (true)`.
-- Qualquer pessoa com a chave pública (que vai no bundle do site) lia TODOS
-- os lançamentos da plataforma, incluindo a coluna tenant_id.
--
-- POR QUE NÃO VAZOU AINDA: medido em 18/09/2026, os 59 lançamentos de
-- produção são todos da mesma imobiliária. No dia em que uma segunda
-- cadastrar um lançamento, ele nasce público — sem ninguém pedir e sem erro
-- em lugar nenhum.
--
-- O QUE MUDA HOJE: nada do que está no ar. Os mesmos 59 seguem visíveis.
-- O que fecha é o futuro.
--
-- O UUID CRAVADO é a convenção que já existe aqui (ver
-- `portal_anon_count_imoveis`, na mesma base). É uma mina: um segundo site
-- público exige editar a policy. O certo seria uma marca em `tenants`
-- dizendo qual imobiliária tem portal — não existe hoje, e inventá-la nesta
-- correção mudaria mais do que foi autorizado.
--
-- AINDA ABERTO, de propósito: 7 dos 59 lançamentos têm `publicar_site = false`
-- e mesmo assim são lidos pela chave pública, porque esta regra não olha o
-- flag. É o mesmo caso dos 10 imóveis de `portal_anon_count_imoveis`, e as
-- duas decisões andam juntas — passar a respeitar o flag TIRA coisa do site.

BEGIN;

DROP POLICY IF EXISTS portal_anon_select_lancamentos ON public.lancamentos;

CREATE POLICY portal_anon_select_lancamentos
  ON public.lancamentos
  FOR SELECT
  TO anon
  USING (tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid);

COMMIT;
