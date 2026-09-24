-- ============================================================
-- A Conferência de vendas passa a mostrar A PLANILHA — item 5 do chefe, 24/09
--
--   "A conferência de vendas, é aquela planilha de vendas que vc tem...
--    Pode liberar na Dash, mas dentro de Jurídico.
--    Tenta puxar os dados da planilha aqui pra vermos como fica...
--    Ai tem que adicionar um filtro pra vermos entre todas/lançamentos/prontos
--    Além do corretor, colocar o gerente em uma coluna
--    Trocar o nome para Empreendimento / Código do Imóvel
--    Tirar coluna de repasses, colocar uma de a vista ou parcelado"
--
-- ============================================================
-- O QUE FOI MEDIDO ANTES DE ESCREVER, em produção, em 24/09
-- ============================================================
--
-- `commercial_sales` tem 74 linhas, 37 ativas, de 12/01 a 24/08. É o histórico
-- congelado da importação: o sync de hora em hora foi desligado em 01/09.
--
-- Três dos cinco pedidos batem em dado que NÃO existe na planilha:
--
--   GERENTE        `team_leader_nome` está vazia em 72 das 74, e as 2
--                  preenchidas trazem o texto "R$ 0,00" — é uma coluna de
--                  VALOR lida como nome. Não há nome de gerente na planilha.
--
--   LANÇAMENTO /   A coluna `tipo` guarda o NÍVEL DO CORRETOR (PL 46, Tropa
--   PRONTO         12, TL 8, ES 2, Estagiário 2), não o tipo do negócio.
--
--   PAGAMENTO      Não existe forma de pagamento nem parcela, em nenhuma das
--                  26 posições da linha original (`raw_row`).
--
-- Por decisão de 24/09, os dois primeiros são DERIVADOS do que a Dash já sabe,
-- e o terceiro vira campo da Dash, preenchido à mão.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. O pagamento: tabela à parte, e não coluna em `commercial_sales`
--
-- `commercial_sales` é a cópia da planilha. Escrever nela faria o trabalho da
-- equipe ser apagado no dia em que alguém religar a importação — e ninguém
-- ligaria uma coisa à outra. O que a Dash sabe fica na Dash.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venda_pagamento (
  venda_planilha_id uuid PRIMARY KEY
    REFERENCES public.commercial_sales(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- 'a_vista' | 'parcelado'. NULL = ninguém disse ainda, e é diferente de
  -- "à vista": a tela precisa distinguir para saber o que falta preencher.
  forma text,

  parcelas_total integer,
  parcelas_pagas integer NOT NULL DEFAULT 0,

  observacao text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,

  CONSTRAINT venda_pagamento_forma_ck
    CHECK (forma IS NULL OR forma IN ('a_vista', 'parcelado')),
  -- Parcelado precisa de quantas. À vista não pode ter parcela: seriam duas
  -- afirmações contrárias na mesma linha, e a tela mostraria "à vista, 3 de 5".
  CONSTRAINT venda_pagamento_parcelas_ck
    CHECK (
      (forma = 'parcelado' AND parcelas_total IS NOT NULL AND parcelas_total >= 1)
      OR (forma = 'a_vista' AND parcelas_total IS NULL)
      OR (forma IS NULL AND parcelas_total IS NULL)
    ),
  CONSTRAINT venda_pagamento_pagas_ck
    CHECK (parcelas_pagas >= 0 AND (parcelas_total IS NULL OR parcelas_pagas <= parcelas_total))
);

COMMENT ON TABLE public.venda_pagamento IS
  'Forma de pagamento de cada venda da planilha — campo da Dash, nao da planilha. Fica fora de commercial_sales porque aquela tabela e copia da importacao e seria sobrescrita.';

CREATE INDEX IF NOT EXISTS venda_pagamento_tenant_idx ON public.venda_pagamento (tenant_id);

-- Esta base concede tudo ao anônimo em toda relação nova. Sem o REVOKE, a
-- linha abaixo não restringe coisa alguma.
REVOKE ALL ON public.venda_pagamento FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_pagamento TO authenticated;
GRANT ALL ON public.venda_pagamento TO service_role;

ALTER TABLE public.venda_pagamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venda_pagamento_select ON public.venda_pagamento;
CREATE POLICY venda_pagamento_select ON public.venda_pagamento
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Escrever é de quem administra: é dinheiro, e a coluna diz o que a casa já
-- recebeu. O corretor lê a própria venda e não mexe no que foi pago.
DROP POLICY IF EXISTS venda_pagamento_write ON public.venda_pagamento;
CREATE POLICY venda_pagamento_write ON public.venda_pagamento
  FOR ALL TO authenticated
  USING (public.financeiro_pode_ver(tenant_id))
  WITH CHECK (public.financeiro_pode_ver(tenant_id));

-- ------------------------------------------------------------
-- 2. A conferência, lendo a planilha
--
-- Uma consulta devolve as linhas E o tamanho do que não dá para saber. Duas
-- consultas com o mesmo WHERE copiado divergem na primeira correção, e aí o
-- rodapé passa a contradizer a tabela.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_planilha_conferencia(
  p_tenant_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_tipo text DEFAULT NULL,        -- 'lancamento' | 'terceiros' | NULL (todas)
  p_corretor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN
    RAISE EXCEPTION 'sem permissao para a conferencia de vendas'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH membros AS (
    -- O corretor da planilha é TEXTO. Casar por nome normalizado é o que
    -- existe: `corretor_email` está vazio na maioria das linhas. Medido em
    -- 24/09: 19 das 37 vendas ativas casam com um membro.
    SELECT tm.user_id, tm.team_id,
           public.normalizar_texto(COALESCE(u.raw_user_meta_data ->> 'name', u.email)) AS chave
      FROM public.tenant_memberships tm
      JOIN auth.users u ON u.id = tm.user_id
     WHERE tm.tenant_id = p_tenant_id
  ),
  linhas AS (
    SELECT
      cs.id,
      cs.data_assinatura,
      cs.empreendimento,
      -- "Empreendimento / Código do Imóvel": a planilha não tem código de
      -- imóvel, tem quadra e unidade (59 e 58 de 74). É o que identifica a
      -- unidade vendida, e é o que vai na coluna.
      NULLIF(btrim(COALESCE(cs.quadra, '') || CASE WHEN COALESCE(cs.unidade,'') <> ''
                                                   THEN ' · ' || cs.unidade ELSE '' END), '') AS unidade_codigo,
      cs.cliente_nome,
      cs.corretor_nome,
      cs.tipo AS nivel_corretor,
      -- O GERENTE: quem lidera a equipe do corretor daquela venda. Vem do
      -- cadastro da Dash, não da planilha — lá a coluna não existe.
      lider.nome AS gerente,
      -- LANÇAMENTO OU PRONTO: do cadastro de empreendimentos, que é onde a
      -- casa já disse o que cada nome é. A planilha não diz.
      al.tipo AS tipo_negocio,
      cs.valor_vgv,
      cs.comissao_total_venda,
      cs.data_recebimento,
      pg.forma        AS pagamento_forma,
      pg.parcelas_total,
      pg.parcelas_pagas
    FROM public.commercial_sales cs
    LEFT JOIN membros m
           ON m.chave = public.normalizar_texto(cs.corretor_nome)
    LEFT JOIN public.teams eq ON eq.id = m.team_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(u2.raw_user_meta_data ->> 'name', u2.email) AS nome
        FROM auth.users u2 WHERE u2.id = eq.leader_user_id
    ) lider ON true
    LEFT JOIN public.vendas_empreendimento_alias al
           ON al.tenant_id = cs.tenant_id
          AND public.normalizar_texto(al.nome_bruto) = public.normalizar_texto(cs.empreendimento)
    LEFT JOIN public.venda_pagamento pg ON pg.venda_planilha_id = cs.id
   WHERE cs.tenant_id = p_tenant_id
     AND cs.is_active
     AND (p_de  IS NULL OR cs.data_assinatura >= p_de)
     AND (p_ate IS NULL OR cs.data_assinatura <= p_ate)
     AND (p_tipo IS NULL OR al.tipo = p_tipo)
     AND (p_corretor IS NULL
          OR public.normalizar_texto(cs.corretor_nome) = public.normalizar_texto(p_corretor))
  )
  SELECT jsonb_build_object(
    'linhas', COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.data_assinatura DESC NULLS LAST), '[]'::jsonb),
    'total_linhas', count(*),
    'total_vgv',     COALESCE(sum(l.valor_vgv), 0),
    'total_comissao',COALESCE(sum(l.comissao_total_venda), 0),
    -- O QUE A TELA NÃO SABE, contado aqui e dito lá. Sem isto, a coluna vazia
    -- parece defeito da tela em vez de cadastro por fazer.
    'sem_gerente',     count(*) FILTER (WHERE l.gerente IS NULL),
    'sem_tipo',        count(*) FILTER (WHERE l.tipo_negocio IS NULL),
    'sem_pagamento',   count(*) FILTER (WHERE l.pagamento_forma IS NULL)
  ) INTO v_resultado
  FROM linhas l;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text, text) IS
  'A planilha comercial para a Conferencia de vendas, com gerente derivado da equipe, tipo derivado do cadastro de empreendimentos, e a forma de pagamento que a Dash guarda. Devolve tambem quantas linhas ficaram sem cada um desses tres.';

REVOKE ALL ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Gravar a forma de pagamento
--
-- Por função, e não por UPDATE do navegador: a regra de "parcelado precisa de
-- quantas" e "à vista não tem parcela" é do banco, e quem escreve pela tabela
-- direto passaria por cima da conferência de quem pode.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_pagamento_gravar(
  p_venda_planilha_id uuid,
  p_forma text,
  p_parcelas_total integer DEFAULT NULL,
  p_parcelas_pagas integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT cs.tenant_id INTO v_tenant
    FROM public.commercial_sales cs WHERE cs.id = p_venda_planilha_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'venda nao encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.financeiro_pode_ver(v_tenant) THEN
    RAISE EXCEPTION 'sem permissao para editar o pagamento'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Limpar é dizer "ninguém preencheu ainda", e é diferente de "à vista".
  IF p_forma IS NULL THEN
    DELETE FROM public.venda_pagamento WHERE venda_planilha_id = p_venda_planilha_id;
    RETURN jsonb_build_object('ok', true, 'forma', NULL);
  END IF;

  INSERT INTO public.venda_pagamento AS vp
    (venda_planilha_id, tenant_id, forma, parcelas_total, parcelas_pagas, atualizado_por)
  VALUES
    (p_venda_planilha_id, v_tenant, p_forma,
     CASE WHEN p_forma = 'parcelado' THEN p_parcelas_total ELSE NULL END,
     CASE WHEN p_forma = 'parcelado' THEN COALESCE(p_parcelas_pagas, 0) ELSE 0 END,
     auth.uid())
  ON CONFLICT (venda_planilha_id) DO UPDATE
    SET forma          = EXCLUDED.forma,
        parcelas_total = EXCLUDED.parcelas_total,
        parcelas_pagas = EXCLUDED.parcelas_pagas,
        atualizado_em  = now(),
        atualizado_por = auth.uid();

  RETURN jsonb_build_object('ok', true, 'forma', p_forma);
END;
$function$;

COMMENT ON FUNCTION public.venda_pagamento_gravar(uuid, text, integer, integer) IS
  'Grava a forma de pagamento de uma venda da planilha. Forma NULL apaga a linha — "ninguem preencheu" e diferente de "a vista".';

REVOKE ALL ON FUNCTION public.venda_pagamento_gravar(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venda_pagamento_gravar(uuid, text, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
