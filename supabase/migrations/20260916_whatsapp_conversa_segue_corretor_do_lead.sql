-- =============================================================================
-- Conversa WhatsApp segue o corretor do lead
--
-- PROBLEMA (16/09, Lotus): gestora não via as conversas dos leads da equipe — e
-- nem os próprios corretores viam as dos leads deles. A RLS (20260816/0826/0830)
-- decide pelo dono da conversa, `whatsapp_conversations.assigned_user_id`, que só
-- era preenchido pela Lia via POST /api/v1/whatsapp/conversations/assign. A Lia
-- passou a distribuir inserindo direto em `leads` (20260914) e nunca chama o
-- /assign: 1.495 de 1.499 conversas da Lotus estavam sem dono (só admin via),
-- embora 979 delas fossem de leads com corretor.
--
-- CORREÇÃO: o dono da conversa passa a espelhar `leads.assigned_agent_id`.
-- Trigger no banco pelo mesmo motivo da 20260702: é o único ponto que cobre
-- TODAS as portas de distribuição (Lia/n8n, roleta, bolsão, transferência no
-- Kanban, SQL editor) sem espalhar chamadas. O /assign continua valendo para
-- conversas cujo lead não tem corretor.
--
--   • lead entra COM corretor  → conversa do lead ganha esse dono;
--   • corretor do lead muda    → conversa muda junto (o anterior perde acesso);
--   • lead volta a ficar sem corretor → conversa sem dono (só admin/gestão vê).
--
-- O valor já chega saneado: tr_leads_zz_assignee_guard (BEFORE, 20260910) anula
-- corretor que não é membro do tenant, então o ::uuid não falha na prática — o
-- EXCEPTION é só para nunca derrubar a escrita do lead por causa do chat.
--
-- ponytail: casa pela ligação lead_id (a mesma que o chat usa para abrir o lead).
-- Lead duplicado do mesmo telefone não reatribui a conversa, que continua ligada
-- ao primeiro lead (~30 casos na Lotus). Se incomodar, casar por telefone.
--
-- kenlo_leads fica de fora: a única base com conversas de lá (Japi) tem 1 lead
-- com attended_by_id. Acrescentar o mesmo trigger lá se isso mudar.
--
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_whatsapp_conversation_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $sync$
BEGIN
  UPDATE public.whatsapp_conversations
     SET assigned_user_id = NEW.assigned_agent_id::uuid
   WHERE tenant_id = NEW.tenant_id
     AND lead_id = NEW.id
     AND lead_source_table = 'leads'
     AND assigned_user_id IS DISTINCT FROM NEW.assigned_agent_id::uuid;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_whatsapp_conversation_owner: % (lead %)', SQLERRM, NEW.id;
  RETURN NULL;
END;
$sync$;

-- AFTER: a conversa é criada/ligada no BEFORE (tr_ensure_whatsapp_conversation*)
-- e o corretor já passou pelo guard.
-- Lead sem corretor no INSERT não mexe: a conversa pode já ter dono (inbound
-- antigo atribuído pelo /assign).
DROP TRIGGER IF EXISTS tr_leads_sync_whatsapp_owner_ins ON public.leads;
CREATE TRIGGER tr_leads_sync_whatsapp_owner_ins
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.assigned_agent_id IS NOT NULL)
  EXECUTE FUNCTION public.sync_whatsapp_conversation_owner();

DROP TRIGGER IF EXISTS tr_leads_sync_whatsapp_owner_upd ON public.leads;
CREATE TRIGGER tr_leads_sync_whatsapp_owner_upd
  AFTER UPDATE OF assigned_agent_id ON public.leads
  FOR EACH ROW
  WHEN (OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id)
  EXECUTE FUNCTION public.sync_whatsapp_conversation_owner();

-- Backfill: conversas de leads que já têm corretor. Não limpa dono de conversa
-- cujo lead está sem corretor (preserva atribuições feitas pelo /assign).
UPDATE public.whatsapp_conversations c
   SET assigned_user_id = l.assigned_agent_id::uuid
  FROM public.leads l
 WHERE c.lead_source_table = 'leads'
   AND c.lead_id = l.id
   AND c.tenant_id = l.tenant_id
   AND l.assigned_agent_id IS NOT NULL
   AND c.assigned_user_id IS DISTINCT FROM l.assigned_agent_id::uuid;

COMMENT ON COLUMN public.whatsapp_conversations.assigned_user_id IS
  'Corretor dono da conversa (auth.users.id). Define a visibilidade: NULL = só admin/owner/gestão. Espelha leads.assigned_agent_id via tr_leads_sync_whatsapp_owner_* (20260916); para conversa sem lead com corretor, a Lia atribui via POST /api/v1/whatsapp/conversations/assign.';
