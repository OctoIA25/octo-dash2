-- Publicação na Web em imóveis: o toggle "Anunciar" do CriarImovelForm nunca
-- existiu no banco.
--
-- Bug: na tela de Imóveis, a seção "Publicação na Web" (Anunciar / Destaque /
-- Super Destaque) era UI morta — o payload de `saveImovelLocal` não mandava
-- esses campos e a tabela não tinha as colunas. Salvar não persistia nada e
-- reabrir o imóvel mostrava "Não" de novo. Publicar dependia SÓ de
-- `status_aprovacao = 'aprovado'`.
--
-- Aqui as colunas passam a existir e `publicar_site` vira o segundo portão de
-- publicação (aprovado E publicar_site) — na policy do anon, na view
-- portal_imoveis e no feed ZAP/Grupo OLX (server/*.js).
--
-- ⚠️ DEFAULT true em publicar_site é deliberado: as linhas já existentes hoje
--    estão no ar e devem CONTINUAR no ar. Quem nasce pelo formulário grava
--    explicitamente o valor escolhido (o form default é 'nao').
--
-- ROLLBACK:
--   ALTER TABLE public.imoveis_locais
--     DROP COLUMN IF EXISTS publicar_site,
--     DROP COLUMN IF EXISTS destaque,
--     DROP COLUMN IF EXISTS super_destaque;
--   -- e reaplicar 20260717_create_portal_public_views.sql (policy + view sem o filtro)

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1. Colunas
-- ============================================================================
ALTER TABLE public.imoveis_locais
  ADD COLUMN IF NOT EXISTS publicar_site  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS destaque       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS super_destaque BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.imoveis_locais.publicar_site IS
  'Campo "Anunciar" do formulário. Publica no Portal/feeds SE também estiver aprovado. Default true para não tirar do ar o acervo pré-existente.';
COMMENT ON COLUMN public.imoveis_locais.destaque IS 'Campo "Imóvel em Destaque" do formulário.';
COMMENT ON COLUMN public.imoveis_locais.super_destaque IS 'Campo "Super Destaque" do formulário.';

-- ============================================================================
-- 2. Fronteira de LINHAS do anon: aprovado E publicado
-- ============================================================================
DROP POLICY IF EXISTS portal_anon_select_imoveis_locais ON public.imoveis_locais;
CREATE POLICY portal_anon_select_imoveis_locais
  ON public.imoveis_locais
  FOR SELECT
  TO anon
  USING (status_aprovacao = 'aprovado' AND publicar_site = true);

-- ============================================================================
-- 3. Fronteira de COLUNAS: publicar_site é coluna de FILTRO da view
--    security_invoker (roda como anon) — sem o grant a view dá permission
--    denied. Mesmo caso de status_aprovacao/condominios.publicar_site em
--    20260717. destaque/super_destaque são expostos porque o Portal ordena
--    por eles. Nenhum dos três é PII.
-- ============================================================================
GRANT SELECT (publicar_site, destaque, super_destaque)
  ON public.imoveis_locais TO anon;

-- ============================================================================
-- 4. portal_imoveis: mesmo SELECT de 20260717 + filtro de publicação.
--    (CREATE OR REPLACE só admite acrescentar colunas NO FIM — por isso
--     destaque/super_destaque entram depois de updated_at.)
-- ============================================================================
CREATE OR REPLACE VIEW public.portal_imoveis
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  codigo_imovel,
  titulo,
  tipo,
  tipo_simplificado,
  finalidade,
  logradouro,
  numero,
  complemento,
  bairro,
  cidade,
  estado,
  cep,
  area_total,
  area_util,
  quartos,
  suites,
  banheiros,
  vagas,
  salas,
  valor_venda,
  valor_locacao,
  valor_condominio,
  valor_iptu,
  descricao,
  fotos,
  metragem_m2,
  condominio_id,
  exclusivo,
  area_comum,
  area_privativa,
  aceita_troca,
  link_video,
  tour_virtual,
  created_at,
  updated_at,
  destaque,
  super_destaque
FROM public.imoveis_locais
WHERE status_aprovacao = 'aprovado'
  AND publicar_site = true;

COMMENT ON VIEW public.portal_imoveis IS
  'Imóveis manuais aprovados E marcados como "Anunciar" (publicar_site=true) para o Portal público. '
  'security_invoker; dados do proprietário (PII) bloqueados por grant de coluna (LGPD). Filtre por tenant_id no cliente.';

COMMIT;
