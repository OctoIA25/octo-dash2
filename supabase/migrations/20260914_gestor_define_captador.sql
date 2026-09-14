-- Gestor (team_leader) passa a poder alterar os captadores do imóvel, como já
-- faz com os demais campos (CriarImovelForm: isManager inclui team_leader).
--
-- Só em imoveis_locais: tg_guard_captador é compartilhado com condominios, e lá
-- a regra (owner/admin ou captador atual) segue igual. O escopo de QUAIS imóveis
-- o gestor edita (atuação/equipe) continua sendo o gate de UI podeEditarImovel —
-- a RLS de imoveis_locais já é FOR ALL para qualquer membro do tenant.
--
-- Corpo idêntico ao vivo de 14/set (= 20260902_captador2_e_captador_edita.sql),
-- exceto a checagem de papel e a mensagem do RAISE.
--
-- ROLLBACK: reaplicar a função de 20260902_captador2_e_captador_edita.sql.

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
      AND (role IN ('admin', 'owner')
           OR (role = 'team_leader' AND TG_TABLE_NAME = 'imoveis_locais'))
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

  RAISE EXCEPTION 'Somente owner/admin/gestor do tenant ou o captador atual pode definir o captador'
    USING ERRCODE = '42501';
END $$;
