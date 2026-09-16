-- =============================================================================
-- Conversa com lead_id mas sem lead_source_table: completa origem e dono
--
-- Complementa a 20260916_whatsapp_conversa_segue_corretor_do_lead.sql, que não
-- resolveu o caso real da gestora (Lotus): ao abrir o lead, a tela abre a
-- conversa COM mensagens, e essa é criada pela Lia por fora, ~0,5s depois do
-- lead — muitas vezes com o wa_id da Meta sem o 9º dígito, então é uma SEGUNDA
-- conversa, não a que o trigger do lead criou. A Lia grava lead_id mas não
-- lead_source_table nem assigned_user_id. Resultado: nenhum braço da RLS
-- enxergava a conversa (dono NULL; atuação e sync dependem da origem).
--
-- CORREÇÃO: toda conversa gravada com lead_id ganha, quando faltam,
--   • lead_source_table — procurando o id em leads e depois em kenlo_leads;
--   • assigned_user_id  — o corretor atual do lead (só de `leads`).
-- Só preenche vazio: nunca troca origem nem dono já definidos (o /assign e a
-- transferência de lead continuam mandando). Trocas de corretor depois disso
-- seguem pelo tr_leads_sync_whatsapp_owner_upd, que agora encontra a conversa.
--
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fill_whatsapp_conversation_lead_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $link$
DECLARE
  v_owner text;
BEGIN
  IF NEW.lead_source_table IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id AND tenant_id = NEW.tenant_id) THEN
      NEW.lead_source_table := 'leads';
    ELSIF EXISTS (SELECT 1 FROM public.kenlo_leads WHERE id = NEW.lead_id AND tenant_id = NEW.tenant_id) THEN
      NEW.lead_source_table := 'kenlo_leads';
    END IF;
  END IF;

  IF NEW.assigned_user_id IS NULL AND NEW.lead_source_table = 'leads' THEN
    SELECT assigned_agent_id INTO v_owner
      FROM public.leads WHERE id = NEW.lead_id AND tenant_id = NEW.tenant_id;
    NEW.assigned_user_id := v_owner::uuid;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca derrubar a gravação da conversa (mensagem da Lia) por causa do vínculo.
  RAISE WARNING 'fill_whatsapp_conversation_lead_link: % (conversa %)', SQLERRM, NEW.id;
  RETURN NEW;
END;
$link$;

DROP TRIGGER IF EXISTS tr_whatsapp_conversation_lead_link ON public.whatsapp_conversations;
CREATE TRIGGER tr_whatsapp_conversation_lead_link
  BEFORE INSERT OR UPDATE OF lead_id, lead_source_table ON public.whatsapp_conversations
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.fill_whatsapp_conversation_lead_link();

-- Backfill das que já existem (Lotus 17, Japi 100): o SET na coluna dispara o
-- trigger acima, que completa origem e dono.
UPDATE public.whatsapp_conversations
   SET lead_source_table = NULL
 WHERE lead_id IS NOT NULL
   AND lead_source_table IS NULL;
