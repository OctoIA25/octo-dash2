-- ============================================================
-- Só a diretoria e o gerente redistribuem lead
--
-- Decidido com o chefe em 24/09, seguindo o print do CORE:
--
--   | Permissão                          | Dir | Ger | Corretor |
--   |------------------------------------|-----|-----|----------|
--   | Ver e atender os próprios leads    |  ✓  |  ✓  |    ✓     |
--   | Ver leads de toda a equipe         |  ✓  |  ✓  |    —     |
--   | Redistribuir leads entre corretores|  ✓  |  ✓  |    —     |
--
-- ============================================================
-- O QUE EXISTIA ANTES: NADA
-- ============================================================
--
-- Medido em produção em 23/09. A regra de escrita em `leads` é uma só:
--
--     leads_update_policy ... USING (tenant_id IN (SELECT user_tenant_ids()))
--
-- Ou seja: **"é da mesma imobiliária"**. Qualquer corretor podia reatribuir
-- qualquer lead da casa — inclusive puxar para si o lead de um colega, sem
-- registro de que fez isso. Não era "o cargo deveria controlar": era nada
-- controlando.
--
-- ============================================================
-- POR QUE UM GATILHO, E NÃO UMA POLICY
-- ============================================================
--
-- O RLS decide a LINHA inteira: ou a pessoa pode atualizar o lead, ou não
-- pode. Aqui o que muda é UMA COLUNA — o corretor continua editando status,
-- comentário, visita e tudo o mais do lead dele. Uma policy que negasse o
-- UPDATE inteiro tiraria o trabalho junto com a redistribuição.
--
-- É o mesmo desenho de `venda_protege_comissao_pct`, que já protege o
-- percentual da comissão sem trancar a venda.
--
-- ============================================================
-- OS QUATRO CAMINHOS QUE CONTINUAM PASSANDO — E POR QUÊ
-- ============================================================
--
-- 1. **O servidor** (`auth.uid()` nulo). Roleta, bolsão e a LIA atribuem lead
--    sozinhos, falando com o banco sem JWT. Sem esta porta, a distribuição
--    automática inteira para de funcionar.
--
-- 2. **O dono da plataforma.**
--
-- 3. **Admin e team_leader** — a Diretoria e o Gerente do print.
--
-- 4. **O corretor pegando para si um lead SEM DONO.** É o bolsão: a tela
--    escreve `assigned_agent_id = <ele mesmo>` pela sessão dele
--    (`BolsaoSection.tsx`). O print dá isso ao corretor, na linha "ver e
--    atender os próprios leads" — pegar da fila não é tirar de ninguém.
--
--    Tivesse eu bloqueado sem procurar quem escreve nessa coluna, o botão
--    "Assumir lead" quebraria para 14 corretores.
--
-- Soltar o PRÓPRIO lead de volta também passa: devolver para a fila não é
-- redistribuir entre corretores, e trancar isso quebraria um botão que eu
-- não rastreei.
--
-- ============================================================
-- POR QUE ERRO, E NÃO CORREÇÃO SILENCIOSA
-- ============================================================
--
-- O guarda vizinho (`tg_leads_assignee_must_be_member`) ANULA a atribuição
-- quando o destinatário não é da casa. Aqui não: quem tenta tirar o lead de
-- um colega precisa SABER que não pode. Reverter calado mostraria a tela
-- "dando certo" e o lead voltando sozinho no refresh — o pior dos dois
-- mundos, e o tipo de coisa que vira "o sistema é bugado".
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_leads_so_gestor_redistribui()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  -- A atribuição não mudou: não é assunto deste guarda.
  IF NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
    RETURN NEW;
  END IF;

  -- O servidor (roleta, bolsão, LIA) e o dono da plataforma.
  IF v_uid IS NULL OR public.is_platform_owner() THEN
    RETURN NEW;
  END IF;

  SELECT tm.role INTO v_role
    FROM public.tenant_memberships tm
   WHERE tm.tenant_id = NEW.tenant_id
     AND tm.user_id = v_uid;

  -- Diretoria e Gerente.
  IF v_role IN ('admin', 'team_leader') THEN
    RETURN NEW;
  END IF;

  -- O corretor pegando para si um lead sem dono — o bolsão.
  IF OLD.assigned_agent_id IS NULL
     AND lower(COALESCE(NEW.assigned_agent_id, '')) = v_uid::text THEN
    RETURN NEW;
  END IF;

  -- O corretor devolvendo o PRÓPRIO lead para a fila.
  IF NEW.assigned_agent_id IS NULL
     AND lower(COALESCE(OLD.assigned_agent_id, '')) = v_uid::text THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Só a diretoria e o gerente redistribuem lead. Você pode pegar um lead sem dono, mas não tirar o de outra pessoa.'
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

-- `zzz` para rodar DEPOIS de `tr_leads_zz_assignee_guard`, que pode anular a
-- atribuição quando o destinatário não é da casa. Os gatilhos disparam em
-- ordem alfabética, e este precisa ver o valor final.
DROP TRIGGER IF EXISTS tr_leads_zzz_redistribuicao ON public.leads;
CREATE TRIGGER tr_leads_zzz_redistribuicao
  BEFORE UPDATE OF assigned_agent_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_leads_so_gestor_redistribui();

COMMENT ON FUNCTION public.tg_leads_so_gestor_redistribui() IS
  'Redistribuir lead é de admin/team_leader (Diretoria e Gerente do print do CORE). O corretor pega lead sem dono e devolve o próprio; tirar o de outro levanta erro. Servidor sem JWT passa: é a roleta e a LIA.';

COMMIT;
