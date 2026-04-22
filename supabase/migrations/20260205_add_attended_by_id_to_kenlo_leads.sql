-- Migration: Adicionar coluna attended_by_id à tabela kenlo_leads
-- attended_by_id: UUID do corretor no sistema (auth.users.id / tenant_memberships.user_id)
-- Data: 2026-02-05

-- 1. Adicionar coluna attended_by_id (UUID do corretor no sistema)
ALTER TABLE public.kenlo_leads 
ADD COLUMN IF NOT EXISTS attended_by_id UUID;

-- 2. Criar índice para performance nas buscas por corretor
CREATE INDEX IF NOT EXISTS idx_kenlo_leads_attended_by_id 
ON public.kenlo_leads(attended_by_id);

-- 3. Índice composto para buscas de leads por tenant e corretor
CREATE INDEX IF NOT EXISTS idx_kenlo_leads_tenant_attended 
ON public.kenlo_leads(tenant_id, attended_by_id);

-- 4. Comentário na coluna para documentação
COMMENT ON COLUMN public.kenlo_leads.attended_by_id IS 'UUID do corretor responsável no sistema (auth.users.id). Vinculado via match de nome/email/telefone com tenant_brokers ou tenant_memberships.';
