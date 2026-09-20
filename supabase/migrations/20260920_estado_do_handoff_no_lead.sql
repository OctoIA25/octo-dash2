-- ============================================================
-- De quem é a bola: o sub-status do atendimento (P1.5).
--
-- Decidido pelo chefe em 20/09/2026: os três estados do plano — Com LIA,
-- Aguardando corretor, Com corretor — falam da PASSAGEM do lead, não de
-- esforço. "Com corretor" significa que o corretor TEM o lead; se ele
-- trabalhou ou não, quem responde é o selo de dias parado (P1.4).
--
-- A leitura descartada era exigir prova de trabalho: hoje isso poria 1.557
-- dos 1.680 cards em "Aguardando corretor", afirmando que a equipe quase não
-- toca em lead nenhum. Pode ser verdade, mas a base não sustenta a acusação —
-- ligação e WhatsApp pessoal não deixam registro aqui.
--
-- POR QUE PEGA CARONA: o sinal "a LIA passou" mora na mesma tabela que
-- `leads_ultima_movimentacao` já varre. Uma segunda função seria uma segunda
-- ida ao banco pela mesma linha, na mesma tela.
--
-- DROP + CREATE, e não CREATE OR REPLACE: mudar as colunas devolvidas por uma
-- função que devolve tabela exige recriá-la.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.leads_ultima_movimentacao(uuid, text[]);

CREATE FUNCTION public.leads_ultima_movimentacao(
  p_tenant_id uuid,
  p_lead_ids  text[]
)
RETURNS TABLE (
  lead_id text,
  ultima timestamptz,
  fonte text,
  /** A LIA entregou o lead ao corretor (handoff, distribuição ou repasse). */
  lia_passou boolean,
  /** A LIA encostou no lead alguma vez — sem isso, "Com LIA" seria chute. */
  lia_atendeu boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- SECURITY DEFINER passa por cima da RLS das três tabelas de origem, então
  -- o escopo de imobiliária é checado aqui, à mão.
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN;
  END IF;

  IF p_lead_ids IS NULL OR cardinality(p_lead_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH alvo AS (
    SELECT DISTINCT unnest(p_lead_ids) AS lid
  ),
  eventos AS (
    SELECT e.lead_id AS lid, e.created_at, e.event_type, e.ator_tipo
    FROM lead_events e
    JOIN alvo a ON a.lid = e.lead_id
    WHERE e.tenant_id = p_tenant_id
  ),
  -- O estado do handoff olha TODOS os eventos da LIA, inclusive os que não
  -- contam como movimento: a LIA ter passado o lead é um fato sobre onde ele
  -- está, não sobre alguém tê-lo trabalhado.
  handoff AS (
    SELECT
      e.lid,
      bool_or(e.event_type IN ('lia.handoff_corretor', 'lia.lead_passado_corretor', 'lia.lead_distribuido')) AS passou,
      bool_or(e.event_type LIKE 'lia.%') AS atendeu
    FROM eventos e
    GROUP BY e.lid
  ),
  movimentos AS (
    -- 1. O que aconteceu com o lead, pelo extrato de eventos.
    SELECT e.lid, e.created_at AS quando, 'evento'::text AS fonte
    FROM eventos e
    -- `lead.created` é o nascimento, e vem RECONSTRUÍDO de 2018 para boa
    -- parte da base: contá-lo faria todo lead antigo parecer recém-mexido.
    WHERE e.event_type <> 'lead.created'
      -- 3.100 linhas em 1.051 leads em dez dias (Lotus, 20/09): é a roleta
      -- reatribuindo, não alguém trabalhando o lead.
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
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.lid) m.lid, m.quando, m.fonte
    FROM movimentos m
    WHERE m.quando IS NOT NULL
      -- Movimento no futuro é dado sujo, não lead ativo.
      AND m.quando <= now()
    ORDER BY m.lid, m.quando DESC
  )
  -- LEFT a partir do movimento, e não FULL: todo evento da LIA JÁ É
  -- movimento (nenhum deles está nas exclusões acima), então um lead com
  -- estado de handoff sempre tem linha em `ultimo`. Com FULL JOIN, os leads
  -- cujo único evento é o nascimento ganhavam uma linha sem data e sem fato —
  -- e o teste de `lead.created` acusou na hora.
  SELECT u.lid, u.quando, u.fonte, COALESCE(h.passou, false), COALESCE(h.atendeu, false)
  FROM ultimo u
  LEFT JOIN handoff h ON h.lid = u.lid;
END;
$function$;

REVOKE ALL ON FUNCTION public.leads_ultima_movimentacao(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_ultima_movimentacao(uuid, text[]) TO authenticated, service_role;

COMMIT;
