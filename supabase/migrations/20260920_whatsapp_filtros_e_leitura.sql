-- ============================================================
-- WhatsApp: busca no conteúdo, leitura por usuário e recrutamento (P1.9).
--
-- Três coisas que o plano pede e que hoje não existem:
--
-- 1. BUSCAR PELO CONTEÚDO DA MENSAGEM. Hoje a busca só olha nome e telefone.
--    Quem lembra "aquele que perguntou do Santa Ângela" não acha ninguém.
--
-- 2. LIDA/NÃO LIDA POR USUÁRIO. A coluna `unread_count` existe e está em ZERO
--    nas 1.645 conversas da Lotus — nada a preenche. E um contador único por
--    conversa seria errado de qualquer forma: lida pelo gestor não é lida pelo
--    corretor.
--
-- 3. ABA RECRUTAMENTO. Decidido pelo chefe em 20/09/2026: a aba é construída
--    agora e liga conversa a candidato PELO TELEFONE. Hoje ela mostra zero —
--    conferido: nenhuma das 1.645 conversas bate com candidato, e só 2
--    candidatos têm telefone cadastrado. A aba diz POR QUE está vazia em vez
--    de parecer quebrada, e enche sozinha quando o número da LIA de
--    recrutamento passar a chegar aqui.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Quem já leu o quê
--
-- Uma linha por (conversa, usuário). Sem o par, "não lida" seria global e o
-- corretor veria como lida a conversa que o gestor abriu.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_conversa_leitura (
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lida_em         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_conversa_leitura_user_idx
  ON public.whatsapp_conversa_leitura (tenant_id, user_id);

REVOKE ALL ON public.whatsapp_conversa_leitura FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversa_leitura TO authenticated;
GRANT ALL ON public.whatsapp_conversa_leitura TO service_role;

ALTER TABLE public.whatsapp_conversa_leitura ENABLE ROW LEVEL SECURITY;

-- CADA UM MEXE NA PRÓPRIA LEITURA, e só. Marcar a conversa como lida para
-- outra pessoa esconderia dela uma mensagem que ela nunca viu.
DROP POLICY IF EXISTS whatsapp_conversa_leitura_propria ON public.whatsapp_conversa_leitura;
CREATE POLICY whatsapp_conversa_leitura_propria ON public.whatsapp_conversa_leitura
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 2. Índice para buscar dentro das mensagens
--
-- Trigrama, e não full-text: o corretor digita pedaço de palavra ("santa ang")
-- e o full-text em português só casaria a palavra inteira. O índice é parcial
-- porque mensagem sem corpo (mídia) não tem o que buscar.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS whatsapp_messages_body_trgm_idx
  ON public.whatsapp_messages USING gin (body gin_trgm_ops)
  WHERE body IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Busca no conteúdo, devolvendo conversas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_busca_em_mensagens(
  p_tenant_id uuid,
  p_termo     text,
  p_limite    int DEFAULT 200
)
RETURNS TABLE (conversation_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_termo  text := btrim(COALESCE(p_termo, ''));
BEGIN
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN;
  END IF;

  -- Menos de três letras não usa o índice de trigrama e varreria a tabela
  -- inteira a cada tecla. A tela já filtra por nome e telefone nesse caso.
  IF length(v_termo) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT m.conversation_id
  FROM whatsapp_messages m
  WHERE m.tenant_id = p_tenant_id
    AND m.body ILIKE '%' || v_termo || '%'
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 200), 1), 1000);
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_busca_em_mensagens(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_busca_em_mensagens(uuid, text, int) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. O que a lista precisa saber além da própria conversa
--
-- Uma chamada: quando EU li cada conversa, e quais delas são de candidato a
-- corretor. Duas consultas separadas trariam o mesmo dado em dois momentos, e
-- a tela piscaria contadores diferentes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_conversas_extras(p_tenant_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  lida_em timestamptz,
  eh_recrutamento boolean,
  candidato_id uuid,
  candidato_nome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH conversas AS (
    SELECT c.id, regexp_replace(COALESCE(c.contact_phone, ''), '\D', '', 'g') AS tel
    FROM whatsapp_conversations c
    WHERE c.tenant_id = p_tenant_id
  ),
  -- Os candidatos das DUAS tabelas: o funil novo (`recrut_candidato`) e o
  -- cadastro antigo, que ainda tem gente.
  candidatos AS (
    SELECT c.id, c.nome, regexp_replace(COALESCE(c.telefone, ''), '\D', '', 'g') AS tel
    FROM recrut_candidato c WHERE c.tenant_id = p_tenant_id
    UNION ALL
    SELECT r.id, r.nome, regexp_replace(COALESCE(r.telefone, ''), '\D', '', 'g')
    FROM recruitment_candidates r WHERE r.tenant_id = p_tenant_id
  ),
  -- Casa pelos 8 últimos dígitos: a base tem número com e sem o 55, com e sem
  -- o nono dígito. Comparar a string inteira não acharia ninguém.
  casado AS (
    SELECT DISTINCT ON (cv.id) cv.id AS conv, ca.id AS cand, ca.nome
    FROM conversas cv
    JOIN candidatos ca
      ON length(cv.tel) >= 8 AND length(ca.tel) >= 8
     AND right(cv.tel, 8) = right(ca.tel, 8)
  )
  SELECT
    cv.id,
    l.lida_em,
    (k.conv IS NOT NULL),
    k.cand,
    k.nome
  FROM conversas cv
  LEFT JOIN whatsapp_conversa_leitura l
    ON l.conversation_id = cv.id AND l.user_id = v_caller
  LEFT JOIN casado k ON k.conv = cv.id
  -- SÓ AS LINHAS QUE DIZEM ALGUMA COISA.
  --
  -- Devolver uma linha por conversa estourava o TETO DE 1.000 LINHAS do
  -- PostgREST: a Lotus tem 1.645 conversas, as 645 seguintes sumiam em
  -- silêncio, e com elas o estado de leitura e o vínculo com candidato —
  -- descoberto no navegador, com a conversa de candidato invisível na aba.
  --
  -- Conversa sem leitura e sem candidato não acrescenta nada: a tela já
  -- trata a ausência como "nunca li" e "não é candidato", que é o padrão
  -- correto. Omiti-las corta 1.645 linhas para uma dúzia.
  WHERE l.lida_em IS NOT NULL OR k.conv IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.whatsapp_conversas_extras(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_conversas_extras(uuid) TO authenticated, service_role;

COMMIT;
