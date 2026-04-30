-- Inserir dados de teste para métricas de equipe
-- Tenant ID de exemplo: e2d9bca4-3ce3-4733-b3ea-ed65ce09c832

-- Primeiro, inserir as equipes na tabela teams
INSERT INTO teams (id, tenant_id, name, color, description, leader_user_id, created_at, updated_at) VALUES
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Equipe Alpha', '#3B82F6', 'Equipe focada em vendas de alto padrão', NULL, NOW(), NOW()),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Equipe Beta', '#10B981', 'Equipe especializada em imóveis comerciais', NULL, NOW(), NOW()),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Equipe Gamma', '#F59E0B', 'Equipe focada em locações residenciais', NULL, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Agora inserir as métricas usando os IDs das equipes
INSERT INTO team_metrics (
  tenant_id, equipe_id, nome_equipe, ano, mes,
  total_corretores, vendas_criadas, vendas_assinadas, valor_total_vendas,
  total_leads_recebidos, total_leads_interagidos, taxa_interacao_geral,
  tempo_medio_resposta_equipe, imoveis_ativos, imoveis_exclusivos,
  taxa_conversao_visitas, taxa_conversao_vendas, imoveis_ativados_mes
) VALUES 
-- Janeiro 2026 - Equipe Alpha
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Alpha'),
  'Equipe Alpha',
  2026,
  1,
  5, -- total_corretores
  12, -- vendas_criadas
  8, -- vendas_assinadas
  2500000.00, -- valor_total_vendas (R$ 2.5M)
  45, -- total_leads_recebidos
  38, -- total_leads_interagidos
  84.44, -- taxa_interacao_geral (38/45 * 100)
  15, -- tempo_medio_resposta_equipe (minutos)
  120, -- imoveis_ativos
  45, -- imoveis_exclusivos
  18.50, -- taxa_conversao_visitas
  17.78, -- taxa_conversao_vendas (8/45 * 100)
  8 -- imoveis_ativados_mes
),
-- Fevereiro 2026 - Equipe Alpha
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Alpha'),
  'Equipe Alpha',
  2026,
  2,
  5,
  15,
  10,
  3200000.00, -- R$ 3.2M
  52,
  45,
  86.54,
  12,
  125,
  48,
  20.00,
  19.23,
  10
),
-- Março 2026 - Equipe Alpha
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Alpha'),
  'Equipe Alpha',
  2026,
  3,
  6,
  18,
  12,
  4100000.00, -- R$ 4.1M
  58,
  50,
  86.21,
  10,
  130,
  52,
  22.50,
  20.69,
  12
),
-- Equipe Beta - Janeiro 2026
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Beta'),
  'Equipe Beta',
  2026,
  1,
  4,
  10,
  6,
  1800000.00, -- R$ 1.8M
  35,
  28,
  80.00,
  18,
  95,
  32,
  15.80,
  17.14,
  6
),
-- Equipe Beta - Fevereiro 2026
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Beta'),
  'Equipe Beta',
  2026,
  2,
  4,
  13,
  8,
  2400000.00, -- R$ 2.4M
  42,
  35,
  83.33,
  15,
  102,
  35,
  18.20,
  19.05,
  8
),
-- Equipe Beta - Março 2026
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Beta'),
  'Equipe Beta',
  2026,
  3,
  4,
  16,
  11,
  3500000.00, -- R$ 3.5M
  48,
  41,
  85.42,
  13,
  108,
  38,
  21.00,
  22.92,
  9
),
-- Equipe Gamma - Janeiro 2026
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Gamma'),
  'Equipe Gamma',
  2026,
  1,
  3,
  8,
  5,
  1200000.00, -- R$ 1.2M
  28,
  22,
  78.57,
  20,
  75,
  25,
  14.30,
  17.86,
  4
),
-- Equipe Gamma - Fevereiro 2026
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Gamma'),
  'Equipe Gamma',
  2026,
  2,
  3,
  11,
  7,
  1900000.00, -- R$ 1.9M
  33,
  27,
  81.82,
  17,
  82,
  28,
  16.80,
  21.21,
  6
),
-- Equipe Gamma - Março 2026
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Gamma'),
  'Equipe Gamma',
  2026,
  3,
  3,
  14,
  9,
  2800000.00, -- R$ 2.8M
  40,
  34,
  85.00,
  14,
  88,
  31,
  19.50,
  22.50,
  7
),
-- Abril 2026 - Equipe Alpha (mês atual)
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Alpha'),
  'Equipe Alpha',
  2026,
  4,
  6,
  20,
  14,
  4800000.00, -- R$ 4.8M
  62,
  54,
  87.10,
  12,
  135,
  55,
  23.20,
  22.58,
  13
),
-- Abril 2026 - Equipe Beta
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Beta'),
  'Equipe Beta',
  2026,
  4,
  5,
  18,
  13,
  4100000.00, -- R$ 4.1M
  55,
  48,
  87.27,
  11,
  112,
  40,
  21.80,
  23.64,
  11
),
-- Abril 2026 - Equipe Gamma
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Gamma'),
  'Equipe Gamma',
  2026,
  4,
  4,
  16,
  11,
  3200000.00, -- R$ 3.2M
  45,
  39,
  86.67,
  13,
  92,
  34,
  20.10,
  24.44,
  8
)
ON CONFLICT (tenant_id, equipe_id, ano, mes) DO NOTHING;

-- Adicionar dados de Dezembro 2025 para contexto histórico
INSERT INTO team_metrics (
  tenant_id, equipe_id, nome_equipe, ano, mes,
  total_corretores, vendas_criadas, vendas_assinadas, valor_total_vendas,
  total_leads_recebidos, total_leads_interagidos, taxa_interacao_geral,
  tempo_medio_resposta_equipe, imoveis_ativos, imoveis_exclusivos,
  taxa_conversao_visitas, taxa_conversao_vendas, imoveis_ativados_mes
) VALUES 
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Alpha'),
  'Equipe Alpha',
  2025,
  12,
  5,
  10,
  6,
  2100000.00, -- R$ 2.1M
  40,
  32,
  80.00,
  16,
  115,
  42,
  17.20,
  15.00,
  7
),
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Beta'),
  'Equipe Beta',
  2025,
  12,
  4,
  8,
  5,
  1500000.00, -- R$ 1.5M
  30,
  24,
  80.00,
  19,
  90,
  30,
  14.80,
  16.67,
  5
),
(
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832',
  (SELECT id FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832' AND name = 'Equipe Gamma'),
  'Equipe Gamma',
  2025,
  12,
  3,
  6,
  4,
  950000.00, -- R$ 950K
  25,
  19,
  76.00,
  22,
  70,
  23,
  13.50,
  16.00,
  3
)
ON CONFLICT (tenant_id, equipe_id, ano, mes) DO NOTHING;

-- Query para verificar os dados inseridos
SELECT 
  equipe_id,
  nome_equipe,
  ano,
  mes,
  total_corretores,
  vendas_assinadas,
  valor_total_vendas,
  total_leads_recebidos,
  total_leads_interagidos,
  ROUND(taxa_interacao_geral, 2) as taxa_interacao_pct,
  ROUND(taxa_conversao_vendas, 2) as taxa_conversao_pct
FROM team_metrics 
WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'
ORDER BY equipe_id, ano, mes;
