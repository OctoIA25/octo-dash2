-- Migration: Adicionar campo fotos na tabela condominios
-- Data: 2026-03-04
-- Descrição: Adiciona campo JSONB para armazenar array de fotos (base64 ou URLs)

ALTER TABLE public.condominios 
ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb;

-- Comentário
COMMENT ON COLUMN public.condominios.fotos IS 'Array de fotos do condomínio (base64 ou URLs)';
