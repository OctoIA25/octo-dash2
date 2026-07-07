-- =============================================================================
-- Conversa WhatsApp automática para todo lead criado (qualquer origem)
--
-- No momento em que um lead entra no CRM (leads OU kenlo_leads), garante que
-- exista uma conversa em whatsapp_conversations para o telefone daquele
-- tenant — antes de qualquer mensagem ser enviada.
--
-- Por que trigger DB (e não código nas integrações): mesmo padrão do webhook
-- lead.created (20260517/20260625/20260701) — triggers AFTER INSERT em leads
-- e kenlo_leads são o único ponto que cobre TODAS as origens (Kenlo, Zap,
-- Santa Ângela, API, modal manual, importação, futuras) sem espalhar chamadas.
--
-- Normalização: mesmas regras de server/utils/phone.js (withCountryCode) —
-- só dígitos, remove DDI 55 duplicado, insere o 9º dígito em celulares BR de
-- 10 dígitos e prefixa DDI 55. É o formato do wa_id da Meta usado nas
-- conversas inbound. Antes de criar, procura o número também nas variantes
-- históricas (sem o 9º dígito / sem DDI) para NUNCA duplicar uma conversa
-- que o inbound já criou.
--
-- Vínculo lead ↔ conversa: lead_id (coluna já existente, não populada) +
-- lead_source_table (nova; 'leads' ou 'kenlo_leads') — mesmo racional do
-- source_table em webhook_events, pois os ids das duas tabelas são
-- indistinguíveis. Preenche apenas quando vazio; nunca sobrescreve.
--
-- Concorrência: UNIQUE (tenant_id, contact_phone) da 20260528 + ON CONFLICT.
-- Falha aqui NUNCA derruba a criação do lead (EXCEPTION → WARNING).
--
-- Link DENTRO da descrição: além de criar a conversa, o trigger anexa ao
-- final do texto do lead (leads.comments / kenlo_leads.message) uma linha
-- "📱 Conversa WhatsApp: <url>" — assim qualquer sistema que puxe o lead da
-- dash recebe o acesso junto com a descrição. Por isso o trigger é BEFORE
-- INSERT (AFTER não pode alterar NEW). A base da URL vem da configuração
-- do banco (uma vez): ALTER DATABASE postgres SET app.dash_base_url = 'https://...';
-- Sem a configuração, o link é omitido (a conversa é criada normalmente).
--
-- Usamos to_jsonb(NEW)->>'coluna' porque a mesma função roda sobre duas
-- tabelas com colunas diferentes (leads: name/phone; kenlo_leads:
-- client_name/client_phone) — mesmo racional da 20260701.
--
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS lead_source_table TEXT;

CREATE OR REPLACE FUNCTION public.ensure_whatsapp_conversation_for_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      jsonb := to_jsonb(NEW);
  v_phone    text;
  v_name     text;
  v_variants text[];
  v_conv_id  uuid;
  v_base     text;
  v_link     text;
BEGIN
  -- leads usa phone; kenlo_leads usa client_phone.
  v_phone := regexp_replace(COALESCE(v_row->>'phone', v_row->>'client_phone', ''), '\D', '', 'g');

  -- Canonicalização = server/utils/phone.js normalizePhone(withCountryCode):
  IF length(v_phone) > 11 AND v_phone LIKE '55%' THEN
    v_phone := substring(v_phone FROM 3);                              -- remove DDI duplicado
  END IF;
  IF length(v_phone) = 10 THEN
    v_phone := substring(v_phone FROM 1 FOR 2) || '9' || substring(v_phone FROM 3); -- insere 9º dígito
  END IF;
  IF length(v_phone) = 11 THEN
    v_phone := '55' || v_phone;                                        -- DDI 55
  END IF;

  -- Sem telefone utilizável (mesma validação mínima do módulo de chat) → sai.
  IF length(v_phone) < 10 OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_name := NULLIF(btrim(COALESCE(v_row->>'name', v_row->>'client_name', '')), '');

  -- Variantes históricas do mesmo número (wa_id sem o 9º dígito; sem DDI).
  v_variants := ARRAY[v_phone];
  IF v_phone ~ '^55\d\d9\d{8}$' THEN
    v_variants := v_variants || ARRAY[
      substring(v_phone FROM 1 FOR 4) || substring(v_phone FROM 6),    -- 55 + DDD + 8 (sem o 9)
      substring(v_phone FROM 3),                                       -- DDD + 9 (sem DDI)
      substring(v_phone FROM 3 FOR 2) || substring(v_phone FROM 6)     -- DDD + 8
    ];
  END IF;
  -- Integrações podem ter gravado E.164 com '+' — cobrir as duas formas.
  v_variants := v_variants || (SELECT array_agg('+' || v) FROM unnest(v_variants) v);

  -- Preferir a conversa COM histórico (inbound real) a uma casca vazia.
  SELECT id INTO v_conv_id
    FROM public.whatsapp_conversations
   WHERE tenant_id = NEW.tenant_id
     AND contact_phone = ANY(v_variants)
   ORDER BY last_message_at DESC NULLS LAST, created_at
   LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    -- Reutiliza a conversa existente; só completa vínculo/nome quando vazios.
    UPDATE public.whatsapp_conversations
       SET lead_id           = COALESCE(lead_id, NEW.id),
           lead_source_table = COALESCE(lead_source_table, TG_TABLE_NAME),
           contact_name      = COALESCE(contact_name, v_name)
     WHERE id = v_conv_id
       AND (lead_id IS NULL OR (contact_name IS NULL AND v_name IS NOT NULL));
  ELSE
    INSERT INTO public.whatsapp_conversations
      (tenant_id, contact_phone, contact_name, lead_id, lead_source_table)
    VALUES (NEW.tenant_id, v_phone, v_name, NEW.id, TG_TABLE_NAME)
    ON CONFLICT (tenant_id, contact_phone) DO UPDATE
      SET lead_id           = COALESCE(whatsapp_conversations.lead_id, EXCLUDED.lead_id),
          lead_source_table = COALESCE(whatsapp_conversations.lead_source_table, EXCLUDED.lead_source_table),
          contact_name      = COALESCE(whatsapp_conversations.contact_name, EXCLUDED.contact_name);
  END IF;

  -- Linha com o link no FINAL da descrição do lead — segue junto quando o
  -- lead é puxado da dash por outros sistemas. Idempotente: não duplica.
  v_base := COALESCE(current_setting('app.dash_base_url', true), '');
  IF v_base <> '' THEN
    v_link := '📱 Conversa WhatsApp: ' || v_base || '/chat?phone=' || v_phone;
    IF TG_TABLE_NAME = 'leads' THEN
      IF NEW.comments IS NULL OR position('/chat?phone=' IN NEW.comments) = 0 THEN
        NEW.comments := COALESCE(NULLIF(NEW.comments, '') || E'\n\n', '') || v_link;
      END IF;
    ELSIF TG_TABLE_NAME = 'kenlo_leads' THEN
      IF NEW.message IS NULL OR position('/chat?phone=' IN NEW.message) = 0 THEN
        NEW.message := COALESCE(NULLIF(NEW.message, '') || E'\n\n', '') || v_link;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- ponytail: o bloco EXCEPTION cria uma subtransação por linha — em imports
  -- grandes (batch Kenlo) isso degrada, mas protege o INSERT do lead, que
  -- nunca pode falhar por causa da conversa. Se pesar, mover para consumer
  -- do outbox webhook_events.
  RAISE WARNING 'ensure_whatsapp_conversation_for_lead: % (tabela %, lead %)',
    SQLERRM, TG_TABLE_NAME, NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ensure_whatsapp_conversation ON public.leads;
CREATE TRIGGER tr_ensure_whatsapp_conversation
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_whatsapp_conversation_for_lead();

DROP TRIGGER IF EXISTS tr_ensure_whatsapp_conversation ON public.kenlo_leads;
CREATE TRIGGER tr_ensure_whatsapp_conversation
  BEFORE INSERT ON public.kenlo_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_whatsapp_conversation_for_lead();
