-- =============================================================================
-- Equipes com múltiplos gestores
-- =============================================================================
-- Adiciona teams.leader_user_ids (uuid[]) para permitir mais de um gestor por
-- equipe.
--
-- COMPATIBILIDADE: teams.leader_user_id CONTINUA existindo e passa a significar
-- "gestor primário" (= leader_user_ids[1]). Ele segue sendo a chave usada na
-- denormalização em tenant_memberships.leader_user_id (fila por equipe/roleta),
-- no eNPS (subject_leader_user_id) e no histórico do bolsão. O app mantém as
-- duas colunas sincronizadas ao salvar.
--
-- APLICAR ANTES do deploy do front — os filtros novos usam leader_user_ids e
-- retornam 42703 se a coluna não existir.
-- =============================================================================

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS leader_user_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill: o líder atual vira o primeiro (primário) do array
UPDATE public.teams
SET leader_user_ids = ARRAY[leader_user_id]
WHERE leader_user_id IS NOT NULL
  AND leader_user_ids = '{}';

COMMENT ON COLUMN public.teams.leader_user_ids IS
  'Gestores da equipe. O primeiro é o gestor primário e é espelhado em leader_user_id (compat: fila por equipe, eNPS, bolsão).';
COMMENT ON COLUMN public.teams.leader_user_id IS
  'Gestor primário (= leader_user_ids[1]). Mantido por compatibilidade com a denormalização em tenant_memberships.';
