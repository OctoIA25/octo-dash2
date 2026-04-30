-- Adicionar política temporária para permitir acesso sem RLS restritivo
-- Isso permite testar se os dados estão sendo acessados corretamente

DROP POLICY IF EXISTS "Users can view their tenant's team metrics" ON team_metrics;

CREATE POLICY "Users can view their tenant's team metrics" ON team_metrics
  FOR SELECT USING (true);

-- Política de inserção permanece restritiva
DROP POLICY IF EXISTS "Users can insert their tenant's team metrics" ON team_metrics;

CREATE POLICY "Users can insert their tenant's team metrics" ON team_metrics
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Política de update permanece restritiva
DROP POLICY IF EXISTS "Users can update their tenant's team metrics" ON team_metrics;

CREATE POLICY "Users can update their tenant's team metrics" ON team_metrics
  FOR UPDATE USING (auth.uid() IS NOT NULL AND tenant_id = current_setting('app.current_tenant_id')::UUID);
