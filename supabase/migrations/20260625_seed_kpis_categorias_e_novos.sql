-- ============================================================
-- MIGRATION (dados): categorias dos KPIs nativos + novos KPIs
-- (Comercial, Marketing, Operação, Equipe). Idempotente.
-- Não altera estrutura — dashboard_kpis.category_id já existe.
-- ============================================================

-- 1) Reclassifica os 6 nativos na categoria correta (decisão fixada 2026-06-24).
UPDATE public.dashboard_kpis SET category_id = 'marketing' WHERE metric_key = 'totalLeads';
UPDATE public.dashboard_kpis SET category_id = 'comercial' WHERE metric_key IN ('vendas','valorVendas');
UPDATE public.dashboard_kpis SET category_id = 'operacao'  WHERE metric_key IN ('imoveisAtivos','tempoMedioResposta','taxaAtendimento');

-- Marca os hero nativos (destaque no topo de cada seção).
UPDATE public.dashboard_kpis SET is_featured = true
  WHERE metric_key IN ('totalLeads','vendas','valorVendas','imoveisAtivos');

-- 2) Novos KPIs CRM (automáticos). is_system=false (gestor pode ocultar/excluir).
INSERT INTO public.dashboard_kpis
  (tenant_id, name, description, category_id, unit, source, metric_key, is_system, is_featured, display_order)
SELECT te.id, v.name, '', v.cat, v.unit, 'crm', v.metric_key, false, v.featured, v.ord
FROM public.tenants te
CROSS JOIN (VALUES
  -- Comercial
  ('VGV Gerado no Mês',          'comercial', 'currency', 'vgv',                      true,  10),
  ('VGC Gerado no Mês',          'comercial', 'currency', 'vgc',                      false, 11),
  ('Ticket Médio por Venda',     'comercial', 'currency', 'ticketMedio',             true,  12),
  -- Operação
  ('Captação Exclusiva',         'operacao',  'count',    'captacaoExclusiva',        true,  20),
  ('Captação Sem Exclusividade', 'operacao',  'count',    'captacaoSemExclusividade', false, 21),
  ('Conversão de Leads p/ Visitas','operacao','percent',  'conversaoVisita',          true,  22),
  -- Equipe
  ('Tamanho da Equipe',          'equipe',    'count',    'tamanhoEquipe',            true,  30),
  ('Vendas por Corretor',        'equipe',    'count',    'vendasPorCorretor',        true,  31)
) AS v(name, cat, unit, metric_key, featured, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_kpis dk WHERE dk.tenant_id = te.id AND dk.metric_key = v.metric_key
);

-- 3) Novos KPIs MANUAIS (sem dado no banco hoje). metric_key NULL (constraint exige).
--    Idempotência por (tenant_id, name) já que manual não tem metric_key único.
INSERT INTO public.dashboard_kpis
  (tenant_id, name, description, category_id, unit, source, metric_key, is_system, is_featured, display_order)
SELECT te.id, v.name, v.descr, v.cat, v.unit, 'manual', NULL, false, v.featured, v.ord
FROM public.tenants te
CROSS JOIN (VALUES
  -- Marketing (insumos + derivados manuais)
  ('Investimento em Mídias', 'Valor investido em mídia paga no mês.',        'marketing', 'currency', true,  40),
  ('CAC',                    'Custo de aquisição por cliente.',              'marketing', 'currency', true,  41),
  ('ROAS',                   'Retorno sobre o investimento em anúncios.',    'marketing', 'count',    true,  42),
  ('Impressões',             'Total de impressões das campanhas.',           'marketing', 'count',    false, 43),
  ('Alcance',                'Pessoas únicas alcançadas.',                   'marketing', 'count',    false, 44),
  ('CPM',                    'Custo por mil impressões.',                    'marketing', 'currency', false, 45),
  ('CPA',                    'Custo por aquisição/lead.',                    'marketing', 'currency', false, 46),
  -- Operação (avaliações online)
  ('Avaliação Média Online', 'Nota média (ex.: Google) no período.',         'operacao',  'count',    false, 23),
  ('Volume de Avaliações',   'Quantidade de avaliações recebidas.',          'operacao',  'count',    false, 24),
  -- Equipe
  ('Rotatividade de Corretores','Churn de corretores no mês.',               'equipe',    'percent',  false, 32),
  ('eNPS',                   'Employee Net Promoter Score da equipe.',       'equipe',    'count',    false, 33)
) AS v(name, descr, cat, unit, featured, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_kpis dk WHERE dk.tenant_id = te.id AND dk.name = v.name
);
