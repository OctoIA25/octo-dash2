-- =============================================================================
-- Limpeza única: canonicaliza contact_phone e funde conversas duplicadas
--
-- Contexto: antes da canonicalização (20260702_ensure_whatsapp_conversation_
-- on_lead_created.sql), conversas foram gravadas em formatos mistos: com '+'
-- (ex.: +5521996617668), sem DDI (11977837974), sem o 9º dígito. O mesmo
-- número podia ter mais de uma conversa por tenant.
--
-- O que faz (DML apenas — sem locks de DDL; rodar em UMA execução):
--   1. Calcula a forma canônica de cada conversa (mesmas regras de
--      server/utils/phone.js: dígitos → remove 55 duplicado → insere 9º
--      dígito em 10 dígitos → prefixa 55).
--   2. Por (tenant, canônico), elege a conversa "keeper": a COM histórico
--      mais recente; empate → a mais antiga.
--   3. Move as mensagens das duplicatas para a keeper.
--   4. Completa contact_name/lead_id/lead_source_table da keeper com o que
--      as duplicatas tinham (nunca sobrescreve).
--   5. Apaga as duplicatas e canonicaliza o telefone das que ficaram.
--
-- Guardas: só toca em números com canônico >= 10 dígitos; formatos
-- irreconhecíveis ficam intactos. Idempotente: re-rodar não muda nada.
--
-- IMPORTANTE: aplicar DEPOIS da versão atual da função
-- ensure_whatsapp_conversation_for_lead — senão o trigger antigo volta a
-- criar linhas fora do formato canônico.
-- =============================================================================

SET lock_timeout = '10s';

CREATE TEMP TABLE conv_norm ON COMMIT DROP AS
SELECT c.id, c.tenant_id, c.contact_phone, c.contact_name,
       c.lead_id, c.lead_source_table, c.last_message_at, c.created_at,
       x3.canon
  FROM public.whatsapp_conversations c
  CROSS JOIN LATERAL (SELECT regexp_replace(c.contact_phone, '\D', '', 'g') AS d0) x0
  CROSS JOIN LATERAL (SELECT CASE WHEN length(x0.d0) > 11 AND x0.d0 LIKE '55%'
                                  THEN substring(x0.d0 FROM 3) ELSE x0.d0 END AS d1) x1
  CROSS JOIN LATERAL (SELECT CASE WHEN length(x1.d1) = 10
                                  THEN substring(x1.d1 FROM 1 FOR 2) || '9' || substring(x1.d1 FROM 3)
                                  ELSE x1.d1 END AS d2) x2
  CROSS JOIN LATERAL (SELECT CASE WHEN length(x2.d2) = 11 THEN '55' || x2.d2 ELSE x2.d2 END AS canon) x3
 WHERE length(regexp_replace(c.contact_phone, '\D', '', 'g')) >= 10;

-- Keeper por (tenant, canônico): com histórico mais recente; empate → mais antiga.
CREATE TEMP TABLE conv_keepers ON COMMIT DROP AS
SELECT DISTINCT ON (tenant_id, canon) id AS keeper_id, tenant_id, canon
  FROM conv_norm
 ORDER BY tenant_id, canon, (last_message_at IS NULL), last_message_at DESC, created_at;

CREATE TEMP TABLE conv_losers ON COMMIT DROP AS
SELECT n.id AS loser_id, k.keeper_id
  FROM conv_norm n
  JOIN conv_keepers k ON k.tenant_id = n.tenant_id AND k.canon = n.canon
 WHERE n.id <> k.keeper_id;

-- Mensagens das duplicatas passam para a keeper (histórico preservado).
UPDATE public.whatsapp_messages m
   SET conversation_id = l.keeper_id
  FROM conv_losers l
 WHERE m.conversation_id = l.loser_id;

-- Keeper herda nome/vínculo que só as duplicatas tinham.
UPDATE public.whatsapp_conversations k
   SET contact_name      = COALESCE(k.contact_name, agg.nome),
       lead_id           = COALESCE(k.lead_id, agg.lid),
       lead_source_table = COALESCE(k.lead_source_table, agg.lsrc)
  FROM (
    SELECT l.keeper_id,
           (array_remove(array_agg(n.contact_name), NULL))[1]      AS nome,
           (array_remove(array_agg(n.lead_id), NULL))[1]           AS lid,
           (array_remove(array_agg(n.lead_source_table), NULL))[1] AS lsrc
      FROM conv_losers l
      JOIN conv_norm n ON n.id = l.loser_id
     GROUP BY l.keeper_id
  ) agg
 WHERE k.id = agg.keeper_id;

DELETE FROM public.whatsapp_conversations
 WHERE id IN (SELECT loser_id FROM conv_losers);

-- Recalcula last_message_at das keepers que receberam mensagens.
UPDATE public.whatsapp_conversations k
   SET last_message_at = sub.max_at
  FROM (
    SELECT m.conversation_id, max(COALESCE(m.wa_timestamp, m.created_at)) AS max_at
      FROM public.whatsapp_messages m
     WHERE m.conversation_id IN (SELECT keeper_id FROM conv_losers)
     GROUP BY m.conversation_id
  ) sub
 WHERE k.id = sub.conversation_id
   AND (k.last_message_at IS NULL OR sub.max_at > k.last_message_at);

-- Canonicaliza o telefone das conversas restantes.
UPDATE public.whatsapp_conversations c
   SET contact_phone = n.canon
  FROM conv_norm n
 WHERE c.id = n.id
   AND length(n.canon) >= 10
   AND c.contact_phone <> n.canon
   AND NOT EXISTS (SELECT 1 FROM conv_losers l WHERE l.loser_id = c.id);

-- Resultado da limpeza (última query = o que o SQL Editor mostra).
SELECT (SELECT count(*) FROM conv_losers)                               AS conversas_fundidas,
       (SELECT count(*) FROM public.whatsapp_conversations
         WHERE contact_phone !~ '^\d+$')                                AS ainda_fora_do_padrao;
