-- Deletar leads antigos do tenant para teste
-- Tenant ID: e2d9bca4-3ce3-4733-b3ea-ed65ce09c832

DELETE FROM leads WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832';

-- Query para verificar se foram deletados
SELECT COUNT(*) as total_leads FROM leads WHERE tenant_id = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832';
