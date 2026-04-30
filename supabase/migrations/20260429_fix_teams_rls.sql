-- Adicionar políticas RLS para a tabela teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura de equipes por tenant
CREATE POLICY "Users can view their tenant's teams" ON teams
  FOR SELECT USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Política para permitir inserção de equipes
CREATE POLICY "Users can insert their tenant's teams" ON teams
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Política para permitir atualização de equipes
CREATE POLICY "Users can update their tenant's teams" ON teams
  FOR UPDATE USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Política para permitir exclusão de equipes
CREATE POLICY "Users can delete their tenant's teams" ON teams
  FOR DELETE USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);
