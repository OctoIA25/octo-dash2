-- Captador (corretor que captou) em imóveis locais e condomínios.
--
-- Por que coluna e não imoveis_corretores: aquela tabela é chaveada por
-- codigo_imovel, e condomínios não têm código (0 de 80 preenchidos na Japi
-- Lançamentos). imoveis_corretores continua sendo só o mapa derivado do XML.
--
-- uuid puro, sem FK, seguindo a convenção de criado_por / aprovado_por /
-- imoveis_corretores.corretor_id. NULL = "sem captador", estado válido.

ALTER TABLE public.imoveis_locais ADD COLUMN IF NOT EXISTS captador_id uuid;
ALTER TABLE public.condominios    ADD COLUMN IF NOT EXISTS captador_id uuid;

COMMENT ON COLUMN public.imoveis_locais.captador_id IS
  'auth.users.id do corretor que captou o imóvel. NULL = sem captador. Só owner/admin define (trigger tg_guard_captador).';
COMMENT ON COLUMN public.condominios.captador_id IS
  'auth.users.id do corretor que captou o condomínio. NULL = sem captador. Só owner/admin define (trigger tg_guard_captador).';

CREATE INDEX IF NOT EXISTS idx_imoveis_locais_captador
  ON public.imoveis_locais (tenant_id, captador_id);
CREATE INDEX IF NOT EXISTS idx_condominios_captador
  ON public.condominios (tenant_id, captador_id);

-- A RLS das duas tabelas é FOR ALL para qualquer membro do tenant
-- (20260624_owner_policies_lote2b_consolida.sql). Gate só na UI não segura:
-- um corretor manda PATCH direto no PostgREST e se autoatribui a captação.
-- SECURITY DEFINER + search_path fixo seguem o padrão de is_platform_owner()
-- (20260624_create_platform_owners.sql) e são necessários porque a leitura de
-- tenant_memberships aqui dentro não pode depender da RLS do chamador.
CREATE OR REPLACE FUNCTION public.tg_guard_captador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.captador_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.captador_id IS NOT DISTINCT FROM OLD.captador_id THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_owner() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND tenant_id = NEW.tenant_id
      AND role IN ('admin', 'owner')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Somente owner ou admin do tenant pode definir o captador'
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS trg_guard_captador_imoveis_locais ON public.imoveis_locais;
CREATE TRIGGER trg_guard_captador_imoveis_locais
  BEFORE INSERT OR UPDATE ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_captador();

DROP TRIGGER IF EXISTS trg_guard_captador_condominios ON public.condominios;
CREATE TRIGGER trg_guard_captador_condominios
  BEFORE INSERT OR UPDATE ON public.condominios
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_captador();
