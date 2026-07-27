-- Portal público Lotus — view de LEITURA ANÔNIMA dos LANÇAMENTOS.
--
-- Contexto: a Fase 1 criou portal_condominios/portal_imoveis. Mas os
-- EMPREENDIMENTOS que o site mostra (Manawa, Resort Prime, Avelã...) vivem na
-- tabela `lancamentos` (não em `condominios` — esta é majoritariamente imóveis
-- de terceiros). Esta migração expõe `lancamentos` para o Portal via anon.
--
-- Mesma abordagem segura da Fase 1 (ver comentário em
-- 20260717_create_portal_public_views.sql):
--   1. Policy SELECT TO anon (fronteira de LINHAS) — aqui SEM filtro de
--      publicação, pois `lancamentos` não tem coluna publicar_site (decisão de
--      produto 2026-07-17: expor todos os lançamentos do tenant por ora; um
--      filtro publicar_site pode ser adicionado depois trocando o USING).
--   2. Privilégio de COLUNA (REVOKE table-wide + GRANT só colunas públicas) —
--      bloqueia book_pdf (PDF base64 pesado/interno) e criado_por.
--   3. View security_invoker portal_lancamentos com SELECT explícito.
--
-- ⚠️ OMITIDO do anon: book_pdf, book_pdf_filename (PDF base64 inline — peso e uso
--    interno), criado_por (interno). O Portal usa nome/descricao/fotos/endereco.
--
-- Impacto no dashboard: nenhum dado alterado; policies de authenticated/owner
-- intactas; só se adiciona acesso de leitura a `anon`.
--
-- ⚠️ ORDEM: aplicar ANTES desta as migrations de enrich:
--    - 20260717_enrich_lancamentos_for_portal.sql (cidade/bairro/estagio/... e publicar_site)
--    - 20260717_add_lancamentos_filter_fields.sql (tipo_dorms, preco_num)
--    A view e o GRANT referenciam essas colunas; fora de ordem falha com
--    "column does not exist".
--
-- ⚠️ APLICAÇÃO: como na Fase 1, REVOKE/GRANT/CREATE POLICY pegam lock; se der
--    "deadlock detected", a transação inteira reverte — reexecutar (idempotente).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   DROP VIEW IF EXISTS public.portal_lancamentos;
--   DROP POLICY IF EXISTS portal_anon_select_lancamentos ON public.lancamentos;
--   GRANT SELECT ON public.lancamentos TO anon;   -- volta ao default Supabase
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Policy de leitura anônima (todas as linhas do tenant — sem flag de publicação)
DROP POLICY IF EXISTS portal_anon_select_lancamentos ON public.lancamentos;
CREATE POLICY portal_anon_select_lancamentos
  ON public.lancamentos
  FOR SELECT
  TO anon
  USING (true);

-- 2. Privilégio de coluna: remove SELECT table-wide, reconcede só o público
--    (inclui as colunas de enriquecimento — requer a migration
--     20260717_enrich_lancamentos_for_portal.sql aplicada ANTES desta).
REVOKE SELECT ON public.lancamentos FROM anon;
GRANT SELECT (
  id, tenant_id, nome, descricao, fotos, endereco_plantao, created_at, updated_at,
  cidade, bairro, estagio, construtora, dormitorios, specs, preco_texto,
  exclusivo, publicar_site, tipo_dorms, preco_num
) ON public.lancamentos TO anon;
-- OMITIDO (interno/peso): book_pdf, book_pdf_filename, criado_por.

-- 3. View pública (inclui campos enriquecidos; filtra por publicar_site)
--    DROP antes de recriar: CREATE OR REPLACE não pode inserir/reordenar colunas
--    (só adicionar no fim). Se a view já existe de uma aplicação anterior com
--    outro conjunto/ordem de colunas, o replace falha com 42P16. DROP + CREATE
--    recria do zero. (A view não tem dependências externas — seguro dropar.)
DROP VIEW IF EXISTS public.portal_lancamentos;
CREATE VIEW public.portal_lancamentos
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  nome,
  descricao,
  fotos,             -- jsonb: [{url, legenda, isCapa}]
  endereco_plantao,
  cidade,
  bairro,
  estagio,
  construtora,
  dormitorios,
  specs,
  preco_texto,
  exclusivo,
  tipo_dorms,
  preco_num,
  created_at,
  updated_at
FROM public.lancamentos
WHERE publicar_site = true;   -- default true; equipe pode ocultar itens no dash

COMMENT ON VIEW public.portal_lancamentos IS
  'Lançamentos publicados (publicar_site=true) para o Portal público. security_invoker; '
  'book_pdf e metadados internos bloqueados por grant de coluna. Filtre por tenant_id no cliente.';

GRANT SELECT ON public.portal_lancamentos TO anon, authenticated;

COMMIT;
