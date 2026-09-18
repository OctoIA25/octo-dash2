-- Migration: `consistencia_diaria` — o resultado do teste diário de números
-- Data: 2026-09-18
-- Descrição: P0.6 do plano, "teste diário comparando totais". Depende do P0.5,
-- que fechou hoje.
--
-- POR QUE UMA TABELA, E NÃO CALCULAR NA HORA. O endpoint de Status do Tenant
-- (server/observability/tenantHealthRoutes.js) só LÊ estado já persistido, por
-- desenho: ele é a ferramenta de diagnóstico e não pode cair na presença do
-- defeito que deveria medir. O job escreve aqui uma vez por dia; a tela lê.
--
-- O QUE ISTO PRECISA PEGAR. Toda a leva de defeitos de 17 e 18/09 tinha a mesma
-- assinatura: um contador somava uma coluna vazia, ou filtrava por um valor que
-- a base nunca gravou, e devolvia um número PLAUSÍVEL — zero, quase sempre.
-- Nada quebrava, nada aparecia em log. A checagem que teria pego todos eles é
-- "esta coluna que vira número está 100% vazia?".
--
-- SEM RLS COM POLICY, como `lead_toques` e `lead_events`: quem lê é o servidor
-- com service_role, e o endpoint já é owner-only. Manter a tabela fora do
-- PostgREST é a mesma decisão registrada em toquesService.ts:4.

CREATE TABLE IF NOT EXISTS public.consistencia_diaria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  executado_em timestamptz NOT NULL DEFAULT now(),
  ok           boolean NOT NULL,
  -- [{ nome, ok, esperado, obtido, detalhe }] — o formato que checks.js produz.
  checagens    jsonb NOT NULL DEFAULT '[]'::jsonb
);

-- A tela pede sempre "o último desta imobiliária": o índice é (tenant, data
-- desc) para essa leitura não varrer o histórico.
CREATE INDEX IF NOT EXISTS consistencia_diaria_tenant_data_idx
  ON public.consistencia_diaria (tenant_id, executado_em DESC);

ALTER TABLE public.consistencia_diaria ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.consistencia_diaria IS
  'Resultado do teste diário de consistência dos números (P0.6). Escrita pelo '
  'job server/consistencia; lida pelo endpoint de Status do Tenant. Sem policy '
  'de RLS: é server-only, como lead_toques.';

-- O `pg_default_acl` do schema public concede `arwdDxtm` a anon e authenticated
-- em TODA relação nova. Sem este REVOKE a tabela nasce legível pela chave que
-- vai no bundle do browser — foi assim que as três views deste plano nasceram
-- abertas, em 18/09, e só o teste de catálogo pegou.
REVOKE ALL ON public.consistencia_diaria FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.consistencia_diaria TO service_role;

-- ----------------------------------------------------------------------------
-- Os números que o job compara, numa ida só.
--
-- Agrupar por etapa é o ponto: o cliente do Supabase não faz GROUP BY, e fazer
-- em JS obrigaria a baixar todos os leads todo dia só para contá-los — o mesmo
-- desperdício que o `select('*')` + `.length` que este projeto já removeu duas
-- vezes.
--
-- SECURITY DEFINER porque quem chama é o job com service_role, que já bypassa
-- RLS; o `search_path` fixo evita sequestro de resolução de nome.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consistencia_numeros(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'totalLeads', (SELECT count(*) FROM leads WHERE tenant_id = p_tenant AND archived_at IS NULL),
    'porEtapa', COALESCE((
      SELECT jsonb_object_agg(COALESCE(NULLIF(btrim(status), ''), '(sem etapa)'), n)
      FROM (
        SELECT status, count(*) AS n FROM leads
        WHERE tenant_id = p_tenant AND archived_at IS NULL GROUP BY status
      ) g
    ), '{}'::jsonb),
    'comCorretor', (
      SELECT count(*) FROM leads
      WHERE tenant_id = p_tenant AND archived_at IS NULL
        AND (assigned_agent_id IS NOT NULL OR btrim(COALESCE(assigned_agent_name, '')) <> '')
    ),
    'naOrigem', (
      SELECT count(*) FROM proposals
      WHERE tenant_id = p_tenant AND stage_id = 'proposta-assinada' AND signed_at IS NOT NULL
    ),
    -- `to_regclass` devolve NULL quando a relação não existe: num ambiente sem
    -- as views deste plano, a checagem sai como "não verificável" em vez de
    -- estourar. O painel de saúde não pode cair por causa do que ele mede.
    'naView', CASE WHEN to_regclass('public.vendas_assinadas') IS NULL THEN NULL ELSE (
      SELECT count(*) FROM vendas_assinadas WHERE tenant_id = p_tenant) END,
    'contatados', CASE WHEN to_regclass('public.primeira_interacao') IS NULL THEN NULL ELSE (
      SELECT count(*) FROM primeira_interacao WHERE tenant_id = p_tenant AND archived_at IS NULL) END
  );
$$;

REVOKE ALL ON FUNCTION public.consistencia_numeros(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consistencia_numeros(uuid) TO service_role;
