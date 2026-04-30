-- Inserir leads de teste para calcular tempo médio por equipe
-- Tenant ID: e2d9bca4-3ce3-4733-b3ea-ed65ce09c832

INSERT INTO leads (
  id, 
  tenant_id, 
  name,
  phone,
  email,
  source,
  status,
  assigned_agent_name, 
  created_at, 
  assigned_at, 
  final_sale_value,
  archived_at
) VALUES 
-- Leads da Equipe Alpha
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead João Alpha', '11998887766', 'joao@alpha.com', 'Site', 'Novos Leads', 'João Alpha', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '15 minutes', 500000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Maria Alpha', '11997776655', 'maria@alpha.com', 'Instagram', 'Novos Leads', 'Maria Alpha', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '25 minutes', 750000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Pedro Alpha', '11996655444', 'pedro@alpha.com', 'Facebook', 'Novos Leads', 'Pedro Alpha', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '5 minutes', 300000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Ana Alpha', '11995544333', 'ana@alpha.com', 'WhatsApp', 'Novos Leads', 'Ana Alpha', NOW() - INTERVAL '60 minutes', NOW() - INTERVAL '35 minutes', 1200000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Carlos Alpha', '11994433222', 'carlos@alpha.com', 'Site', 'Novos Leads', 'Carlos Alpha', NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '2 minutes', 450000.00, NULL),

-- Leads da Equipe Beta
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Roberto Beta', '11993322111', 'roberto@beta.com', 'Email', 'Novos Leads', 'Roberto Beta', NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '10 minutes', 800000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Fernanda Beta', '11992211000', 'fernanda@beta.com', 'Site', 'Novos Leads', 'Fernanda Beta', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '20 minutes', 600000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Lucas Beta', '11991100999', 'lucas@beta.com', 'Instagram', 'Novos Leads', 'Lucas Beta', NOW() - INTERVAL '35 minutes', NOW() - INTERVAL '18 minutes', 950000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Juliana Beta', '11990099888', 'juliana@beta.com', 'Facebook', 'Novos Leads', 'Juliana Beta', NOW() - INTERVAL '50 minutes', NOW() - INTERVAL '30 minutes', 400000.00, NULL),

-- Leads da Equipe Gamma
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Marcos Gamma', '11989988777', 'marcos@gamma.com', 'WhatsApp', 'Novos Leads', 'Marcos Gamma', NOW() - INTERVAL '55 minutes', NOW() - INTERVAL '40 minutes', 1100000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Sofia Gamma', '11988877666', 'sofia@gamma.com', 'Site', 'Novos Leads', 'Sofia Gamma', NOW() - INTERVAL '28 minutes', NOW() - INTERVAL '8 minutes', 350000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Tiago Gamma', '11987766555', 'tiago@gamma.com', 'Email', 'Novos Leads', 'Tiago Gamma', NOW() - INTERVAL '42 minutes', NOW() - INTERVAL '22 minutes', 700000.00, NULL),

-- Leads sem equipe específica (Equipe Geral)
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead José Silva', '11986655444', 'jose@geral.com', 'Site', 'Novos Leads', 'José Silva', NOW() - INTERVAL '38 minutes', NOW() - INTERVAL '15 minutes', 550000.00, NULL),
(gen_random_uuid(), 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832', 'Lead Maria Santos', '11985544333', 'maria@geral.com', 'Instagram', 'Novos Leads', 'Maria Santos', NOW() - INTERVAL '22 minutes', NOW() - INTERVAL '7 minutes', 420000.00, NULL);

-- Query para verificar os leads inseridos
SELECT 
  assigned_agent_name,
  created_at,
  assigned_at,
  EXTRACT(EPOCH FROM (assigned_at - created_at))/60 as tempo_resposta_minutos,
  status,
  final_sale_value
FROM leads 
WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832'
ORDER BY assigned_agent_name;
