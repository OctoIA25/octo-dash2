-- ============================================================
-- "Com a Lia" quando a dona do lead É a Lia
--
-- Desde 17/09 todo lead novo da Lotus nasce com a conta da Lia como dona no
-- CRM, até ela passar a um corretor. As três regras de sub-status perguntam
-- "tem dono?" primeiro — então esses leads aparecem como **Com o corretor**,
-- com o nome "Lia" no card, e o gráfico por equipe os conta como atendidos
-- por gente. A equipe da LIA apontou, e medimos: são **77 leads ativos**.
--
-- POR QUE NÃO BASTA TIRAR A LIA DA PRIMEIRA PERGUNTA
-- **76 dos 77** já têm o evento `lia.lead_distribuido` ("a Lia atribuiu o
-- lead à Lia"), que a segunda pergunta lê como "a Lia passou". Sem uma
-- pergunta ZERO eles cairiam em "Aguardando corretor" — que é igualmente
-- falso, e pior: manda o gestor cobrar uma entrega que não é devida.
--
-- COMO SE RECONHECE A LIA, e por que não pelo id
-- A equipe ofereceu o id fixo (`385d2957-…`). Recusado: id de produção
-- cravado em código é a dívida que esta casa vem pagando o ano inteiro, e ele
-- não vale para outra imobiliária. A membership dela já traz a marca
--
--     permissions -> 'lead_limit' ->> 'motivo' = 'assistente-ia'
--
-- que é por tenant e diz o que importa — "esta conta é um assistente" —, não
-- quem ela é. Conferido: casa com EXATAMENTE UMA membership em todas as casas.
--
-- UMA FONTE, TRÊS LEITORES
-- A resposta mora numa função só. Consertar os três pontos com três cópias da
-- regra é como a tela de Configurações ficou quebrada: duas implementações da
-- mesma pergunta, cada uma certa sozinha, divergindo no primeiro caso de borda.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Quem é o assistente desta casa
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_assistente_ia(p_tenant_id uuid)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  -- LIMIT 1 por segurança, não por expectativa: hoje é uma só. Se um dia
  -- houver duas contas de assistente na mesma casa, quem decide qual é a
  -- principal é o cadastro, não o acaso da ordenação — e aí esta função
  -- passa a devolver um conjunto. Até lá, uma linha.
  SELECT tm.user_id
    FROM tenant_memberships tm
   WHERE tm.tenant_id = p_tenant_id
     AND tm.permissions -> 'lead_limit' ->> 'motivo' = 'assistente-ia'
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.usuario_assistente_ia(uuid) IS
  'O usuário que é o assistente de IA desta imobiliária, pela marca lead_limit.motivo = assistente-ia. NULO quando a casa não tem um. Fonte única de "este lead está com a Lia".';

REVOKE ALL ON FUNCTION public.usuario_assistente_ia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_assistente_ia(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. A RPC do card passa a dizer se a dona é a Lia
--
-- `RETURNS TABLE` ganhou coluna, e isso o CREATE OR REPLACE recusa: é DROP e
-- recria. A janela é de milissegundos dentro desta transação.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.leads_ultima_movimentacao(uuid, text[]);

CREATE FUNCTION public.leads_ultima_movimentacao(p_tenant_id uuid, p_lead_ids text[])
RETURNS TABLE(lead_id text, ultima timestamp with time zone, fonte text,
              lia_passou boolean, lia_atendeu boolean, dona_lia boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  -- TEXT, não uuid: `leads.assigned_agent_id` é text nesta base, e
  -- comparar text com uuid só estoura em tempo de EXECUÇÃO — a migration
  -- passa e a função quebra na primeira chamada. Aconteceu em 28/09.
  v_assistente text := public.usuario_assistente_ia(p_tenant_id)::text;
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
  -- Quem é a dona do lead. `assigned_agent_id` é TEXT nesta tabela.
  -- `v_assistente` nulo (casa sem assistente) nunca casa, e a coluna sai
  -- falsa — que é o comportamento de antes desta mudança.
  dona AS (
    SELECT l.id::text AS lid,
           (lower(btrim(l.assigned_agent_id)) = v_assistente) AS e_a_lia
    FROM leads l JOIN alvo a ON a.lid = l.id::text
    WHERE l.tenant_id = p_tenant_id
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
  SELECT u.lid, u.quando, u.fonte,
         COALESCE(h.passou, false), COALESCE(h.atendeu, false),
         COALESCE(d.e_a_lia, false)
  FROM ultimo u
  LEFT JOIN handoff h ON h.lid = u.lid
  LEFT JOIN dona d ON d.lid = u.lid;
END;
$function$;

REVOKE ALL ON FUNCTION public.leads_ultima_movimentacao(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_ultima_movimentacao(uuid, text[]) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. O gráfico por equipe ganha a mesma pergunta zero
--
-- Reescrito A PARTIR DO QUE ESTÁ NO BANCO, e não do arquivo do repositório:
-- `leads_graficos` já foi alterada depois da migration que a criou, e
-- reconstruir pelo repo apagaria essas mudanças. A asserção abaixo estoura se
-- a âncora não existir — migration que não muda nada em silêncio é pior que
-- migration que falha.
-- ------------------------------------------------------------
DO $do$
DECLARE
  v_def text;
  v_novo text;
  v_ancora text := 'WHEN b.assigned_agent_id IS NOT NULL';
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE proname = 'leads_graficos' AND pronamespace = 'public'::regnamespace;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'leads_graficos nao existe — nada a corrigir';
  END IF;

  IF position('usuario_assistente_ia' in v_def) > 0 THEN
    RAISE NOTICE 'leads_graficos ja tem a pergunta zero; nada a fazer';
    RETURN;
  END IF;

  IF position(v_ancora in v_def) = 0 THEN
    RAISE EXCEPTION 'ancora nao encontrada em leads_graficos: o CASE mudou de forma';
  END IF;

  v_novo := replace(
    v_def,
    v_ancora,
    'WHEN lower(btrim(b.assigned_agent_id)) = public.usuario_assistente_ia(p_tenant_id)::text THEN ''com_lia''' || chr(10) ||
    '        ' || v_ancora
  );

  IF v_novo = v_def THEN
    RAISE EXCEPTION 'a substituicao nao mudou nada';
  END IF;

  EXECUTE v_novo;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
