-- ============================================================
-- Imóveis de interesse do lead — o corretor adiciona mais de um.
--
-- UMA FONTE POR DADO. O PRIMEIRO imóvel continua sendo `leads.property_code`:
-- é ele que as integrações gravam e que relatórios, unidade e LIA leem.
-- Esta tabela guarda SÓ os imóveis a mais. Guardar o primeiro aqui também
-- seria a segunda cópia que o chefe proíbe — e as duas iam divergir.
--
-- "Sempre tem um": com o primeiro em `property_code`, apagar linha daqui nunca
-- zera o lead. A tela é que impede esvaziar o `property_code` de quem já tinha.
--
-- Quem pode: qualquer membro da imobiliária do lead — a MESMA régua do
-- UPDATE em `leads` (leads_update_policy). Quem pode trocar o imóvel
-- principal pode acrescentar outro.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_imoveis_interesse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  codigo text NOT NULL CHECK (length(btrim(codigo)) BETWEEN 1 AND 60),
  adicionado_por uuid DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- O mesmo código grafado "ap0929" e "AP0929 " é o mesmo imóvel.
CREATE UNIQUE INDEX IF NOT EXISTS lead_imoveis_interesse_lead_codigo_uq
  ON public.lead_imoveis_interesse (lead_id, upper(btrim(codigo)));

ALTER TABLE public.lead_imoveis_interesse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_imoveis_interesse_select ON public.lead_imoveis_interesse;
CREATE POLICY lead_imoveis_interesse_select ON public.lead_imoveis_interesse
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT user_tenant_ids()) OR is_platform_owner());

-- O tenant da linha tem de ser o do lead: sem isso, alguém da casa A
-- penduraria um imóvel num lead da casa B informando o próprio tenant.
DROP POLICY IF EXISTS lead_imoveis_interesse_insert ON public.lead_imoveis_interesse;
CREATE POLICY lead_imoveis_interesse_insert ON public.lead_imoveis_interesse
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id IN (SELECT user_tenant_ids()) OR is_platform_owner())
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.tenant_id = lead_imoveis_interesse.tenant_id)
  );

DROP POLICY IF EXISTS lead_imoveis_interesse_delete ON public.lead_imoveis_interesse;
CREATE POLICY lead_imoveis_interesse_delete ON public.lead_imoveis_interesse
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT user_tenant_ids()) OR is_platform_owner());

-- Sem UPDATE: trocar o código é apagar e adicionar.
REVOKE ALL ON public.lead_imoveis_interesse FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.lead_imoveis_interesse TO authenticated;

NOTIFY pgrst, 'reload schema';
