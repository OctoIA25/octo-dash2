-- ============================================================
-- Há quanto tempo este lead está parado (P1.4).
--
-- Decidido pelo chefe em 20/09/2026: o selo conta do MOVIMENTO REAL —
-- mudança de etapa, contato da LIA, toque do corretor ou mensagem trocada —
-- e não de `leads.updated_at`.
--
-- POR QUE NÃO `updated_at`: ele sobe em qualquer escrita na linha, inclusive
-- as do sistema. Um lead que ninguém tocou apareceria como "1 dia". É o mesmo
-- erro do `first_response_at`, que media o arrastar de um card e passou meses
-- sendo lido como "tempo de resposta".
--
-- O PREÇO DESSA ESCOLHA, medido na Lotus em 20/09/2026: o registro de eventos
-- só existe desde 10/09, então HOJE apenas 432 dos 1.681 leads ativos têm
-- movimento registrado. Os outros 1.249 não ganham selo — a tela diz "sem
-- registro" em vez de inventar um número. Enche sozinho conforme a equipe usa.
--
-- A REGRA MORA AQUI, e só aqui. Três telas vão mostrar este selo; com a regra
-- copiada em cada uma, as três divergiriam na primeira mudança.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.leads_ultima_movimentacao(
  p_tenant_id uuid,
  p_lead_ids  text[]
)
RETURNS TABLE (lead_id text, ultima timestamptz, fonte text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- SECURITY DEFINER passa por cima da RLS das três tabelas de origem, então
  -- o escopo de imobiliária é checado aqui, à mão. Sem isto, qualquer usuário
  -- logado leria o movimento dos leads de outra imobiliária.
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN; -- sem vínculo: nenhuma linha, e não um erro que vaze a existência do tenant
  END IF;

  IF p_lead_ids IS NULL OR cardinality(p_lead_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH alvo AS (
    SELECT DISTINCT unnest(p_lead_ids) AS lid
  ),
  movimentos AS (
    -- 1. O que aconteceu com o lead, pelo extrato de eventos.
    SELECT e.lead_id AS lid, e.created_at AS quando, 'evento'::text AS fonte
    FROM lead_events e
    JOIN alvo a ON a.lid = e.lead_id
    WHERE e.tenant_id = p_tenant_id
      -- `lead.created` é o nascimento, e vem RECONSTRUÍDO de 2018 para boa
      -- parte da base: contá-lo faria todo lead antigo parecer recém-mexido.
      AND e.event_type <> 'lead.created'
      -- 3.100 linhas em 1.051 leads em dez dias (Lotus, 20/09): é a roleta
      -- reatribuindo, não alguém trabalhando o lead. Contar isso deixaria
      -- quase todo card "fresco" e o selo não apontaria nada.
      AND NOT (e.event_type = 'lead.assigned' AND e.ator_tipo = 'sistema')

    UNION ALL

    -- 2. O corretor tocou o lead — a cadência, no ar desde 17/09/2026.
    SELECT t.lead_id, t.executado_em, 'toque'
    FROM lead_toques t
    JOIN alvo a ON a.lid = t.lead_id
    WHERE t.tenant_id = p_tenant_id AND t.executado_em IS NOT NULL

    UNION ALL

    -- 3. Alguém trocou mensagem com o lead.
    SELECT c.lead_id::text, c.last_message_at, 'conversa'
    FROM whatsapp_conversations c
    JOIN alvo a ON a.lid = c.lead_id::text
    WHERE c.tenant_id = p_tenant_id AND c.last_message_at IS NOT NULL
  )
  SELECT DISTINCT ON (m.lid) m.lid, m.quando, m.fonte
  FROM movimentos m
  WHERE m.quando IS NOT NULL
    -- Movimento no futuro é dado sujo, não lead ativo. Deixar passar faria o
    -- selo mostrar "parado há -3 dias".
    AND m.quando <= now()
  ORDER BY m.lid, m.quando DESC;
END;
$function$;

-- A chave do navegador não executa nada por padrão neste banco; quem consulta
-- é o usuário logado, pelas três telas do selo.
REVOKE ALL ON FUNCTION public.leads_ultima_movimentacao(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_ultima_movimentacao(uuid, text[]) TO authenticated, service_role;

COMMIT;
