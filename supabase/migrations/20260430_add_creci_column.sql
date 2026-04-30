-- Adicionar coluna creci na tabela recruitment_candidates
ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS creci TEXT;

-- Adicionar comentário na coluna
COMMENT ON COLUMN recruitment_candidates.creci IS 'Número do CRECI do candidato (opcional)';
