-- Limpar dados anteriores de teams
DELETE FROM teams WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832';

-- Inserir as equipes na tabela teams
INSERT INTO teams (id, tenant_id, name, color, description, leader_user_id, created_at, updated_at) VALUES
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Equipe Alpha', '#3B82F6', 'Equipe focada em vendas de alto padrão', NULL, NOW(), NOW()),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Equipe Beta', '#10B981', 'Equipe especializada em imóveis comerciais', NULL, NOW(), NOW()),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Equipe Gamma', '#F59E0B', 'Equipe focada em locações residenciais', NULL, NOW(), NOW());

-- Query para verificar os dados inseridos
SELECT 
  id,
  name,
  color,
  description,
  tenant_id
FROM teams 
WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'
ORDER BY name;
