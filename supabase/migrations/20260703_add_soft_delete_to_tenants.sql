-- Soft-delete de imobiliárias (tenants.deleted_at).
--
-- Motivação: apagar tenant com DELETE é irreversível e cascateia dezenas de
-- tabelas (leads, kenlo_leads, memberships, configs...). Soft-delete marca
-- deleted_at e o tenant some dos caminhos de acesso; restaurar = NULL de volta.
--
-- Onde o filtro é aplicado (defesa em camadas):
--   1. View my_memberships_with_tenant (login): membership de tenant deletado
--      não retorna → AuthContext/useAuth caem no fluxo "sem membership" já
--      existente e o usuário não entra. Nenhuma mudança de front necessária.
--   2. RLS tenants_select: membro comum não lê tenant deletado; platform owner
--      continua lendo TODOS (necessário para listar/restaurar).
--   3. Server-side (service_role bypassa RLS, filtro é explícito no código):
--      deliverRecommendation (fonte única de envio: manual, agendado,
--      recuperação, campanhas) e os syncs Kenlo/Santa Ângela usam
--      server/utils/tenantSoftDelete.js para pular tenants deletados.
--
-- ⚠️ ORDEM DE DEPLOY: aplicar esta migração ANTES de deployar o código. O
-- helper server-side é fail-open: sem a coluna deleted_at, os filtros viram
-- no-op silencioso (só warn no log) até a migração ser aplicada.
--
-- ⚠️ PREFLIGHT: esta migração RECRIA a view my_memberships_with_tenant, cuja
-- definição atual NÃO está versionada no repo. Antes de aplicar:
--   1. Confira se a definição em produção tem só as colunas
--      user_id/role/tenant_id/code/name (se houver mais, adicione-as no
--      CREATE VIEW abaixo antes de rodar):
--        SELECT pg_get_viewdef('public.my_memberships_with_tenant'::regclass, true);
--   2. Confira se nenhuma outra view/função depende dela (o DROP VIEW sem
--      CASCADE aborta se houver dependente — falha ruidosa, sem corrupção):
--        SELECT DISTINCT dep_ns.nspname, dep_class.relname
--        FROM pg_depend d
--        JOIN pg_rewrite rw ON rw.oid = d.objid
--        JOIN pg_class dep_class ON dep_class.oid = rw.ev_class
--        JOIN pg_namespace dep_ns ON dep_ns.oid = dep_class.relnamespace
--        WHERE d.refobjid = 'public.my_memberships_with_tenant'::regclass
--          AND dep_class.relname <> 'my_memberships_with_tenant';
--
-- Operação (SQL Editor):
--   -- desativar:  UPDATE public.tenants SET deleted_at = now()
--   --             WHERE name IN ('...') AND deleted_at IS NULL RETURNING id, name;
--   -- lixeira:    SELECT id, name, deleted_at FROM public.tenants
--   --             WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC;
--   -- restaurar:  UPDATE public.tenants SET deleted_at = NULL
--   --             WHERE name IN ('...') RETURNING id, name;
--
-- Idempotente.

-- ===== 1) Coluna =====
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.tenants.deleted_at IS
  'Soft-delete: NULL = ativo. Preenchido = imobiliária desativada (some do '
  'login, dos syncs e dos envios; owner ainda vê tudo para poder restaurar). '
  'Restaurar = voltar para NULL.';

-- ===== 2) RLS: membro não lê tenant deletado; owner lê tudo =====
-- Varre TODAS as policies de SELECT de tenants (padrão do lote 2b: o banco já
-- divergiu do versionamento antes; uma policy permissiva sobrevivente em OR
-- anularia o filtro) e recria a canônica tenants_select.
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN RETURN; END IF;
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'tenants' AND cmd = 'SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenants', pol.policyname);
  END LOOP;

  CREATE POLICY "tenants_select" ON public.tenants FOR SELECT TO authenticated
    USING (
      public.is_platform_owner()
      OR (
        deleted_at IS NULL
        AND id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      )
    );
END $$;

-- ===== 3) View de login: membership de tenant deletado não aparece =====
-- Escopo por auth.uid() (mesmo contrato da view original, consumida por
-- AuthContext.tsx e useAuth.ts). DROP+CREATE para não depender da forma atual;
-- GRANT refeito porque o DROP descarta os privilégios.
DROP VIEW IF EXISTS public.my_memberships_with_tenant;
CREATE VIEW public.my_memberships_with_tenant AS
  SELECT tm.user_id, tm.role, tm.tenant_id, t.code, t.name
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = auth.uid()
    AND t.deleted_at IS NULL;

GRANT SELECT ON public.my_memberships_with_tenant TO authenticated;
