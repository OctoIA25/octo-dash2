-- Migration: Adicionar campo de metragens aos condomínios
-- Data: 2026-03-13
-- Descrição: Permite cadastrar múltiplas metragens disponíveis em cada condomínio
--            Cada imóvel poderá selecionar uma metragem específica do condomínio

-- ===========================================
-- CONDOMINIOS - Metragens Disponíveis
-- ===========================================

-- Adicionar coluna de metragens como JSONB (array de números)
ALTER TABLE condominios 
ADD COLUMN IF NOT EXISTS metragens_disponiveis JSONB DEFAULT '[]'::jsonb;

-- Comentário para documentação
COMMENT ON COLUMN condominios.metragens_disponiveis IS 'Array de metragens (m²) disponíveis no condomínio. Ex: [45, 60, 75, 120]';

-- Criar índice GIN para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_condominios_metragens ON condominios USING gin(metragens_disponiveis);

-- ===========================================
-- IMOVEIS_LOCAIS - Metragem Selecionada
-- ===========================================

-- Adicionar coluna para armazenar a metragem específica do imóvel
ALTER TABLE imoveis_locais 
ADD COLUMN IF NOT EXISTS metragem_m2 NUMERIC;

-- Adicionar coluna para vincular ao condomínio (se ainda não existir)
ALTER TABLE imoveis_locais 
ADD COLUMN IF NOT EXISTS condominio_id UUID REFERENCES condominios(id) ON DELETE SET NULL;

-- Comentários
COMMENT ON COLUMN imoveis_locais.metragem_m2 IS 'Metragem específica do imóvel em m² (selecionada das opções do condomínio)';
COMMENT ON COLUMN imoveis_locais.condominio_id IS 'ID do condomínio ao qual o imóvel pertence';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_condominio ON imoveis_locais(condominio_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_locais_metragem ON imoveis_locais(metragem_m2);
