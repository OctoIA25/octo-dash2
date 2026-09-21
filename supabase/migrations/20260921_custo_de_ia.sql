-- Migration: Telemetria de custo de IA (P2.8)
-- Data: 2026-09-21
--
-- O plano diagnostica: "a telemetria mostra custo — porque o n8n não registra o
-- uso". Medido: dos 19 eventos em `agent_telemetry_events`, **nenhum** tem
-- token ou modelo. A tubulação inteira existe — tabela, cálculo de custo,
-- tela — e nada a alimenta.
--
-- MAS A CULPA NÃO É SÓ DO n8n. Os agentes da PRÓPRIA Dash (Caio e Elaine, 16
-- dos 19 eventos) chamam a OpenAI daqui, recebem `usage` na resposta e jogam
-- fora: o evento de telemetria que eles emitem não tem campo de modelo nem de
-- token. Isso se conserta sem depender de ninguém, e é o que faz o custo
-- deixar de ser "—" hoje.
--
-- `ia_uso` NÃO NASCE. `agent_telemetry_events` já tem modelo, tokens de
-- entrada, saída e cacheados, duração e agente — 6 das 11 colunas que o plano
-- lista — mais rota de emissão, cálculo de custo e tela. Decidido pelo chefe em
-- 21/09: estender. Duas tabelas gravando a mesma chamada de IA obrigariam a
-- tela a ler as duas e somar sem contar em dobro.
--
-- SOBRE "BATER COM A FATURA DO PROVEDOR" (o critério do plano)
-- Medido em 21/09: a Lotus está em `mode = 'max'` — assinatura Claude Max, não
-- cobrança por token. Nesse modo o próprio código ANULA o valor em dólar de
-- propósito e guarda só o percentual da janela semanal do plano. Não existe
-- fatura por token para conferir: o custo marginal de um token, ali, é zero.
--
-- Então a tela mostra o que cada coisa é, sem fingir que são a mesma:
--   * cobrança por token (OpenAI, e Anthropic em `mode='api'`) → custo em USD;
--   * assinatura (`mode='max'`) → percentual do plano consumido.
-- Somar os dois num número só seria inventar uma fatura que não existe.
--
-- ORDEM DO DEPLOY: banco antes do servidor e do front.

-- ------------------------------------------------------------
-- 1. As colunas que faltam no evento
-- ------------------------------------------------------------
-- `etapa` é o que o plano chama de etapa do agente (abertura, conversa,
-- handoff, leitura_doc…). Texto livre de propósito: cada agente tem as suas, e
-- um CHECK obrigaria deploy a cada etapa nova que a LIA inventasse.
ALTER TABLE public.agent_telemetry_events ADD COLUMN IF NOT EXISTS etapa text;
ALTER TABLE public.agent_telemetry_events ADD COLUMN IF NOT EXISTS lead_id uuid;
ALTER TABLE public.agent_telemetry_events ADD COLUMN IF NOT EXISTS conversa_id text;
ALTER TABLE public.agent_telemetry_events ADD COLUMN IF NOT EXISTS documento_id text;

-- "Custo por lead" e "custo por documento" são agrupamentos; sem índice, cada
-- abertura da tela varre a tabela inteira.
CREATE INDEX IF NOT EXISTS agent_telemetry_lead_idx
  ON public.agent_telemetry_events (tenant_id, lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_telemetry_custo_idx
  ON public.agent_telemetry_events (tenant_id, occurred_at) WHERE total_tokens > 0;

-- ------------------------------------------------------------
-- 2. A tabela de preços
-- ------------------------------------------------------------
-- Hoje os preços moram FIXOS no código (server/agent-telemetry/pricing.js), e
-- só de modelos da OpenAI. Mudar preço exige deploy, e modelo novo entra como
-- custo "—" até alguém lembrar.
--
-- Decidido pelo chefe em 21/09: a tabela MANDA; o mapa do código vira rede de
-- segurança para modelo ainda não cadastrado. Modelo que não está em lugar
-- nenhum continua mostrando "—" — nunca uma estimativa inventada.
--
-- Preço é por MILHÃO de tokens, em USD, como os provedores publicam.
CREATE TABLE IF NOT EXISTS public.ia_precos (
  -- Chave própria porque `tenant_id` é NULO no preço global, e coluna de
  -- PRIMARY KEY não aceita nulo no Postgres. A unicidade real vem do índice
  -- abaixo, que trata o nulo como "global".
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Global por padrão (tenant_id nulo): o preço do gpt-4o é o mesmo para todos.
  -- A coluna existe para a imobiliária que negocia preço próprio com o provedor.
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  modelo text NOT NULL,
  provedor text,

  preco_entrada_por_milhao numeric(10,4) NOT NULL CHECK (preco_entrada_por_milhao >= 0),
  preco_saida_por_milhao   numeric(10,4) NOT NULL CHECK (preco_saida_por_milhao >= 0),
  -- Entrada cacheada custa menos. Nulo = sem desconto de cache neste modelo.
  preco_cache_por_milhao   numeric(10,4) CHECK (preco_cache_por_milhao >= 0),

  moeda text NOT NULL DEFAULT 'USD',
  vigente_de date NOT NULL DEFAULT current_date,

  -- Quem conferiu o preço na página do provedor, e quando. NULO significa
  -- "veio do cadastro inicial e ninguém conferiu" — e a tela diz isso. Preço
  -- de IA muda com frequência, e um número velho vira custo errado silencioso.
  conferido_em date,
  conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  observacao text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um preço por modelo, vigência e dono. O UUID zerado representa "global" —
-- sem isso, `UNIQUE (modelo, vigente_de, tenant_id)` deixaria cadastrar o mesmo
-- preço global duas vezes, porque no Postgres nulo nunca é igual a nulo.
CREATE UNIQUE INDEX IF NOT EXISTS ia_precos_unico_idx ON public.ia_precos
  (modelo, vigente_de, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- O pg_default_acl do Supabase concede tudo a anon em toda tabela nova.
REVOKE ALL ON public.ia_precos FROM anon, authenticated;
GRANT SELECT ON public.ia_precos TO authenticated;
GRANT ALL ON public.ia_precos TO service_role;

ALTER TABLE public.ia_precos ENABLE ROW LEVEL SECURITY;

-- Preço global (tenant nulo) todo mundo lê; preço próprio, só a imobiliária dele.
DROP POLICY IF EXISTS ia_precos_select ON public.ia_precos;
CREATE POLICY ia_precos_select ON public.ia_precos
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL
         OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Só o OWNER mexe no preço global: ele vale para todas as imobiliárias, e um
-- erro ali reescreve o custo de todo mundo. Preço próprio é do admin do tenant.
DROP POLICY IF EXISTS ia_precos_write ON public.ia_precos;
CREATE POLICY ia_precos_write ON public.ia_precos
  FOR ALL TO authenticated
  USING (CASE WHEN tenant_id IS NULL THEN public.is_platform_owner()
              ELSE public.is_tenant_admin_or_owner(tenant_id) END)
  WITH CHECK (CASE WHEN tenant_id IS NULL THEN public.is_platform_owner()
                   ELSE public.is_tenant_admin_or_owner(tenant_id) END);

GRANT INSERT, UPDATE, DELETE ON public.ia_precos TO authenticated;

-- Os preços que o código já assumia, agora editáveis sem deploy. Os da
-- Anthropic entram porque é o provedor da LIA; TODOS nascem com
-- `conferido_em` nulo — são preço de tabela pública, e a tela avisa que
-- ninguém conferiu ainda.
--
-- VIGÊNCIA RETROATIVA, de propósito. O padrão da coluna é "hoje", e com ele
-- nenhum evento anterior a este deploy teria preço: o custo do histórico
-- inteiro ficaria "—" para sempre, e o gestor abriria a tela nova e não veria
-- nada. 2026-01-01 é anterior ao primeiro evento de telemetria (14/08/2026).
INSERT INTO public.ia_precos
  (tenant_id, modelo, provedor, preco_entrada_por_milhao, preco_cache_por_milhao, preco_saida_por_milhao, vigente_de, observacao)
VALUES
  (NULL, 'gpt-4.1',           'openai',    2.0000,  0.5000,  8.0000,  '2026-01-01', 'tabela pública; conferir antes de usar em fechamento'),
  (NULL, 'gpt-4.1-mini',      'openai',    0.4000,  0.1000,  1.6000,  '2026-01-01', 'tabela pública; conferir antes de usar em fechamento'),
  (NULL, 'gpt-4o',            'openai',    2.5000,  1.2500, 10.0000,  '2026-01-01', 'modelo padrão do Caio e da Elaine'),
  (NULL, 'gpt-4o-mini',       'openai',    0.1500,  0.0750,  0.6000,  '2026-01-01', 'tabela pública; conferir antes de usar em fechamento'),
  (NULL, 'claude-sonnet-4-5', 'anthropic', 3.0000,  0.3000, 15.0000,  '2026-01-01', 'provedor da LIA; conferir na página de preços'),
  (NULL, 'claude-opus-4-5',   'anthropic', 5.0000,  0.5000, 25.0000,  '2026-01-01', 'provedor da LIA; conferir na página de preços'),
  (NULL, 'claude-haiku-4-5',  'anthropic', 1.0000,  0.1000,  5.0000,  '2026-01-01', 'provedor da LIA; conferir na página de preços')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3. O preço vigente de um modelo
-- ------------------------------------------------------------
-- Preço próprio da imobiliária vence o global; entre várias vigências, a mais
-- recente que já começou. Vigência futura NÃO vale hoje — cadastrar o preço
-- novo com antecedência não pode reescrever o custo de ontem.
CREATE OR REPLACE FUNCTION public.ia_preco_vigente(
  p_tenant_id uuid,
  p_modelo    text,
  p_quando    date DEFAULT current_date
)
RETURNS TABLE (
  preco_entrada numeric,
  preco_cache   numeric,
  preco_saida   numeric,
  vigente_de    date,
  conferido     boolean
)
LANGUAGE sql
STABLE
AS $function$
  SELECT p.preco_entrada_por_milhao, p.preco_cache_por_milhao, p.preco_saida_por_milhao,
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
-- 4. O custo, calculado
-- ------------------------------------------------------------
-- Custo é SEMPRE derivado na leitura: tokens reais × preço vigente. Nunca
-- gravado no evento — preço corrigido depois reescreveria o histórico inteiro,
-- e um evento com custo congelado errado é pior que evento sem custo.
--
-- Semântica do cache: `cached_tokens` é SUBCONJUNTO de `input_tokens`, como a
-- OpenAI reporta. O trecho cacheado sai do preço cheio e entra pelo de cache.
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
  v_caller uuid := auth.uid();
  v_de timestamptz := COALESCE(p_de, now() - interval '30 days');
  v_ate timestamptz := COALESCE(p_ate, now());
  v_total jsonb;
  v_agentes jsonb;
  v_etapas jsonb;
  v_modelos jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  -- Os quatro agrupamentos saem de UMA consulta: o cálculo do custo por evento
  -- é feito uma vez, no primeiro CTE, e os outros o reaproveitam. Tabela
  -- temporária não serve — `CREATE TABLE AS` não vale em função `STABLE`, e
  -- marcar a função como volátil por causa disso seria mentir sobre uma leitura.
  WITH custos AS (
    SELECT e.agent_slug, e.model, e.etapa, e.lead_id, e.documento_id,
           e.input_tokens, e.output_tokens, e.cached_tokens, e.total_tokens,
           pr.preco_entrada, pr.conferido,
           CASE WHEN pr.preco_entrada IS NULL OR COALESCE(e.total_tokens, 0) = 0 THEN NULL
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
  ),
  total AS (
    SELECT jsonb_build_object(
      'chamadas', count(*),
      'com_uso', count(*) FILTER (WHERE COALESCE(total_tokens, 0) > 0),
      -- "Sem uso reportado" é o número que explica um custo baixo demais. Sem
      -- ele, o gestor lê "US$ 0,40" e acha que a IA é barata, quando na
      -- verdade a maioria das chamadas não contou.
      'sem_uso', count(*) FILTER (WHERE COALESCE(total_tokens, 0) = 0),
      'sem_preco', count(*) FILTER (WHERE COALESCE(total_tokens, 0) > 0 AND preco_entrada IS NULL),
      'tokens_entrada', COALESCE(sum(input_tokens), 0),
      'tokens_saida', COALESCE(sum(output_tokens), 0),
      'tokens_cache', COALESCE(sum(cached_tokens), 0),
      -- NULL, e não 0, quando nada foi calculável: zero diria "não gastou".
      'custo_usd', sum(custo_usd),
      'leads_atendidos', count(DISTINCT lead_id) FILTER (WHERE lead_id IS NOT NULL),
      'documentos', count(DISTINCT documento_id) FILTER (WHERE documento_id IS NOT NULL),
      'precos_nao_conferidos', count(DISTINCT model) FILTER (WHERE preco_entrada IS NOT NULL AND NOT conferido)
    ) j FROM custos
  ),
  agentes AS (
    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'custo_usd')::numeric DESC NULLS LAST), '[]'::jsonb) j
      FROM (SELECT jsonb_build_object(
              'agente', agent_slug,
              'chamadas', count(*),
              'sem_uso', count(*) FILTER (WHERE COALESCE(total_tokens, 0) = 0),
              'tokens', COALESCE(sum(total_tokens), 0),
              'custo_usd', sum(custo_usd),
              'leads', count(DISTINCT lead_id) FILTER (WHERE lead_id IS NOT NULL)
            ) x FROM custos GROUP BY agent_slug) s
  ),
  etapas AS (
    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'custo_usd')::numeric DESC NULLS LAST), '[]'::jsonb) j
      FROM (SELECT jsonb_build_object(
              'etapa', COALESCE(etapa, 'não informada'),
              'chamadas', count(*),
              'custo_usd', sum(custo_usd)
            ) x FROM custos GROUP BY COALESCE(etapa, 'não informada')) s
  ),
  modelos AS (
    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'custo_usd')::numeric DESC NULLS LAST), '[]'::jsonb) j
      FROM (SELECT jsonb_build_object(
              'modelo', COALESCE(model, 'não informado'),
              'chamadas', count(*),
              'tokens', COALESCE(sum(total_tokens), 0),
              'custo_usd', sum(custo_usd),
              'tem_preco', bool_or(preco_entrada IS NOT NULL),
              'preco_conferido', bool_and(COALESCE(conferido, false))
            ) x FROM custos GROUP BY model) s
  )
  SELECT total.j, agentes.j, etapas.j, modelos.j
    INTO v_total, v_agentes, v_etapas, v_modelos
    FROM total, agentes, etapas, modelos;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'total', v_total,
    'por_agente', v_agentes,
    'por_etapa', v_etapas,
    'por_modelo', v_modelos
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ia_custos_painel(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_custos_painel(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. O interruptor por agente
-- ------------------------------------------------------------
-- O plano pede "interruptor liga/desliga por agente (só Owner), com aviso do
-- que para de funcionar". Só o owner porque desligar um agente é decisão de
-- plataforma: a imobiliária pagou por ele, e o desligamento costuma ser por
-- custo ou incidente — não preferência do dia.
--
-- Quem OBEDECE é quem chama a IA (o n8n, e o servidor nos agentes próprios).
-- A Dash guarda a decisão e a expõe; ela não intercepta chamada de ninguém —
-- mesma divisão do P1.1.
CREATE TABLE IF NOT EXISTS public.tenant_agente_config (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agente text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  -- Por que foi desligado. Sem isto, daqui a três semanas ninguém lembra se o
  -- agente está fora por custo, por incidente ou por engano.
  motivo text,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, agente)
);

REVOKE ALL ON public.tenant_agente_config FROM anon, authenticated;
GRANT SELECT ON public.tenant_agente_config TO authenticated;
GRANT INSERT, UPDATE ON public.tenant_agente_config TO authenticated;
GRANT ALL ON public.tenant_agente_config TO service_role;

ALTER TABLE public.tenant_agente_config ENABLE ROW LEVEL SECURITY;

-- Todo membro LÊ: o corretor precisa saber por que o agente não respondeu.
DROP POLICY IF EXISTS tenant_agente_config_select ON public.tenant_agente_config;
CREATE POLICY tenant_agente_config_select ON public.tenant_agente_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Só o OWNER escreve, como o plano pede.
DROP POLICY IF EXISTS tenant_agente_config_write ON public.tenant_agente_config;
CREATE POLICY tenant_agente_config_write ON public.tenant_agente_config
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());
