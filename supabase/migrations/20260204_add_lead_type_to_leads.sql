-- Migration: Adicionar coluna lead_type à tabela public.leads
-- lead_type: 1 = Interessado (default), 2 = Proprietário
-- Data: 2026-02-04

-- 1. Adicionar coluna lead_type com default = 1 (Interessado)
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lead_type INTEGER DEFAULT 1 NOT NULL;

-- 2. Backfill: garantir que registros existentes tenham lead_type = 1
UPDATE public.leads 
SET lead_type = 1 
WHERE lead_type IS NULL;

-- 3. Adicionar constraint de check para valores válidos (1 ou 2)
ALTER TABLE public.leads 
ADD CONSTRAINT leads_lead_type_check 
CHECK (lead_type IN (1, 2));

-- 4. Criar índices para performance nas queries de métricas
CREATE INDEX IF NOT EXISTS idx_leads_tenant_lead_type 
ON public.leads(tenant_id, lead_type);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_agent_lead_type 
ON public.leads(tenant_id, assigned_agent_id, lead_type);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_status_lead_type 
ON public.leads(tenant_id, status, lead_type);

-- 5. Comentário na coluna para documentação
COMMENT ON COLUMN public.leads.lead_type IS 'Tipo do lead: 1 = Interessado (comprador/locatário), 2 = Proprietário (vendedor/locador)';
