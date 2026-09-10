-- Garantia no BANCO de que o corretor de um lead pertence ao tenant do lead.
--
-- POR QUE NO BANCO E NÃO SÓ NO CÓDIGO
-- O incidente de 10/set/2026 (leads do Lotus Brokers atribuídos a corretores da
-- Imobiliaria Japi, legíveis e editáveis por eles) precisou de DOIS ingredientes:
--   1. alguém escrever em leads.assigned_agent_id um usuário de outro tenant;
--   2. a RLS deixar esse usuário ler a linha.
-- O (2) foi fechado em 20260910_fix_leads_rls_cross_tenant_assignee.sql. O (1)
-- foi fechado nos caminhos de código conhecidos (server/leadAssignment.js), mas
-- NADA no banco impedia. Havia duas implementações divergentes da atribuição, um
-- trigger de roleta em SQL, endpoints de PATCH, scripts de import e o SQL editor
-- — cada um uma porta. Uma trava só, no fim do funil, vale mais que N revisões.
--
-- SANEIA, NÃO REJEITA
-- O guard ANULA a atribuição inválida em vez de levantar exceção. Rejeitar o
-- INSERT descartaria o lead inteiro, e a regra desta base é explícita: lead
-- misroteado é ruim, lead perdido é pior. Anulado, o lead entra sem corretor —
-- estado normal e visível para todo o tenant — e a distribuição é refeita.
--
-- ORDEM DOS TRIGGERS
-- O Postgres dispara triggers BEFORE em ordem alfabética de nome.
-- `tr_leads_assign_roleta` (BEFORE INSERT, 20260428) escolhe o corretor a partir
-- de roleta_participantes, que também pode conter quem saiu do CRM. O guard
-- precisa rodar DEPOIS dele: daí o `zz` no nome. O espelho para `bolsao` é AFTER
-- INSERT, então já enxerga o valor saneado.

CREATE OR REPLACE FUNCTION public.tg_leads_assignee_must_be_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só valida quando a atribuição está sendo DEFINIDA ou TROCADA. Sem isto,
  -- qualquer edição (mudar status, anotar comentário) num lead antigo cujo
  -- corretor já saiu perderia a atribuição como efeito colateral silencioso.
  IF TG_OP = 'UPDATE' AND NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.tenant_memberships tm
     WHERE tm.tenant_id = NEW.tenant_id
       AND tm.user_id::text = lower(NEW.assigned_agent_id)
  ) THEN
    RAISE WARNING 'lead %: corretor % nao e membro do tenant % — atribuicao anulada',
      NEW.id, NEW.assigned_agent_id, NEW.tenant_id;
    NEW.assigned_agent_id := NULL;
    NEW.assigned_agent_name := NULL;
    NEW.assigned_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_zz_assignee_guard ON public.leads;
CREATE TRIGGER tr_leads_zz_assignee_guard
  BEFORE INSERT OR UPDATE OF assigned_agent_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_leads_assignee_must_be_member();

-- ---------------------------------------------------------------------------
-- Tirar alguém do CRM tem que tirar o nome dele dos leads
-- ---------------------------------------------------------------------------
-- Era este o caminho da recorrência: removeTenantMember() e
-- deleteMemberCompletely() apagam a membership (e a linha de tenant_brokers),
-- mas NUNCA tocaram em `leads`. No dia seguinte os leads da pessoa continuavam
-- exibindo o nome dela, que já não existe no CRM — exatamente o sintoma
-- reportado ("tem leads com a Raquel Venturini sendo que ela nem está mais no
-- CRM"). Fica no banco porque a remoção acontece por vários caminhos, incluindo
-- SQL na mão.
--
-- Os leads voltam para o pool sem corretor (não são apagados nem arquivados),
-- prontos para redistribuição.

CREATE OR REPLACE FUNCTION public.tg_clear_leads_on_membership_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
     SET assigned_agent_id = NULL,
         assigned_agent_name = NULL,
         assigned_at = NULL
   WHERE tenant_id = OLD.tenant_id
     AND lower(assigned_agent_id) = OLD.user_id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_membership_delete_clears_leads ON public.tenant_memberships;
CREATE TRIGGER tr_membership_delete_clears_leads
  AFTER DELETE ON public.tenant_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_clear_leads_on_membership_delete();

-- VERIFICAÇÃO (rodar depois de aplicar):
--
-- 1) o invariante vale para a base inteira — tem que voltar 0:
--   SELECT count(*) FROM public.leads l
--    WHERE l.assigned_agent_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships tm
--                       WHERE tm.tenant_id = l.tenant_id
--                         AND tm.user_id::text = lower(l.assigned_agent_id));
--
-- 2) o guard realmente barra (rode numa transação e dê ROLLBACK):
--   BEGIN;
--     UPDATE public.leads
--        SET assigned_agent_id = '00000000-0000-4000-8000-000000000000'
--      WHERE id = (SELECT id FROM public.leads WHERE assigned_agent_id IS NOT NULL LIMIT 1);
--     -- espera WARNING e assigned_agent_id de volta para NULL, sem erro
--     SELECT id, assigned_agent_id FROM public.leads
--      WHERE id = (SELECT id FROM public.leads ORDER BY updated_at DESC LIMIT 1);
--   ROLLBACK;
--
-- ROLLBACK definitivo:
--   DROP TRIGGER IF EXISTS tr_leads_zz_assignee_guard ON public.leads;
--   DROP TRIGGER IF EXISTS tr_membership_delete_clears_leads ON public.tenant_memberships;
--   DROP FUNCTION IF EXISTS public.tg_leads_assignee_must_be_member();
--   DROP FUNCTION IF EXISTS public.tg_clear_leads_on_membership_delete();
