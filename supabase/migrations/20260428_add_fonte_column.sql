-- Adicionar coluna 'fonte' na tabela recruitment_candidates
-- Migration: 20260428_add_fonte_column

ALTER TABLE recruitment_candidates 
ADD COLUMN fonte TEXT;

-- Adicionar comentário na coluna
COMMENT ON COLUMN recruitment_candidates.fonte IS 'Fonte de onde o candidato veio (LinkedIn, Indicação, Site Institucional, Email Marketing, Outros)';

-- Criar índice para melhor performance
CREATE INDEX idx_recruitment_candidates_fonte ON recruitment_candidates(fonte);

-- Atualizar registros existentes com valor padrão
UPDATE recruitment_candidates 
SET fonte = 'Outros' 
WHERE fonte IS NULL;
