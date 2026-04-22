-- Tabela para armazenar imagens customizadas das origens de leads por tenant
CREATE TABLE IF NOT EXISTS tenant_source_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, source_id)
);

-- Índice para buscas rápidas por tenant
CREATE INDEX IF NOT EXISTS idx_tenant_source_images_tenant ON tenant_source_images(tenant_id);

-- RLS (Row Level Security)
ALTER TABLE tenant_source_images ENABLE ROW LEVEL SECURITY;

-- Política para leitura - usuários podem ver imagens do próprio tenant
CREATE POLICY "Users can view own tenant source images" ON tenant_source_images
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Política para inserção/atualização - usuários podem gerenciar imagens do próprio tenant
CREATE POLICY "Users can manage own tenant source images" ON tenant_source_images
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );
