-- ============================================================
-- MIGRATION: Trigger que enfileira o Agente de Recuperação ao arquivar um lead
--
-- Espelha o padrão de tg_mirror_lead_to_proposal (20260602): reage a archived_at
-- em public.leads, é SECURITY DEFINER, e NUNCA pode bloquear o arquivamento
-- (qualquer falha cai no EXCEPTION → RAISE WARNING e retorna NEW).
--
-- O agente é acionado SOMENTE na transição real ativo → arquivado
-- (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL). Isso garante:
--   - Rearquivamento (arquiva→desarquiva→arquiva) reenviam (novo archived_at).
--   - UPDATEs redundantes (ex.: só updated_at/status) NÃO disparam.
--   - Arquivamentos concorrentes do mesmo lead caem no ON CONFLICT DO NOTHING.
--
-- O trigger apenas ENFILEIRA. A decisão de enviar (agente habilitado, conteúdo,
-- proteção de ambiente, idempotência de envio) é do worker server-side, que
-- reutiliza deliverRecommendation().
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_enqueue_recovery_on_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só a transição real ativo → arquivado interessa.
  IF NEW.archived_at IS NULL OR OLD.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.recovery_queue (
    tenant_id, lead_id, lead_source, lead_name, lead_phone,
    archived_at, archive_reason, idempotency_key
  ) VALUES (
    NEW.tenant_id,
    NEW.id::text,
    'crm',
    NULLIF(NEW.name, ''),
    NULLIF(NEW.phone, ''),
    NEW.archived_at,
    NULLIF(NEW.archive_reason, ''),
    -- tenant|lead|archived_at: novo arquivamento = nova key (reenvia);
    -- duplicata técnica do mesmo evento = mesma key (barrada pelo UNIQUE).
    NEW.tenant_id::text || '|' || NEW.id::text || '|' || NEW.archived_at::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- O agente é secundário: jamais pode bloquear o arquivamento do lead.
    RAISE WARNING 'tg_enqueue_recovery_on_archive falhou para lead %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- AFTER UPDATE OF archived_at: o trigger só é reavaliado quando a coluna consta
-- do UPDATE; a checagem OLD/NEW garante a semântica de transição.
DROP TRIGGER IF EXISTS tr_leads_enqueue_recovery ON public.leads;
CREATE TRIGGER tr_leads_enqueue_recovery
  AFTER UPDATE OF archived_at ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_enqueue_recovery_on_archive();

COMMENT ON FUNCTION public.tg_enqueue_recovery_on_archive()
  IS 'Enfileira o Agente de Recuperação (recovery_queue) na transição ativo→arquivado de um lead do CRM. Nunca bloqueia o arquivamento.';
