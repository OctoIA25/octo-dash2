-- 2º captador (opcional) + permissão: o captador atual do registro também
-- pode alterar os captadores (antes era só owner/admin).
--
-- captador_2_id segue o mesmo desenho do captador_id
-- (20260810_add_captador_to_imoveis_condominios.sql): uuid puro sem FK,
-- NULL = sem 2º captador. A coluna existe nas DUAS tabelas mesmo sem UI em
-- condomínios, porque tg_guard_captador é compartilhado e referencia
-- NEW.captador_2_id — em plpgsql isso quebra em runtime na tabela sem a coluna.

ALTER TABLE public.imoveis_locais ADD COLUMN IF NOT EXISTS captador_2_id uuid;
ALTER TABLE public.condominios    ADD COLUMN IF NOT EXISTS captador_2_id uuid;

COMMENT ON COLUMN public.imoveis_locais.captador_2_id IS
  'auth.users.id do 2º corretor captador (opcional). NULL = sem 2º captador. Guard: tg_guard_captador.';
COMMENT ON COLUMN public.condominios.captador_2_id IS
  'auth.users.id do 2º corretor captador (opcional). NULL = sem 2º captador. Guard: tg_guard_captador.';

-- Quem pode definir/alterar captador_id e captador_2_id:
--   - platform owner;
--   - admin/owner do tenant;
--   - o captador ATUAL do registro (captador_id ou captador_2_id = auth.uid()).
--
-- CriarImovelForm salva com .upsert(), então o trigger só vê TG_OP='INSERT'
-- em imoveis_locais mesmo em edição — o "captador atual" nesse caminho é
-- resolvido consultando a linha que vai conflitar (tenant_id, codigo_imovel).
-- Condomínios usam .update()/.insert() separados e caem no caminho UPDATE.
CREATE OR REPLACE FUNCTION public.tg_guard_captador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_captador_atual uuid;
  v_captador2_atual uuid;
BEGIN
  -- INSERT sem captador nenhum: sempre passa. No upsert do PostgREST, coluna
  -- ausente do payload fica fora do SET do ON CONFLICT e mantém o valor salvo,
  -- então este caminho é o que deixa um corretor editar os demais campos.
  IF TG_OP = 'INSERT' AND NEW.captador_id IS NULL AND NEW.captador_2_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.captador_id IS NOT DISTINCT FROM OLD.captador_id
     AND NEW.captador_2_id IS NOT DISTINCT FROM OLD.captador_2_id THEN
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

  -- Captador atual do registro pode alterar os captadores.
  IF TG_OP = 'UPDATE' THEN
    v_captador_atual := OLD.captador_id;
    v_captador2_atual := OLD.captador_2_id;
  ELSIF TG_TABLE_NAME = 'imoveis_locais' THEN
    SELECT captador_id, captador_2_id
      INTO v_captador_atual, v_captador2_atual
      FROM public.imoveis_locais
     WHERE tenant_id = NEW.tenant_id
       AND codigo_imovel = NEW.codigo_imovel;
  END IF;

  IF auth.uid() IS NOT NULL
     AND (auth.uid() = v_captador_atual OR auth.uid() = v_captador2_atual) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Somente owner/admin do tenant ou o captador atual pode definir o captador'
    USING ERRCODE = '42501';
END $$;
