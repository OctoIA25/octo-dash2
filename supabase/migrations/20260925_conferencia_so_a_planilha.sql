-- ============================================================
-- A Conferência de vendas volta a ser SÓ a planilha — 25/09
--
--   "Nas conferencias de vendas deixe apenas as informacoes da planilha
--    que enviei, consegue?"
--
-- Confirmado com ele em 25/09: é sobre as COLUNAS, não sobre a fonte dos
-- dados. As 37 vendas continuam vindo de `commercial_sales`.
-- ============================================================
--
-- O QUE SAI, E POR QUE ESTAVA AQUI
--
-- As três colunas que saem foram pedidos DELE, do item 5 em 24/09, e as três
-- tinham a mesma propriedade: a planilha não as tem, então eu as DERIVEI do
-- que a Dash já sabia.
--
--   GERENTE      Quem lidera a equipe do corretor daquela venda. Custava três
--                JOINs por linha (tenant_memberships → teams → auth.users) e
--                nascia preenchido em 19 de 37.
--
--   LANÇAMENTO/  Do cadastro de empreendimentos. Era o filtro
--   PRONTO       "Todas / Lançamentos / Prontos", mais um JOIN.
--
--   PAGAMENTO    "à vista" ou "3 de 5 parcelas" — campo da Dash, preenchido
--                à mão. A planilha TEM uma coluna "Pagamento", mas ela traz
--                "Japi" e "R$ 0,00" em 2 de 41 linhas: não é forma de
--                pagamento.
--
-- Junto saem os três contadores ("quantas linhas estão sem cada um"): eles
-- existiam para explicar colunas vazias, e sem as colunas não explicam nada.
--
-- ============================================================
-- O QUE FICA DE PROPÓSITO
--
-- A tabela `venda_pagamento` e a função `venda_pagamento_gravar` CONTINUAM.
-- Decidido com ele em 25/09: "a tabela de pagamento continua no banco, sem
-- tela — volta com uma linha quando você quiser". Apagar a tabela levaria
-- junto o que alguém já tenha preenchido, e recriá-la depois é mais caro que
-- deixá-la quieta. O que sai é a LEITURA dela por esta função.
--
-- O filtro por CORRETOR fica: o corretor é coluna da planilha, e filtrar por
-- uma coluna que existe não acrescenta informação nenhuma à tela.
-- ============================================================

-- A assinatura muda (o `p_tipo` sai), então é DROP e CREATE — `CREATE OR
-- REPLACE` com outra lista de parâmetros cria uma SEGUNDA função sobrecarregada
-- e o PostgREST passaria a escolher entre as duas por quantidade de argumentos.
DROP FUNCTION IF EXISTS public.vendas_planilha_conferencia(uuid, date, date, text, text);

CREATE OR REPLACE FUNCTION public.vendas_planilha_conferencia(
  p_tenant_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
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

  WITH linhas AS (
    SELECT
      cs.id,
      -- ============================================================
      -- AS COLUNAS DA PLANILHA DO DRIVE, na ordem dela, e só elas.
      --
      -- Cabeçalhos do arquivo que ele mandou, lidos em 24/09:
      --   Empreendimento · Quadra · Unidade · Origem · Área M² · R$ M² ·
      --   Total Unidade · Total (-3%) · Comissão Total · Cliente · Corretor ·
      --   Tipo · 20% · 40% · 45% · 50% · Team Leader · Pagamento ·
      --   Comissão Imobiliária · Data de Assinatura · Data de recebimento ·
      --   Status recebimento
      -- ============================================================
      cs.empreendimento,
      -- Quadra e unidade juntas: é o que identifica a unidade vendida, e são
      -- duas colunas de um caractere cada na planilha.
      NULLIF(btrim(COALESCE(cs.quadra, '') || CASE WHEN COALESCE(cs.unidade,'') <> ''
                                                   THEN ' · ' || cs.unidade ELSE '' END), '') AS unidade_codigo,
      cs.origem,
      cs.area_m2,
      cs.valor_m2,
      cs.total_unidade,          -- "Total Unidade"
      cs.valor_vgv,              -- "Total (-3%)"
      cs.comissao_total_venda,   -- "Comissão Total"
      cs.cliente_nome,
      cs.corretor_nome,
      cs.tipo AS nivel_corretor, -- "Tipo": o nível do corretor (PL, Tropa, TL…)
      -- Os quatro percentuais viram um número só: cada venda usa UM deles e os
      -- outros três ficam vazios. Quatro colunas quase sempre em branco são
      -- ruído numa tabela já larga.
      COALESCE(cs.repasse_20,0) + COALESCE(cs.repasse_40,0)
        + COALESCE(cs.repasse_45,0) + COALESCE(cs.repasse_50,0) AS repasse_corretor,
      cs.team_leader_valor,      -- "Team Leader": é VALOR, não nome
      -- "Comissão Imobiliária" — o que sobra para a casa.
      --
      -- CALCULADA, e não lida de `valor_conta_japi`: essa coluna está ZERADA
      -- na importação, e a planilha traz o valor nas 41 linhas. Conferido numa
      -- linha da Lotus em 24/09: comissão 23.860,37 menos corretor 9.544,15
      -- menos Team Leader 4.772,07 dá 9.544,15 — exatamente o que a planilha
      -- mostra. É a mesma conta que ele definiu para a "Líquida".
      COALESCE(cs.comissao_total_venda,0)
        - (COALESCE(cs.repasse_20,0) + COALESCE(cs.repasse_40,0)
           + COALESCE(cs.repasse_45,0) + COALESCE(cs.repasse_50,0))
        - COALESCE(cs.team_leader_valor,0) AS comissao_imobiliaria,
      cs.data_assinatura,
      cs.data_recebimento,
      -- "Status recebimento" é TEXTO LIVRE: "ok", "ver na Caixa", "pagou mais
      -- 252 em 14/03". Não é uma lista de estados, e virar selo obrigaria a
      -- inventar categorias que ninguém combinou.
      cs.observacoes AS status_recebimento
    FROM public.commercial_sales cs
   WHERE cs.tenant_id = p_tenant_id
     AND cs.is_active
     AND (p_de  IS NULL OR cs.data_assinatura >= p_de)
     AND (p_ate IS NULL OR cs.data_assinatura <= p_ate)
     AND (p_corretor IS NULL
          OR public.normalizar_texto(cs.corretor_nome) = public.normalizar_texto(p_corretor))
  )
  SELECT jsonb_build_object(
    'linhas', COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.data_assinatura DESC NULLS LAST), '[]'::jsonb),
    'total_linhas', count(*),
    'total_vgv',     COALESCE(sum(l.valor_vgv), 0),
    'total_comissao',COALESCE(sum(l.comissao_total_venda), 0),
    'total_imobiliaria', COALESCE(sum(l.comissao_imobiliaria), 0),
    'total_recebido', COALESCE(sum(l.comissao_total_venda) FILTER (WHERE l.data_recebimento IS NOT NULL), 0)
  ) INTO v_resultado
  FROM linhas l;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text) IS
  'A planilha comercial na Conferencia de vendas: SO as colunas do arquivo do Drive, na ordem dele. Gerente, tipo do negocio e forma de pagamento sairam em 25/09 a pedido do chefe -- nenhum dos tres existe na planilha.';

-- `pg_default_acl` concede tudo a `anon` em relacao nova, e funcao recriada
-- nasce com EXECUTE para PUBLIC. Sem estas duas linhas a conferencia de vendas
-- ficaria aberta a chave do navegador, sem login.
REVOKE ALL ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text) TO authenticated, service_role;

-- O PostgREST guarda a assinatura das funcoes em cache. Sem isto, a chamada
-- nova bate na assinatura antiga e volta "function not found" -- em silencio,
-- como uma tela vazia.
NOTIFY pgrst, 'reload schema';
