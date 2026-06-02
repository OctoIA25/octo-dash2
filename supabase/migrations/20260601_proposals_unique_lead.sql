-- Impede propostas duplicadas para o mesmo lead dentro de um tenant.
--
-- Contexto: createSavedProposal dedupa por (tenant_id, lead_id) no nível da
-- aplicação (SELECT-then-INSERT), mas duas abas/dois usuários editando a
-- proposta do mesmo lead em paralelo podiam inserir duas linhas. Este índice
-- único parcial passa a garantia para o banco; o app trata o conflito 23505
-- reaproveitando a proposta existente.

-- 1) Remove duplicatas históricas, mantendo a proposta atualizada mais
--    recentemente por (tenant_id, lead_id). As tabelas filhas
--    (proposal_parties, proposal_history) têm ON DELETE CASCADE, então os
--    registros vinculados às linhas removidas saem junto.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, lead_id
      ORDER BY updated_at DESC, created_at DESC, id
    ) AS rn
  FROM public.proposals
  WHERE lead_id IS NOT NULL
)
DELETE FROM public.proposals p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2) Garante unicidade apenas quando há vínculo com lead (propostas manuais
--    sem lead_id continuam livres para coexistir).
CREATE UNIQUE INDEX IF NOT EXISTS uq_proposals_tenant_lead
  ON public.proposals (tenant_id, lead_id)
  WHERE lead_id IS NOT NULL;
