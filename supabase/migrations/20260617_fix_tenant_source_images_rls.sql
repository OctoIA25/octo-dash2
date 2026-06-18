-- C5: corrige o RLS de tenant_source_images (imagens de origem de leads por tenant).
--
-- Problema: as policies (20260205) referenciam uma tabela `users` que NÃO existe no
-- schema (SELECT tenant_id FROM users WHERE id = auth.uid()) — a regra falha/é inválida.
-- Correção: usar tenant_memberships (padrão do projeto) + owner. tenant_id é UUID (FK).
--
-- Uso verificado (não quebra fluxo): src/features/settings/pages/IntegracoesPage.tsx
-- (client autenticado) lê/grava filtrando por .eq('tenant_id', tenantId); a tela de
-- Integrações é exposta a owner/admin.

DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_source_images'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenant_source_images', pol.policyname); END LOOP;
END $$;

ALTER TABLE public.tenant_source_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_source_images_tenant_isolation" ON public.tenant_source_images
  FOR ALL TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = tenant_source_images.tenant_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = tenant_source_images.tenant_id AND tm.user_id = auth.uid())
  );
