-- ============================================================
-- MIGRATION: Públicos (audiences) do módulo Comunicação
-- Um público = um segmento nomeado, reusável no Disparador/Campanhas.
-- Multi-tenant: isolamento por tenant_id + RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  segment JSONB NOT NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_audiences_tenant ON public.audiences(tenant_id, created_at DESC);

ALTER TABLE public.audiences ENABLE ROW LEVEL SECURITY;

-- SELECT: membro do tenant ou owner.
CREATE POLICY "audiences_select"
  ON public.audiences FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- INSERT: gestor (admin/team_leader/owner) ou owner da plataforma.
CREATE POLICY "audiences_insert"
  ON public.audiences FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- UPDATE: idem.
CREATE POLICY "audiences_update"
  ON public.audiences FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- DELETE: admin/owner.
CREATE POLICY "audiences_delete"
  ON public.audiences FOR DELETE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE OR REPLACE FUNCTION public.update_audiences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audiences_updated_at ON public.audiences;
CREATE TRIGGER trg_audiences_updated_at
  BEFORE UPDATE ON public.audiences
  FOR EACH ROW EXECUTE FUNCTION public.update_audiences_updated_at();

COMMENT ON TABLE public.audiences IS 'Públicos (segmentos nomeados) do módulo Comunicação, reusáveis no Disparador/Campanhas.';
COMMENT ON COLUMN public.audiences.segment IS 'Segmento estruturado { type, ...params } — um dos 6 tipos do Disparador, validado por validateSegment.';
