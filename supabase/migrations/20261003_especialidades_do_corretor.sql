-- =============================================================================
-- Especialidades do corretor — até 5 por pessoa (pedido de 30/09).
--
-- Marcadas pelo admin em Gestão de Equipe › Gerenciar Permissões, logo abaixo
-- de Atuação. Servem a duas coisas: a página do corretor no site (SEO) e, mais
-- adiante, distribuir lead pelo que o corretor sabe vender.
--
-- Por que COLUNA e não mais uma chave em `permissions` (onde mora a Atuação):
-- o site lê a equipe com a anon key, e o anon só enxerga as colunas liberadas
-- uma a uma (id, user_id, tenant_id, role, creci). O `permissions` fica fechado
-- de propósito — carrega WhatsApp, limite de leads e menu. Coluna própria é o
-- único jeito de publicar a especialidade sem publicar o resto.
--
-- Vocabulário ABERTO, como as preferências do lead (20260819): o front sugere
-- uma lista, o admin digita o que quiser. Por isso o CHECK é de tamanho, não de
-- conteúdo. O limite por termo (40 caracteres) fica no front.
--
-- `cardinality`, não `array_length`: array_length('{}') é NULL, e um CHECK que
-- avalia NULL PASSA — "BETWEEN 1 AND 5" deixaria o vazio entrar. Sem
-- especialidade é NULL, uma forma só.
-- =============================================================================

BEGIN;

ALTER TABLE public.tenant_memberships ADD COLUMN IF NOT EXISTS especialidades text[];

ALTER TABLE public.tenant_memberships DROP CONSTRAINT IF EXISTS tenant_memberships_especialidades_check;
ALTER TABLE public.tenant_memberships ADD CONSTRAINT tenant_memberships_especialidades_check
  CHECK (especialidades IS NULL OR (
    cardinality(especialidades) BETWEEN 1 AND 5
    AND array_position(especialidades, NULL) IS NULL
    AND length(array_to_string(especialidades, ',')) <= 5 * 40 + 4));

COMMENT ON COLUMN public.tenant_memberships.especialidades IS
  'Até 5 especialidades do corretor (texto livre, sugeridas pela tela). Pública: o site lê pela anon key. NULL = nenhuma.';

-- O site. A linha já é filtrada por portal_anon_select_memberships (corretores
-- e gestores da Lotus); aqui só se libera a coluna.
GRANT SELECT (especialidades) ON public.tenant_memberships TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- ROLLBACK
--   REVOKE SELECT (especialidades) ON public.tenant_memberships FROM anon;
--   ALTER TABLE public.tenant_memberships DROP CONSTRAINT IF EXISTS tenant_memberships_especialidades_check;
--   ALTER TABLE public.tenant_memberships DROP COLUMN IF EXISTS especialidades;
--   NOTIFY pgrst, 'reload schema';
-- =============================================================================
