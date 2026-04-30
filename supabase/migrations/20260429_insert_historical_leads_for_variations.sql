-- Insert leads with different dates to enable real percentage variations
-- This creates historical data for the last 3 months to calculate real variations

-- First, get the tenant ID from existing data
DO $$
DECLARE
  v_tenant_id UUID;
  v_tenant_id_2 UUID;
BEGIN
  -- Get tenant IDs from existing data
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  
  -- If no tenant, create one
  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (name, owner_email, owner_name, created_at, updated_at)
    VALUES ('Test Tenant', 'test@example.com', 'Test Owner', NOW(), NOW())
    RETURNING id INTO v_tenant_id;
  END IF;
  
  -- Insert leads for 3 months ago (January 2026) - 8 leads
  INSERT INTO leads (
    tenant_id, 
    name, 
    email, 
    phone, 
    assigned_agent_name, 
    assigned_agent_id,
    created_at, 
    assigned_at,
    final_sale_value,
    archived_at
  )
  SELECT 
    v_tenant_id,
    'Lead Hist ' || i,
    'lead' || i || '@hist.com',
    '119999900' || i,
    CASE WHEN i % 3 = 0 THEN 'João Alpha' 
         WHEN i % 3 = 1 THEN 'Maria Alpha' 
         ELSE 'Ana Alpha' END,
    CASE WHEN i % 3 = 0 THEN 'agent-1' 
         WHEN i % 3 = 1 THEN 'agent-2' 
         ELSE 'agent-3' END,
    (NOW() - INTERVAL '3 months' - INTERVAL '1 day' * i)::timestamp,
    (NOW() - INTERVAL '3 months' - INTERVAL '1 day' * i + INTERVAL '15 minutes')::timestamp,
    CASE WHEN i % 2 = 0 THEN 500000 + (i * 100000) ELSE 0 END,
    NULL
  FROM generate_series(1, 8) AS i;
  
  -- Insert leads for 2 months ago (February 2026) - 12 leads
  INSERT INTO leads (
    tenant_id, 
    name, 
    email, 
    phone, 
    assigned_agent_name, 
    assigned_agent_id,
    created_at, 
    assigned_at,
    final_sale_value,
    archived_at
  )
  SELECT 
    v_tenant_id,
    'Lead Feb ' || i,
    'lead' || i || '@feb.com',
    '119999910' || i,
    CASE WHEN i % 3 = 0 THEN 'Fernanda Beta' 
         WHEN i % 3 = 1 THEN 'Lucas Beta' 
         ELSE 'Juliana Beta' END,
    CASE WHEN i % 3 = 0 THEN 'agent-4' 
         WHEN i % 3 = 1 THEN 'agent-5' 
         ELSE 'agent-6' END,
    (NOW() - INTERVAL '2 months' - INTERVAL '1 day' * i)::timestamp,
    (NOW() - INTERVAL '2 months' - INTERVAL '1 day' * i + INTERVAL '20 minutes')::timestamp,
    CASE WHEN i % 2 = 0 THEN 600000 + (i * 150000) ELSE 0 END,
    NULL
  FROM generate_series(1, 12) AS i;
  
  -- Insert leads for 1 month ago (March 2026) - 15 leads
  INSERT INTO leads (
    tenant_id, 
    name, 
    email, 
    phone, 
    assigned_agent_name, 
    assigned_agent_id,
    created_at, 
    assigned_at,
    final_sale_value,
    archived_at
  )
  SELECT 
    v_tenant_id,
    'Lead Mar ' || i,
    'lead' || i || '@mar.com',
    '119999920' || i,
    CASE WHEN i % 3 = 0 THEN 'Marcos Gamma' 
         WHEN i % 3 = 1 THEN 'Tiago Gamma' 
         ELSE 'Sofia Gamma' END,
    CASE WHEN i % 3 = 0 THEN 'agent-7' 
         WHEN i % 3 = 1 THEN 'agent-8' 
         ELSE 'agent-9' END,
    (NOW() - INTERVAL '1 month' - INTERVAL '1 day' * i)::timestamp,
    (NOW() - INTERVAL '1 month' - INTERVAL '1 day' * i + INTERVAL '18 minutes')::timestamp,
    CASE WHEN i % 2 = 0 THEN 700000 + (i * 200000) ELSE 0 END,
    NULL
  FROM generate_series(1, 15) AS i;
  
  RAISE NOTICE 'Historical leads inserted for variations calculation';
END $$;

-- Update some existing leads to have different dates for better variation
UPDATE leads 
SET created_at = (NOW() - INTERVAL '2 months' - INTERVAL '5 days')::timestamp,
    assigned_at = (NOW() - INTERVAL '2 months' - INTERVAL '5 days' + INTERVAL '20 minutes')::timestamp
WHERE created_at > NOW() - INTERVAL '1 month'
AND random() < 0.3;
