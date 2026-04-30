-- Criar RPC function para contar leads mensais
CREATE OR REPLACE FUNCTION count_leads_mensal(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_leads INTEGER;
BEGIN
    -- Contar todos os leads do tenant que não estão arquivados
    SELECT COUNT(*) INTO total_leads
    FROM leads
    WHERE tenant_id = p_tenant_id
      AND archived_at IS NULL;
    
    RETURN total_leads;
END;
$$;

-- Criar RLS policy para a function
ALTER FUNCTION count_leads_mensal(p_tenant_id UUID) 
SET SECURITY INVOKER;

-- Grant permissão para executar a função
GRANT EXECUTE ON FUNCTION count_leads_mensal(p_tenant_id UUID) TO authenticated, anon;
