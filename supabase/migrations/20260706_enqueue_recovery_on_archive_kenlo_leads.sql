-- ============================================================
-- MIGRATION: Agente de Recuperação também dispara ao arquivar lead de kenlo_leads
--
-- Contexto (decisão D4 do projeto Contact2Sale): quando a C2S — que é o CRM
-- principal do tenant — arquiva um lead, isso reflete em kenlo_leads.archived_at
-- (merge origem-vence). O Agente de Recuperação deve reagir EXATAMENTE como
-- reage ao arquivamento manual em public.leads (trigger 20260619). Hoje o gatilho
-- só existe em public.leads; esta migração fecha a lacuna para kenlo_leads.
--
-- Por que uma função separada (e não reusar tg_enqueue_recovery_on_archive)?
-- A função de `leads` lê as colunas name/phone; kenlo_leads usa client_name /
-- client_phone (schema distinto — 20260701/leadNormalizer). O restante é idêntico:
-- roda como definer, nunca bloqueia o arquivamento (EXCEPTION → WARNING), mesma
-- idempotency_key (tenant|lead|archived_at), mesma recovery_queue. O worker
-- (server/recommendations/recoveryWorker.js) é self-contained pela fila: monta o
-- lead de lead_name/lead_phone da própria fila, nunca re-busca em `leads` — então
-- NENHUM ajuste de código é necessário.
--
-- lead_source = 'contact2sale': rótulo de origem para o histórico
-- (lead_recommendations.lead_source aceita texto livre; recovery_queue.lead_source
-- não tem CHECK). O worker não ramifica nesse valor.
--
-- DOIS caminhos de entrada em kenlo_leads acionam a recuperação, cobrindo o mesmo
-- que o UPDATE manual cobre em `leads`:
--
--   1) UPDATE (transição ativo→arquivado): o sync C2S grava via UPSERT; o merge
--      (mergeC2sLeadUpdate) inclui archived_at no patch APENAS na transição, então
--      o ON CONFLICT DO UPDATE gera "SET archived_at = EXCLUDED.archived_at" e o
--      trigger AFTER UPDATE OF archived_at dispara — na transição, uma vez.
--
--   2) INSERT já arquivado, porém FRESCO: um lead criado E arquivado na C2S dentro
--      da mesma janela entre ciclos chega aqui como INSERT (prev ausente), não
--      UPDATE — então o AFTER UPDATE não o pegaria. O AFTER INSERT abaixo cobre
--      esse caso. GATE OBRIGATÓRIO `is_backfill IS NOT TRUE`: no primeiro sync de
--      um tenant a base histórica inteira entra por INSERT com is_backfill=true;
--      sem o gate, recuperaríamos em massa todo arquivado histórico (spam). Com o
--      gate, só o lead LIVE novo-e-arquivado aciona — que é recuperação legítima,
--      não histórico morto. (Simétrico ao is_backfill que silencia a Lia.)
--
-- Idempotente: reaplicável.
-- ============================================================

-- Corpo compartilhado pelos dois triggers (UPDATE e INSERT): enfileira 1 item na
-- recovery_queue a partir de uma linha de kenlo_leads. Idempotente por evento.
CREATE OR REPLACE FUNCTION public.enqueue_recovery_from_kenlo_lead(lead public.kenlo_leads)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.recovery_queue (
    tenant_id, lead_id, lead_source, lead_name, lead_phone,
    archived_at, archive_reason, idempotency_key
  ) VALUES (
    lead.tenant_id,
    lead.id::text,
    'contact2sale',
    NULLIF(lead.client_name, ''),   -- kenlo_leads: client_name (não name)
    NULLIF(lead.client_phone, ''),  -- kenlo_leads: client_phone (não phone)
    lead.archived_at,
    NULLIF(lead.archive_reason, ''),
    -- Mesma chave do trigger de `leads`: novo arquivamento = nova key (reenvia);
    -- duplicata técnica do mesmo evento = mesma key (barrada pelo UNIQUE).
    lead.tenant_id::text || '|' || lead.id::text || '|' || lead.archived_at::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

-- Trigger 1 — UPDATE: transição real ativo → arquivado (idêntico ao de `leads`).
CREATE OR REPLACE FUNCTION public.tg_enqueue_recovery_on_archive_kenlo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.archived_at IS NULL OR OLD.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.enqueue_recovery_from_kenlo_lead(NEW);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- O agente é secundário: jamais pode bloquear o arquivamento do lead.
    RAISE WARNING 'tg_enqueue_recovery_on_archive_kenlo falhou para lead %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Trigger 2 — INSERT: lead que já nasce arquivado E é fresco (não histórico).
CREATE OR REPLACE FUNCTION public.tg_enqueue_recovery_on_insert_kenlo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_recovery_from_kenlo_lead(NEW);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'tg_enqueue_recovery_on_insert_kenlo falhou para lead %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- AFTER UPDATE OF archived_at: reavaliado só quando a coluna consta do UPDATE;
-- a checagem OLD/NEW garante a semântica de transição ativo→arquivado.
DROP TRIGGER IF EXISTS tr_kenlo_leads_enqueue_recovery ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_enqueue_recovery
  AFTER UPDATE OF archived_at ON public.kenlo_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enqueue_recovery_on_archive_kenlo();

-- AFTER INSERT: só lead já arquivado E fresco (o WHEN filtra na origem; o gate
-- is_backfill IS NOT TRUE é o que impede a enxurrada no primeiro sync).
DROP TRIGGER IF EXISTS tr_kenlo_leads_enqueue_recovery_insert ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_enqueue_recovery_insert
  AFTER INSERT ON public.kenlo_leads
  FOR EACH ROW
  WHEN (NEW.archived_at IS NOT NULL AND NEW.is_backfill IS NOT TRUE)
  EXECUTE FUNCTION public.tg_enqueue_recovery_on_insert_kenlo();

COMMENT ON FUNCTION public.enqueue_recovery_from_kenlo_lead(public.kenlo_leads)
  IS 'Enfileira o Agente de Recuperação (recovery_queue) a partir de uma linha de kenlo_leads. Compartilhado pelos triggers de UPDATE (transição) e INSERT (lead fresco já arquivado). Mapeia client_name/client_phone; lead_source=contact2sale.';
