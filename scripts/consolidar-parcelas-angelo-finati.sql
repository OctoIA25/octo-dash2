-- Consolida a venda "Terceiros" (Angelo Finati — permuta + parceria Japi).
--
-- A planilha REPORT 2026 tem 7 linhas para essa venda: 1 com a comissão de
-- R$ 66.250 e 6 de recebimento de parcela (VGV 0, comissão 0, só a data de
-- recebimento muda). O importador não distingue parcela de venda, então o
-- backfill de 01/09 criou 7 propostas — inflando a contagem de vendas e o
-- ticket médio do André Marcondes (11 vendas onde há 5).
--
-- Confirmado pelo Victor em 02/09/2026: é uma venda só.
--
-- Apaga as 6 parcelas e mantém 91305e09-06ab-4a49-9542-fe2a26e2a6e7, a linha
-- que carrega a comissão. `proposal_parties` e `proposal_history` caem por
-- ON DELETE CASCADE (6 partes, 0 históricos).
--
-- VGV e VGC totais NÃO mudam (as 6 são zeradas): seguem 14.457.183,34 e
-- 737.412,68, iguais à planilha. `value` da venda mantida continua 0 de
-- propósito — a planilha deixa "Total (-3%)" vazio nessa linha, e é isso que
-- faz o total do dash bater com o REPORT.
--
-- As 7 linhas seguem intactas em `commercial_sales` (histórico congelado), e o
-- backup local do que foi apagado está em backup-parcelas-angelo.json.

DELETE FROM public.proposals
 WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
   AND id IN (
     '35067508-59c9-4b37-aa71-8b1b9bf44376',
     'bebe61d1-4e57-4f19-9378-3799bf0cd90b',
     'e47ce7f8-721b-41b5-bd94-333b59a6a144',
     'b173ad5e-dcca-4128-b2b5-ab2b1e38e46a',
     'e6b6bca5-9ccc-49df-8f63-ce7fb9021baf',
     'f25afd3d-fd93-4dc6-bd5b-6df773ac8955'
   );

-- Conferência — esperado: 34 vendas, VGV 14457183.34, VGC 737412.68.
SELECT count(*) AS vendas,
       sum(value) AS vgv,
       sum(coalesce(commission_total, 0)) AS vgc
  FROM public.proposals
 WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
   AND stage_id = 'proposta-assinada'
   AND signed_at >= '2026-01-01'
   AND signed_at <  '2027-01-01';
