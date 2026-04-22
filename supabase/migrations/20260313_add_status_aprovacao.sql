-- Migration: Adicionar status de aprovação para imóveis e condomínios
-- Data: 2026-03-13
-- Descrição: Sistema de aprovação onde apenas Admins podem aprovar imóveis e condomínios

-- ===========================================
-- IMOVEIS_LOCAIS - Status de Aprovação
-- ===========================================

-- Adicionar coluna de status de aprovação
ALTER TABLE imoveis_locais 
ADD COLUMN IF NOT EXISTS status_aprovacao TEXT DEFAULT 'aguardando' 
CHECK (status_aprovacao IN ('aprovado', 'nao_aprovado', 'aguardando'));

-- Adicionar coluna para registrar quem aprovou
ALTER TABLE imoveis_locais 
ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES auth.users(id);

-- Adicionar coluna para data de aprovação
ALTER TABLE imoveis_locais 
ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP WITH TIME ZONE;

-- Adicionar coluna para descrição/motivo da aprovação ou reprovação
ALTER TABLE imoveis_locais 
ADD COLUMN IF NOT EXISTS motivo_aprovacao TEXT;

-- Índice para filtrar por status de aprovação
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_status_aprovacao ON imoveis_locais(status_aprovacao);

-- ===========================================
-- CONDOMINIOS - Status de Aprovação  
-- ===========================================

-- Adicionar coluna de status de aprovação
ALTER TABLE condominios 
ADD COLUMN IF NOT EXISTS status_aprovacao TEXT DEFAULT 'aguardando'
CHECK (status_aprovacao IN ('aprovado', 'nao_aprovado', 'aguardando'));

-- Adicionar coluna para registrar quem aprovou
ALTER TABLE condominios 
ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES auth.users(id);

-- Adicionar coluna para data de aprovação
ALTER TABLE condominios 
ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP WITH TIME ZONE;

-- Adicionar coluna para descrição/motivo da aprovação ou reprovação
ALTER TABLE condominios 
ADD COLUMN IF NOT EXISTS motivo_aprovacao TEXT;

-- Índice para filtrar por status de aprovação
CREATE INDEX IF NOT EXISTS idx_condominios_status_aprovacao ON condominios(status_aprovacao);

-- ===========================================
-- COMENTÁRIOS
-- ===========================================
COMMENT ON COLUMN imoveis_locais.status_aprovacao IS 'Status de aprovação: aguardando, aprovado, nao_aprovado';
COMMENT ON COLUMN imoveis_locais.aprovado_por IS 'ID do admin que aprovou/rejeitou o imóvel';
COMMENT ON COLUMN imoveis_locais.aprovado_em IS 'Data/hora da aprovação/rejeição';

COMMENT ON COLUMN condominios.status_aprovacao IS 'Status de aprovação: aguardando, aprovado, nao_aprovado';
COMMENT ON COLUMN condominios.aprovado_por IS 'ID do admin que aprovou/rejeitou o condomínio';
COMMENT ON COLUMN condominios.aprovado_em IS 'Data/hora da aprovação/rejeição';
