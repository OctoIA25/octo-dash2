-- Migration: aprovação de imóvel/condomínio só por admin, owner ou gestor
-- Data: 2026-09-07
--
-- Contexto: o gate de aprovação existia SÓ no React (MeusImoveisTab /
-- CondominiosTab). A RLS de imoveis_locais e condominios é `FOR ALL TO
-- authenticated` checando apenas o tenant, então qualquer membro — inclusive
-- corretor — conseguia setar status_aprovacao='aprovado' chamando o PostgREST
-- direto com o próprio token, e com isso empurrar um imóvel pro feed do
-- ZAP/Imovelweb sozinho.
--
-- Por que trigger e não política RLS: uma policy não consegue comparar OLD com
-- NEW (USING vê o OLD, WITH CHECK vê o NEW, e não dá pra referenciar os dois na
-- mesma expressão). A regra aqui é sobre a MUDANÇA da coluna, não sobre o valor.
--
-- Quem pode: reusa public.proposals_is_tenant_manager(tenant_id), que já é
-- exatamente admin/owner/team_leader + platform owner. Nome herdado de
-- proposals; não vale duplicar a função só pelo nome.

CREATE OR REPLACE FUNCTION public.tg_guard_status_aprovacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (proxy-production / api-server) não tem auth.uid(): passa direto.
  IF auth.uid() IS NULL OR public.proposals_is_tenant_manager(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Corretor cadastra, nunca já aprovado.
    NEW.status_aprovacao := 'aguardando';
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
    NEW.motivo_aprovacao := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: preserva em vez de RAISE de propósito. O formulário de edição manda
  -- status_aprovacao em TODO save (CriarImovelForm.tsx:1093), então um corretor
  -- editando o próprio imóvel dispararia exceção e perderia a edição inteira por
  -- um campo que ele nem quis mexer. Preservando, a edição passa e a aprovação
  -- fica intacta.
  NEW.status_aprovacao := OLD.status_aprovacao;
  NEW.aprovado_por := OLD.aprovado_por;
  NEW.aprovado_em := OLD.aprovado_em;
  NEW.motivo_aprovacao := OLD.motivo_aprovacao;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_status_aprovacao ON public.imoveis_locais;
CREATE TRIGGER tr_guard_status_aprovacao
  BEFORE INSERT OR UPDATE ON public.imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_status_aprovacao();

DROP TRIGGER IF EXISTS tr_guard_status_aprovacao ON public.condominios;
CREATE TRIGGER tr_guard_status_aprovacao
  BEFORE INSERT OR UPDATE ON public.condominios
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_status_aprovacao();

COMMENT ON FUNCTION public.tg_guard_status_aprovacao() IS
  'Só admin/owner/team_leader (ou o servidor via service_role) muda status_aprovacao. Não-gestor tem a mudança descartada silenciosamente, não bloqueada.';
