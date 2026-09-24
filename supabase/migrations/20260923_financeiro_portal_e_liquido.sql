-- ============================================================
-- A tela "A receber" passa a dizer de onde veio o lead, e quanto sobra
-- (pedidos 1, 3 e 4 do chefe, 23/09/2026)
--
-- Os pedidos, nas palavras dele:
--
--   "Origem deve mostrar se veio do OLX, Zap, etc"
--   "Valor é o valor total da comissão, e aí adicionar aquele de líquido aqui também"
--   "tem o campo de Lançamentos lá embaixo, mas colocar de terceiros também"
--
-- ============================================================
-- UMA ARMADILHA DE NOME, QUE VALE REGISTRAR
-- ============================================================
--
-- A tela já tem uma coluna chamada **Origem**, e ela NÃO é a origem do lead:
-- é de onde o lançamento financeiro nasceu — `venda`, `repasse`, `imposto`,
-- `midia` ou `manual`. É ela que separa receita de custo no DRE.
--
-- Trocar o significado dessa coluna por "veio do ZAP" custaria a distinção
-- entre comissão e imposto. Então a origem do lead entra ao lado, com nome
-- próprio: `portal`. Duas perguntas diferentes, duas colunas.
--
-- ============================================================
-- DE ONDE CADA CAMPO VEM
-- ============================================================
--
-- `lancamentos_financeiros.origem_id` aponta para lugares diferentes conforme
-- a origem — e isso não está escrito em nenhuma restrição, só nos gatilhos:
--
--   origem = 'venda'    → vendas.id          (a comissão)
--   origem = 'imposto'  → vendas.id          (o imposto daquela venda)
--   origem = 'repasse'  → venda_repasses.id  (o que vai para o corretor)
--   origem = 'midia'    → campanha
--   origem = 'manual'   → nada
--
-- Daí sai a venda; da venda sai `tipo` (lançamento ou terceiros),
-- `comissao_liquida` e o `lead_id`; e do lead sai `source`, que é onde a
-- integração escreve "ZAP Imóveis", "Instagram", "Imovelweb".
--
-- `leads.source` é TEXTO LIVRE — não há coluna de origem de verdade no lead.
-- Medido em produção em 23/09, na Lotus: ZAP Imóveis, Instagram, Facebook,
-- Imovelweb e Santa Angela convivem ali com "Excel" e "Manual", que são
-- método de entrada e não origem. Mostrar o texto cru é honesto: é o que
-- existe. Normalizar fica para quando o cadastro de origens (P0.4) estiver
-- povoado — e aí esta função passa a ler o de-para, num lugar só.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.financeiro_lancamentos(
  p_tenant_id     uuid,
  p_de            date DEFAULT NULL,
  p_ate           date DEFAULT NULL,
  p_tipo          text DEFAULT NULL,
  p_status        text DEFAULT NULL,
  p_conta_id      uuid DEFAULT NULL,
  p_centro_custo  text DEFAULT NULL,
  p_por           text DEFAULT 'vencimento'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
  v_por text := CASE WHEN p_por = 'competencia' THEN 'competencia' ELSE 'vencimento' END;
  v_linhas jsonb;
  v_totais jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  WITH filtrados AS (
    SELECT l.*, c.codigo AS conta_codigo, c.nome AS conta_nome, c.tipo AS conta_tipo,
           -- A venda por trás do lançamento, seja qual for o caminho.
           CASE l.origem
             WHEN 'venda'   THEN l.origem_id
             WHEN 'imposto' THEN l.origem_id
             WHEN 'repasse' THEN (SELECT r.venda_id FROM venda_repasses r WHERE r.id = l.origem_id)
           END AS venda_id
      FROM lancamentos_financeiros l
      LEFT JOIN plano_contas c ON c.id = l.conta_id
     WHERE l.tenant_id = p_tenant_id
       AND l.status <> 'cancelado'
       AND CASE
             WHEN v_por = 'competencia' THEN l.competencia BETWEEN v_de AND v_ate
             ELSE COALESCE(l.vencimento, l.competencia) BETWEEN v_de AND v_ate
           END
       AND (p_tipo IS NULL OR p_tipo = '' OR l.tipo = p_tipo)
       AND (p_status IS NULL OR p_status = '' OR l.status = p_status)
       AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
       AND (p_centro_custo IS NULL OR p_centro_custo = '' OR l.centro_custo = p_centro_custo)
  ), comVenda AS (
    -- O LEFT JOIN é obrigatório e não é zelo: lançamento manual, de mídia, e
    -- qualquer um cuja venda tenha sido apagada não têm venda. Um INNER JOIN
    -- faria essas linhas SUMIREM da lista de contas a receber — dinheiro
    -- desaparecendo da tela sem erro nenhum.
    SELECT f.*,
           v.tipo AS venda_tipo,
           v.comissao_liquida,
           NULLIF(btrim(le.source), '') AS portal
      FROM filtrados f
      LEFT JOIN vendas v ON v.id = f.venda_id AND v.tenant_id = p_tenant_id
      LEFT JOIN leads  le ON le.id = v.lead_id AND le.tenant_id = p_tenant_id
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'tipo', tipo, 'descricao', descricao, 'valor', valor,
      'competencia', competencia, 'vencimento', vencimento,
      'pago_em', pago_em, 'valor_pago', valor_pago, 'status', status,
      'origem', origem, 'origem_id', origem_id, 'centro_custo', centro_custo,
      'anexo', anexo, 'observacao', observacao,
      'conta_id', conta_id, 'conta_codigo', conta_codigo, 'conta_nome', conta_nome,
      'vencido', (status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje),
      'dias_de_atraso', CASE WHEN status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje
                             THEN (v_hoje - vencimento) END,
      -- Os três campos novos.
      'venda_tipo', venda_tipo,
      'portal', portal,
      -- Só na linha da COMISSÃO. O "líquido" de uma linha de imposto ou de
      -- repasse não quer dizer nada — e um número sem significado numa coluna
      -- de dinheiro é pior que uma célula vazia.
      -- NULO quando a folha de repasse ainda não foi calculada: sem os
      -- repasses não há o que subtrair, e a tela mostra "—".
      'valor_liquido', CASE WHEN origem = 'venda' THEN comissao_liquida END
    ) ORDER BY COALESCE(vencimento, competencia), valor DESC) FROM comVenda), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'lancamentos', count(*),
      'a_receber', round(COALESCE(sum(valor) FILTER (WHERE tipo = 'receber' AND status = 'aberto'), 0), 2),
      'a_pagar', round(COALESCE(sum(valor) FILTER (WHERE tipo = 'pagar' AND status = 'aberto'), 0), 2),
      'recebido', round(COALESCE(sum(COALESCE(valor_pago, valor)) FILTER (WHERE tipo = 'receber' AND status = 'baixado'), 0), 2),
      'pago', round(COALESCE(sum(COALESCE(valor_pago, valor)) FILTER (WHERE tipo = 'pagar' AND status = 'baixado'), 0), 2),
      'vencidos', count(*) FILTER (WHERE status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje),
      'valor_vencido', round(COALESCE(sum(valor) FILTER (WHERE status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje), 0), 2),
      'sem_conta', count(*) FILTER (WHERE conta_id IS NULL),

      -- O líquido do que se tem a receber. Só das linhas de comissão, pelo
      -- mesmo motivo de cima — somar o "líquido" de uma linha de imposto
      -- contaria duas vezes.
      --
      -- ATENÇÃO, 24/09: `comissao_liquida` deixou de ser "menos o imposto" e
      -- passou a ser "menos o corretor e o gerente", por decisão do chefe
      -- (ver 20260924_liquida_e_o_que_sobra_para_a_casa). Venda sem folha
      -- calculada tem a coluna NULA, e `sum` ignora nulo — então este total é
      -- só das vendas com folha. A tela diz quantas ficaram de fora.
      'liquido', round(COALESCE(sum(comissao_liquida)
        FILTER (WHERE origem = 'venda' AND tipo = 'receber'), 0), 2),

      -- A quebra que o chefe pediu ("colocar de terceiros também"). Em VALOR,
      -- e não em contagem: o card antigo escrito "Lançamentos" é a quantidade
      -- de linhas da lista, não de empreendimentos — e foi ele que deu a
      -- entender que já havia uma separação por tipo de venda aqui.
      'de_lancamento', round(COALESCE(sum(valor)
        FILTER (WHERE tipo = 'receber' AND venda_tipo = 'lancamento'), 0), 2),
      'de_terceiros', round(COALESCE(sum(valor)
        FILTER (WHERE tipo = 'receber' AND venda_tipo = 'terceiros'), 0), 2),
      -- O que não veio de venda nenhuma (manual, mídia, venda apagada). Sai
      -- separado para que lançamento + terceiros + sem_venda feche com o
      -- total: três números que não somam é como se descobre que um sumiu.
      'sem_venda', round(COALESCE(sum(valor)
        FILTER (WHERE tipo = 'receber' AND venda_tipo IS NULL), 0), 2)
    ) FROM comVenda)
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'por', v_por,
    'linhas', v_linhas, 'totais', v_totais
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
