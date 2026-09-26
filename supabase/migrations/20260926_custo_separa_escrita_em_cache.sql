-- ============================================================
-- O custo de IA subestimava a conta da Lia em 36× — 26/09
-- ============================================================
--
-- A equipe da Lia pediu o preço do `claude-opus-5-5` com o valor da ESCRITA em
-- cache. Ao montar, apareceu um problema maior que o preço que faltava.
--
-- A NOSSA FÓRMULA USA A CONVENÇÃO DA OPENAI. Lá `cached_tokens` é SUBCONJUNTO
-- de `input_tokens`, então a conta subtrai:
--
--     não_cacheado = max(input − cached, 0)
--     custo = não_cacheado×entrada + min(cached,input)×cache + saída×saída
--
-- Na Anthropic as três parcelas são INDEPENDENTES: `input_tokens` traz só o
-- que não estava em cache, e `cache_read`/`cache_creation` vêm à parte. Com o
-- prompt inteiro em cache, `input_tokens` é quase zero — e aí as duas
-- primeiras parcelas da conta acima dão ZERO, porque `min(cached, input)` é
-- zero.
--
-- Medido com os números reais que eles levantaram em 25/09 (43 k lidos,
-- 19,5 k escritos, 235 de saída por chamada, 157 chamadas/dia):
--
--     nossa fórmula hoje   US$  0,74 / dia   (US$ 0,0047 por chamada)
--     com a conta certa    US$ 26,58 / dia   (US$ 0,1693 por chamada)
--
-- Subestima 36×, e 92% do que faltava é a ESCRITA em cache. O valor corrigido
-- cai dentro da estimativa independente que eles fizeram (US$ 20–35/dia).
--
-- Cadastrar o preço sem corrigir isto produziria um número errado com cara de
-- exato, na tela que existe para dizer quanto se gasta.
--
-- ============================================================
-- POR QUE SEPARAR POR PROVEDOR, E NÃO UNIFICAR O CONTRATO
--
-- Unificar seria mais limpo: todo mundo manda parcelas que não se sobrepõem e
-- a fórmula só soma. Mas exigiria mexer no Caio e na Elaine para subtraírem
-- antes de mandar, e reinterpretaria os 19 eventos já gravados — cujo valor
-- mudaria sem ninguém pedir.
--
-- Cada provedor cobra de um jeito. A fórmula passa a dizer isso em letra, em
-- vez de fingir que os dois são iguais.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Onde guardar a escrita em cache
-- ------------------------------------------------------------
ALTER TABLE public.agent_telemetry_events
  ADD COLUMN IF NOT EXISTS cache_escrita_tokens integer
    CHECK (cache_escrita_tokens IS NULL OR cache_escrita_tokens >= 0);

COMMENT ON COLUMN public.agent_telemetry_events.cache_escrita_tokens IS
  'Tokens ESCRITOS no cache (`cache_creation_input_tokens` da Anthropic). Parcela propria, cobrada mais caro que a entrada: 1,25x no cache de 5 min e 2x no de 1 h. Nao e subconjunto de input_tokens.';

ALTER TABLE public.ia_precos
  ADD COLUMN IF NOT EXISTS preco_cache_escrita_por_milhao numeric(10,4)
    CHECK (preco_cache_escrita_por_milhao IS NULL OR preco_cache_escrita_por_milhao >= 0);

COMMENT ON COLUMN public.ia_precos.preco_cache_escrita_por_milhao IS
  'Preco da ESCRITA em cache. Na Anthropic e a parcela que mais pesa em prompt grande e reutilizado. Nulo = provedor nao cobra a escrita a parte (OpenAI).';

COMMENT ON COLUMN public.ia_precos.preco_cache_por_milhao IS
  'Preco da LEITURA do cache (cache hit). O nome ficou generico de quando so havia uma parcela de cache.';

-- ------------------------------------------------------------
-- 1b. `lia_vps` passa a ser uma origem válida
--
-- Achado ao escrever o teste, e teria travado a Lia no primeiro evento: a
-- coluna `source` só aceitava 'crm_server', 'crm_web' e 'n8n'. Eles mandariam
-- e levariam erro de constraint.
--
-- Eles estão certos que `n8n` seria falso: a Lia é Node + claude CLI numa VPS,
-- e o n8n só encaminha o webhook do WhatsApp. Gravar `n8n` faria a Telemetria
-- atribuir o custo da Lia a um componente que não chama modelo nenhum — e
-- ninguém desconfiaria, porque o valor apareceria.
-- ------------------------------------------------------------
ALTER TABLE public.agent_telemetry_events
  DROP CONSTRAINT IF EXISTS agent_telemetry_events_source_check;

ALTER TABLE public.agent_telemetry_events
  ADD CONSTRAINT agent_telemetry_events_source_check
  CHECK (source = ANY (ARRAY['crm_server', 'crm_web', 'n8n', 'lia_vps']));

COMMENT ON COLUMN public.agent_telemetry_events.source IS
  'De onde o evento veio. `lia_vps` e a Lia (Node + claude CLI na VPS); `n8n` e so o encaminhador do webhook e nao chama modelo.';

-- ------------------------------------------------------------
-- 2. O preço vigente passa a devolver a escrita
--
-- `RETURNS TABLE` muda, então é DROP e CREATE: `CREATE OR REPLACE` recusa
-- mudar o tipo de retorno de uma função existente.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ia_preco_vigente(uuid, text, date);

CREATE OR REPLACE FUNCTION public.ia_preco_vigente(
  p_tenant_id uuid,
  p_modelo    text,
  p_quando    date DEFAULT current_date
)
RETURNS TABLE (
  preco_entrada        numeric,
  preco_cache          numeric,
  preco_cache_escrita  numeric,
  preco_saida          numeric,
  vigente_de           date,
  conferido            boolean
)
LANGUAGE sql
STABLE
AS $function$
  SELECT p.preco_entrada_por_milhao, p.preco_cache_por_milhao,
         p.preco_cache_escrita_por_milhao, p.preco_saida_por_milhao,
         p.vigente_de, p.conferido_em IS NOT NULL
    FROM public.ia_precos p
   WHERE p.modelo = p_modelo
     AND p.vigente_de <= p_quando
     AND (p.tenant_id IS NULL OR p.tenant_id = p_tenant_id)
   ORDER BY (p.tenant_id IS NOT NULL) DESC, p.vigente_de DESC
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.ia_preco_vigente(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_preco_vigente(uuid, text, date) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Os preços da Anthropic, da página oficial
--
-- Lidos em 26/09/2026 em platform.claude.com/docs/en/about-claude/pricing.
-- `conferido_em` fica preenchido: a tela distingue preço conferido de preço
-- herdado, e herdar preço sem dizer de onde veio é o que fez a coluna do
-- Opus 5 ficar vazia desde sempre.
--
-- A ESCRITA É A DE 1 HORA (2x a entrada), porque é o cache que a Lia usa —
-- eles mediram cache_read ~198 k por chamada com validade de 1 h. A de 5
-- minutos (1,25x) não se aplica aqui.
-- ------------------------------------------------------------
INSERT INTO public.ia_precos
  (tenant_id, modelo, provedor, preco_entrada_por_milhao, preco_cache_por_milhao,
   preco_cache_escrita_por_milhao, preco_saida_por_milhao, moeda, vigente_de,
   conferido_em, observacao)
VALUES
  -- O modelo que a Lia usa hoje (ATENDENTE_MODEL e CORRETOR_MODEL).
  -- A leitura do 5.5 é 0,05x a entrada, e não o 0,1x dos outros: US$ 0,20.
  (NULL, 'claude-opus-5-5', 'anthropic', 4.00, 0.20, 8.00, 20.00, 'USD', '2026-01-01',
   current_date, 'pagina oficial, lida em 26/09/2026. Escrita = cache de 1 h (2x). Leitura do 5.5 e 0,05x, nao 0,1x.')
ON CONFLICT (modelo, vigente_de, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET
  preco_entrada_por_milhao       = EXCLUDED.preco_entrada_por_milhao,
  preco_cache_por_milhao         = EXCLUDED.preco_cache_por_milhao,
  preco_cache_escrita_por_milhao = EXCLUDED.preco_cache_escrita_por_milhao,
  preco_saida_por_milhao         = EXCLUDED.preco_saida_por_milhao,
  conferido_em                   = EXCLUDED.conferido_em,
  observacao                     = EXCLUDED.observacao;

-- As linhas da Anthropic que já existiam nunca tiveram escrita. Os valores
-- saem da mesma página oficial: escrita de 1 h = 2x a entrada.
UPDATE public.ia_precos SET
  preco_cache_escrita_por_milhao = preco_entrada_por_milhao * 2,
  conferido_em = current_date,
  observacao = COALESCE(observacao, '') || ' | escrita de cache de 1 h (2x a entrada), pagina oficial lida em 26/09/2026'
 WHERE provedor = 'anthropic'
   AND preco_cache_escrita_por_milhao IS NULL;

-- A OpenAI NÃO cobra a escrita à parte: o cache dela é entrada mais barata, e
-- `cached_tokens` é subconjunto de `input_tokens`. Deixar nulo é a resposta
-- certa — e o ramo `openai` da fórmula abaixo nem consulta esta coluna.

-- ------------------------------------------------------------
-- 4. A conta, agora por provedor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ia_custos_painel(
  p_tenant_id uuid,
  p_de        timestamptz DEFAULT NULL,
  p_ate       timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_de  timestamptz := COALESCE(p_de, now() - interval '30 days');
  v_ate timestamptz := COALESCE(p_ate, now());
  v_res jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant_memberships tm
                  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())
     AND NOT public.is_platform_owner() THEN
    RETURN NULL;
  END IF;

  WITH custos AS (
    SELECT e.agent_slug, e.model, e.etapa, e.lead_id, e.documento_id,
           e.input_tokens, e.output_tokens, e.cached_tokens,
           e.cache_escrita_tokens, e.total_tokens,
           pr.preco_entrada, pr.conferido,
           CASE
             WHEN pr.preco_entrada IS NULL THEN NULL
             -- "Sem token nenhum" e nao "total_tokens zerado": quem manda as
             -- parcelas separadas pode deixar o total em branco, e a conta
             -- viraria nula sem motivo.
             WHEN COALESCE(e.total_tokens, 0) = 0
              AND COALESCE(e.input_tokens, 0) + COALESCE(e.output_tokens, 0)
                + COALESCE(e.cached_tokens, 0) + COALESCE(e.cache_escrita_tokens, 0) = 0
               THEN NULL

             -- ANTHROPIC: as tres parcelas de entrada sao INDEPENDENTES.
             -- `input_tokens` ja vem so com o que nao estava em cache.
             WHEN lower(COALESCE(e.provider, '')) = 'anthropic' THEN (
                 (COALESCE(e.input_tokens, 0) * pr.preco_entrada)
               + (COALESCE(e.cached_tokens, 0) * COALESCE(pr.preco_cache, pr.preco_entrada))
               + (COALESCE(e.cache_escrita_tokens, 0) * COALESCE(pr.preco_cache_escrita, pr.preco_entrada))
               + (COALESCE(e.output_tokens, 0) * pr.preco_saida)
             ) / 1000000.0

             -- OPENAI E O RESTO: `cached_tokens` e SUBCONJUNTO de
             -- `input_tokens`, entao subtrai. Identico ao que era antes: os
             -- 19 eventos do Caio e da Elaine nao mudam de valor.
             ELSE (
                 (GREATEST(COALESCE(e.input_tokens, 0) - LEAST(COALESCE(e.cached_tokens, 0), COALESCE(e.input_tokens, 0)), 0) * pr.preco_entrada)
               + (LEAST(COALESCE(e.cached_tokens, 0), COALESCE(e.input_tokens, 0)) * COALESCE(pr.preco_cache, pr.preco_entrada))
               + (COALESCE(e.output_tokens, 0) * pr.preco_saida)
             ) / 1000000.0
           END AS custo_usd
      FROM agent_telemetry_events e
      LEFT JOIN LATERAL public.ia_preco_vigente(
        p_tenant_id, e.model, (e.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date
      ) pr ON true
     WHERE e.tenant_id = p_tenant_id
       AND e.occurred_at >= v_de AND e.occurred_at < v_ate
  )
  SELECT jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'eventos', count(*),
    'com_uso', count(*) FILTER (WHERE COALESCE(total_tokens, 0) > 0
                                   OR COALESCE(cache_escrita_tokens, 0) > 0
                                   OR COALESCE(cached_tokens, 0) > 0),
    -- Quantos eventos NAO tem preco cadastrado. Sem isto, um total baixo
    -- parece economia quando e medicao faltando.
    'sem_preco', count(*) FILTER (WHERE preco_entrada IS NULL),
    'custo_usd', COALESCE(sum(custo_usd), 0),
    'por_modelo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'model', model, 'eventos', n, 'custo_usd', c, 'conferido', conf))
        FROM (SELECT model, count(*) AS n, COALESCE(sum(custo_usd), 0) AS c,
                     bool_or(COALESCE(conferido, false)) AS conf
                FROM custos GROUP BY model ORDER BY 3 DESC) m
    ), '[]'::jsonb),
    'por_etapa', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('etapa', etapa, 'eventos', n, 'custo_usd', c))
        FROM (SELECT COALESCE(etapa, 'sem etapa') AS etapa, count(*) AS n,
                     COALESCE(sum(custo_usd), 0) AS c
                FROM custos GROUP BY 1 ORDER BY 3 DESC) t
    ), '[]'::jsonb)
  ) INTO v_res
  FROM custos;

  RETURN v_res;
END;
$function$;

COMMENT ON FUNCTION public.ia_custos_painel(uuid, timestamptz, timestamptz) IS
  'Custo de IA por modelo e etapa. A conta e SEPARADA POR PROVEDOR: na anthropic as tres parcelas de entrada sao independentes; na openai `cached_tokens` e subconjunto de `input_tokens`. Unificar subestimava a Lia em 36x (26/09).';

REVOKE ALL ON FUNCTION public.ia_custos_painel(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_custos_painel(uuid, timestamptz, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
