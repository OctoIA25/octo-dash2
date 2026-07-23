-- ⚠️ ORDEM DE DEPLOY: rodar ANTES do deploy do código novo (prod E dev).
-- Sem a coluna, o código novo quebra com 42703 (column does not exist).
--
-- Move o CRECI de permissions.creci (JSONB) para uma coluna dedicada.
-- Motivo: portal público precisa ler o CRECI sem expor o objeto `permissions`
-- (que carrega controle de acesso interno). A coluna vira a fonte única.

ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS creci TEXT;
COMMENT ON COLUMN tenant_memberships.creci IS
  'CRECI do corretor (opcional). Fonte única — antes ficava em permissions.creci.';

-- Backfill: copia valores existentes do JSON para a coluna E remove a chave do JSON.
-- `permissions ? 'creci'` = linhas onde a chave existe. `permissions - 'creci'` = remove a chave.
UPDATE tenant_memberships
SET creci = permissions->>'creci',
    permissions = permissions - 'creci'
WHERE permissions ? 'creci';

-- ROLLBACK (se necessário):
--   ALTER TABLE tenant_memberships DROP COLUMN IF EXISTS creci;
--   (o backfill que removeu a chave do JSON NÃO é revertido por este rollback —
--    o dado já estará só na coluna; ao dropar a coluna, perde-se o CRECI.)
