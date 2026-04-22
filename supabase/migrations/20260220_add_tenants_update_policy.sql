-- Migration: Adicionar política de UPDATE na tabela tenants para o owner
-- Data: 2026-02-20
-- Descrição: Permite que o owner (email específico) possa atualizar os dados dos tenants
-- IMPORTANTE: Execute esta migration no Supabase SQL Editor

-- 1. Garantir que RLS está habilitado na tabela tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas antigas se existirem (para evitar conflitos)
DROP POLICY IF EXISTS "Owner can update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Owner can select all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant members can select own tenant" ON public.tenants;

-- 3. Criar política de SELECT - Owner vê todos, membros veem seu tenant
CREATE POLICY "Owner can select all tenants" ON public.tenants
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'octo.inteligenciaimobiliaria@gmail.com'
    OR
    id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
  );

-- 4. Criar política de UPDATE - Apenas o owner pode atualizar
CREATE POLICY "Owner can update tenants" ON public.tenants
  FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'octo.inteligenciaimobiliaria@gmail.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- 5. Criar política de INSERT - Apenas o owner pode criar tenants
DROP POLICY IF EXISTS "Owner can insert tenants" ON public.tenants;
CREATE POLICY "Owner can insert tenants" ON public.tenants
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- 6. Criar política de DELETE - Apenas o owner pode deletar tenants
DROP POLICY IF EXISTS "Owner can delete tenants" ON public.tenants;
CREATE POLICY "Owner can delete tenants" ON public.tenants
  FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'octo.inteligenciaimobiliaria@gmail.com'
  );
