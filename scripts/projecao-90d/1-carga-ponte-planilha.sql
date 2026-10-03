-- ============================================================
-- Carga da ponte planilha → venda (Lotus). ESPERA OK EXPLÍCITO.
-- Depois da migration 20261027. Roda como postgres (auth.uid() nulo = servidor).
--
-- O que muda, medido em produção em 03/10 (só leitura): das 37 linhas ativas,
-- 31 têm comissão; 29 ligam nas vendas do CRM (mesmo VGV, data e comissão),
-- 2 viram venda e nenhuma fica sem par. As 6 restantes (parcelas soltas,
-- comissão zero) ficam de fora. As 2 novas, as duas já recebidas:
--   30/01 · Angelo Finati · R$ 66.250 · a prazo, 6 parcelas, recebida em 31/07
--   29/04 · Ana Carolina de Figueiredo · R$ 9.870 (PARCERIA) · recebida em 30/04
-- Esperado em `resultado`: {"ligada": 29, "criada": 2, "ignorada": 6}.
-- ⚠️ O recebido e o DRE de jan e abr ganham esses dois valores, e o funil conta
-- uma venda a mais em cada um desses meses.
-- ============================================================
\set lotus '65c69875-dc83-4062-90f6-6f6adc30df26'
BEGIN;
SELECT count(*) AS vendas_antes FROM vendas WHERE tenant_id = :'lotus';
SELECT public.vendas_ligar_planilha(:'lotus') AS resultado;
SELECT count(*) AS vendas_depois,
       count(*) FILTER (WHERE planilha_id IS NOT NULL) AS ligadas
  FROM vendas WHERE tenant_id = :'lotus';
SELECT v.data_venda, v.empreendimento, v.comissao_bruta, v.status
  FROM vendas v WHERE v.tenant_id = :'lotus' AND v.proposta_id IS NULL AND v.planilha_id IS NOT NULL;
-- Conferir os números acima contra o comentário do topo. Bateu: COMMIT. Não bateu: ROLLBACK.
ROLLBACK;
