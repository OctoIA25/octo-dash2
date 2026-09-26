-- ============================================================
-- "Só pesquisando" caduca quando o lead se contradiz — 26/09
--
-- Achado pela equipe da LIA ao integrar o score. O sinal era um `bool_or`
-- sobre a vida inteira do lead: quem dizia "só estou pesquisando" no dia 1 e
-- PEDIA VISITA no dia 3 carregava o -10 para sempre.
--
--     50 - 10 (só pesquisando) + 25 (visita) = 65  ->  Morno
--
-- E o fato mais recente e mais forte dizia Quente. Não havia evento de
-- reversão, e o score não olhava só o último sinal.
--
-- DUAS SAÍDAS, E A ESCOLHIDA
--
-- Ou a LIA passaria a mandar um `lia.sinal_so_pesquisando_revertido`, ou a
-- regra vive aqui. A equipe da LIA escolheu esta, e concordo: pedir simulação
-- ou marcar visita depois de dizer que só pesquisa é o próprio lead se
-- contradizendo — não deve depender de alguém do outro lado lembrar de mandar
-- um segundo evento.
--
-- O QUE A REGRA NÃO FAZ
--
-- Só olha o que veio DEPOIS. Quem disse "só pesquisando" depois de ter pedido
-- a visita continua com o -10, e é o certo: aí a última palavra é a dele.
--
-- Até isto subir, a LIA parou de mandar o sinal — então nenhum lead perde
-- pontos no intervalo.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.leads_sinais_de_score(
  p_tenant_id uuid,
  p_lead_ids  text[]
)
RETURNS TABLE (
  lead_id text,
  respondeu boolean,
  /** Minutos entre a primeira mensagem enviada e a primeira resposta. */
  minutos_para_responder int,
  disse_o_que_procura boolean,
  pediu_visita boolean,
  conversou_recente boolean,
  sem_resposta_ha_dias int,
  /** Sinais que a LIA reportou, cada um com a última vez que apareceu. */
  renda_compativel boolean,
  renda_incompativel boolean,
  pediu_simulacao boolean,
  so_pesquisando boolean
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

  IF p_lead_ids IS NULL OR cardinality(p_lead_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH pedidos AS (
    SELECT DISTINCT unnest(p_lead_ids) AS lid
  ),
  -- O ALVO SÃO OS LEADS DESTA IMOBILIÁRIA, e não os ids que quem chamou
  -- mandou. Sem este recorte a função devolvia uma linha para qualquer id
  -- pedido — nenhum dado de outro tenant saía junto, mas ela respondia sobre
  -- lead que não é dela, e o teste de escopo acusou.
  -- Os dois lados: o Kanban carrega `leads` E `kenlo_leads`.
  alvo AS (
    SELECT p.lid FROM pedidos p
    WHERE EXISTS (SELECT 1 FROM leads l WHERE l.tenant_id = p_tenant_id AND l.id::text = p.lid)
       OR EXISTS (SELECT 1 FROM kenlo_leads k WHERE k.tenant_id = p_tenant_id AND k.id::text = p.lid)
  ),
  -- A conversa: só vale a que TEM mensagem. Há 1.247 conversas na Lotus com
  -- lead vinculado e nenhuma mensagem — cascas criadas e nunca usadas. Contar
  -- uma casca como conversa faria "sem resposta há N dias" nascer errado.
  conversa AS (
    SELECT c.id AS conv_id, c.lead_id::text AS lid, c.last_message_at
    FROM whatsapp_conversations c
    JOIN alvo a ON a.lid = c.lead_id::text
    WHERE c.tenant_id = p_tenant_id AND c.last_message_at IS NOT NULL
  ),
  extremos AS (
    SELECT
      cv.lid,
      max(cv.last_message_at) AS ultima,
      min(m.wa_timestamp) FILTER (WHERE m.direction = 'outbound') AS primeira_saida,
      min(m.wa_timestamp) FILTER (WHERE m.direction = 'inbound')  AS primeira_entrada
    FROM conversa cv
    LEFT JOIN whatsapp_messages m
      ON m.conversation_id = cv.conv_id AND m.tenant_id = p_tenant_id
    GROUP BY cv.lid
  ),
  -- Os sinais da LIA. `lia.sinal_*` é namespace novo, criado para o score:
  -- os tipos que já existiam contam OUTRA coisa e reusá-los misturaria
  -- "a LIA passou o lead" com "o lead tem renda compatível".
  sinais_lia AS (
    SELECT
      e.lead_id AS lid,
      bool_or(e.event_type = 'lia.sinal_renda_compativel')   AS renda_ok,
      bool_or(e.event_type = 'lia.sinal_renda_incompativel') AS renda_nao,
      bool_or(e.event_type = 'lia.sinal_pediu_simulacao')    AS simulacao,
      bool_or(e.event_type = 'lia.sinal_disse_o_que_procura') AS procura,
      bool_or(e.event_type IN ('lia.visita_agendada', 'lia.visita_confirmada')) AS visita,
      /*
       * "SÓ PESQUISANDO" CADUCA QUANDO O LEAD SE CONTRADIZ — 26/09/2026.
       *
       * Antes era um `bool_or` sobre a vida inteira do lead: quem disse "só
       * estou pesquisando" no dia 1 e pediu VISITA no dia 3 ficava com o -10
       * para sempre, e o score dava 65 (Morno) quando o fato mais recente e
       * mais forte dizia Quente.
       *
       * A equipe da LIA achou, e escolheu esta saída em vez de um evento de
       * reversão: pedir simulação ou marcar visita DEPOIS de dizer que só
       * pesquisa é o próprio lead se contradizendo, e não deve depender de
       * alguém lembrar de mandar um segundo evento.
       *
       * Só olha o que veio DEPOIS: quem disse "só pesquisando" depois de ter
       * pedido a visita continua com o -10, e é o certo — aí a última palavra
       * é a dele.
       */
      max(e.created_at) FILTER (WHERE e.event_type = 'lia.sinal_so_pesquisando')
        AS pesquisando_em,
      max(e.created_at) FILTER (
        WHERE e.event_type IN ('lia.sinal_pediu_simulacao',
                               'lia.visita_agendada', 'lia.visita_confirmada')
      ) AS contradisse_em
    FROM lead_events e
    JOIN alvo a ON a.lid = e.lead_id
    WHERE e.tenant_id = p_tenant_id AND e.event_type LIKE 'lia.%'
    GROUP BY e.lead_id
  ),
  -- A visita também vale pela agenda: o corretor que marca pela ficha do lead
  -- não passa pela LIA, e ignorá-lo puniria justamente quem trabalha na mão.
  visita_agenda AS (
    SELECT DISTINCT ag.lead_uuid::text AS lid
    FROM agenda_eventos ag
    JOIN alvo a ON a.lid = ag.lead_uuid::text
    WHERE ag.tenant_id = p_tenant_id AND ag.tipo = 'visita_agendada'
  ),
  preferencias AS (
    SELECT l.id::text AS lid
    FROM leads l
    JOIN alvo a ON a.lid = l.id::text
    WHERE l.tenant_id = p_tenant_id
      AND l.preferences IS NOT NULL AND array_length(l.preferences, 1) > 0
  )
  SELECT
    a.lid,
    (e.primeira_entrada IS NOT NULL),
    CASE
      WHEN e.primeira_entrada IS NULL OR e.primeira_saida IS NULL THEN NULL
      -- Entrada ANTES da primeira saída é lead que chegou falando: tempo de
      -- resposta negativo não existe, e tratá-lo como zero premiaria por algo
      -- que ninguém fez.
      WHEN e.primeira_entrada < e.primeira_saida THEN NULL
      ELSE GREATEST(0, (EXTRACT(EPOCH FROM (e.primeira_entrada - e.primeira_saida)) / 60)::int)
    END,
    COALESCE(p.lid IS NOT NULL OR s.procura, false),
    COALESCE(v.lid IS NOT NULL OR s.visita, false),
    COALESCE(e.ultima > now() - interval '3 days', false),
    CASE WHEN e.ultima IS NULL THEN NULL
         ELSE GREATEST(0, (EXTRACT(EPOCH FROM (now() - e.ultima)) / 86400)::int) END,
    COALESCE(s.renda_ok, false),
    COALESCE(s.renda_nao, false),
    COALESCE(s.simulacao, false),
    COALESCE((s.pesquisando_em IS NOT NULL
          AND (s.contradisse_em IS NULL OR s.contradisse_em < s.pesquisando_em)), false)
  FROM alvo a
  LEFT JOIN extremos e     ON e.lid = a.lid
  LEFT JOIN sinais_lia s   ON s.lid = a.lid
  LEFT JOIN visita_agenda v ON v.lid = a.lid
  LEFT JOIN preferencias p ON p.lid = a.lid;
END;
$function$;

COMMIT;
