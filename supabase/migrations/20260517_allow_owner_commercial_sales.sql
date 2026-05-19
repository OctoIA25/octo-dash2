-- Allow the platform owner account to read/write commercial sales while impersonating tenants.

ALTER TABLE public.commercial_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_sales_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view commercial sales" ON public.commercial_sales;
CREATE POLICY "Members can view commercial sales" ON public.commercial_sales
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers can write commercial sales" ON public.commercial_sales;
CREATE POLICY "Managers can write commercial sales" ON public.commercial_sales
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  );

DROP POLICY IF EXISTS "Members can view commercial sales import batches" ON public.commercial_sales_import_batches;
CREATE POLICY "Members can view commercial sales import batches" ON public.commercial_sales_import_batches
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers can write commercial sales import batches" ON public.commercial_sales_import_batches;
CREATE POLICY "Managers can write commercial sales import batches" ON public.commercial_sales_import_batches
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_memberships
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner', 'team_leader')
    )
  );
