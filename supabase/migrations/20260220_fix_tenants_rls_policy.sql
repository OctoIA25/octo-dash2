-- Migration: Corrigir política RLS da tabela tenants
-- Data: 2026-02-20
-- Descrição: Permite que membros de um tenant leiam os dados do seu próprio tenant
-- IMPORTANTE: Execute esta migration no Supabase SQL Editor

-- 1. Garantir que RLS está habilitado
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. Remover todas as políticas existentes para evitar conflitos
DROP POLICY IF EXISTS "Owner can update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Owner can select all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant members can select own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Owner can insert tenants" ON public.tenants;
DROP POLICY IF EXISTS "Owner can delete tenants" ON public.tenants;
DROP POLICY IF EXISTS "Owners can view all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Owners can insert tenants" ON public.tenants;
DROP POLICY IF EXISTS "Owners can update tenant features" ON public.tenants;
DROP POLICY IF EXISTS "Tenants can view their own tenant data" ON public.tenants;
DROP POLICY IF EXISTS "Tenants can update their own tenant data" ON public.tenants;

-- 3. Política de SELECT: Owner vê todos, membros veem seu tenant
CREATE POLICY "tenants_select_policy" ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    -- Owner pode ver todos os tenants
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR
    -- Membros podem ver seu próprio tenant
    id IN (
      SELECT tenant_id 
      FROM public.tenant_memberships 
      WHERE user_id = auth.uid()
    )
  );

-- 4. Política de INSERT: Apenas owner
CREATE POLICY "tenants_insert_policy" ON public.tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- 5. Política de UPDATE: Owner pode atualizar qualquer tenant
CREATE POLICY "tenants_update_policy" ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- 6. Política de DELETE: Apenas owner
CREATE POLICY "tenants_delete_policy" ON public.tenants
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- Verificar se as políticas foram criadas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'tenants';
