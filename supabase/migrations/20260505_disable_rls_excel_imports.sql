-- Desabilitar RLS para tabela excel_imports
-- Isso permite bypass das policies que usam app.current_tenant_id
-- O filtro por tenant_id é feito no cliente (JavaScript)

ALTER TABLE excel_imports DISABLE ROW LEVEL SECURITY;

-- Remover trigger de atualização (opcional, já que não estamos usando RLS)
DROP TRIGGER IF EXISTS excel_imports_updated_at ON excel_imports;
DROP FUNCTION IF EXISTS update_excel_imports_updated_at();
