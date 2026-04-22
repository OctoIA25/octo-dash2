DROP POLICY IF EXISTS "memberships_update_tenant_admin" ON public.tenant_memberships;
CREATE POLICY "memberships_update_tenant_admin" ON public.tenant_memberships
  FOR UPDATE
  USING (is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (is_tenant_admin_or_owner(tenant_id));

DROP POLICY IF EXISTS "memberships_delete_tenant_admin" ON public.tenant_memberships;
CREATE POLICY "memberships_delete_tenant_admin" ON public.tenant_memberships
  FOR DELETE
  USING (is_tenant_admin_or_owner(tenant_id));
