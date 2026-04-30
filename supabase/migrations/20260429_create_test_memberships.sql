-- Criar memberships de teste para relacionar corretores com equipes
-- Tenant ID: e2d9bca4-3ce3-4733-b3ea-ed65ce09c832

-- Criar user_profiles de teste para os corretores
INSERT INTO user_profiles (id, email) VALUES
(gen_random_uuid(), 'joao@alpha.com'),
(gen_random_uuid(), 'maria@alpha.com'),
(gen_random_uuid(), 'pedro@alpha.com'),
(gen_random_uuid(), 'ana@alpha.com'),
(gen_random_uuid(), 'carlos@alpha.com'),
(gen_random_uuid(), 'roberto@beta.com'),
(gen_random_uuid(), 'fernanda@beta.com'),
(gen_random_uuid(), 'lucas@beta.com'),
(gen_random_uuid(), 'juliana@beta.com'),
(gen_random_uuid(), 'marcos@gamma.com'),
(gen_random_uuid(), 'sofia@gamma.com'),
(gen_random_uuid(), 'tiago@gamma.com'),
(gen_random_uuid(), 'jose@geral.com'),
(gen_random_uuid(), 'maria@geral.com');

-- Criar tenant_memberships para relacionar usuários com equipes
INSERT INTO tenant_memberships (user_id, tenant_id, team_id, role, created_at)
SELECT 
  up.id as user_id,
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid as tenant_id,
  t.id as team_id,
  'corretor' as role,
  NOW() as created_at
FROM user_profiles up
CROSS JOIN teams t
WHERE up.email IN ('joao@alpha.com', 'maria@alpha.com', 'pedro@alpha.com', 'ana@alpha.com', 'carlos@alpha.com')
  AND t.name LIKE '%Alpha%' AND t.tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid

UNION ALL

SELECT 
  up.id as user_id,
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid as tenant_id,
  t.id as team_id,
  'corretor' as role,
  NOW() as created_at
FROM user_profiles up
CROSS JOIN teams t
WHERE up.email IN ('roberto@beta.com', 'fernanda@beta.com', 'lucas@beta.com', 'juliana@beta.com')
  AND t.name LIKE '%Beta%' AND t.tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid

UNION ALL

SELECT 
  up.id as user_id,
  'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid as tenant_id,
  t.id as team_id,
  'corretor' as role,
  NOW() as created_at
FROM user_profiles up
CROSS JOIN teams t
WHERE up.email IN ('marcos@gamma.com', 'sofia@gamma.com', 'tiago@gamma.com')
  AND t.name LIKE '%Gamma%' AND t.tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'::uuid

ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- Query para verificar os relacionamentos criados
SELECT 
  up.email,
  up.id as user_id,
  tm.team_id,
  t.name as team_name,
  tm.tenant_id
FROM user_profiles up
LEFT JOIN tenant_memberships tm ON up.id = tm.user_id
LEFT JOIN teams t ON tm.team_id = t.id
WHERE tm.tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'
ORDER BY t.name, up.email;
