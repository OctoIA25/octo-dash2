-- Adiciona colunas de arquivamento à tabela kenlo_leads
-- Unifica o modelo de arquivamento com public.leads (que já tem archived_at e archive_reason)

ALTER TABLE public.kenlo_leads
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN public.kenlo_leads.archived_at IS 'Data de arquivamento do lead (soft delete). NULL = ativo.';
COMMENT ON COLUMN public.kenlo_leads.archive_reason IS 'Motivo do arquivamento informado pelo usuário ou via API.';

CREATE INDEX IF NOT EXISTS idx_kenlo_leads_archived_at ON public.kenlo_leads (archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kenlo_leads_tenant_archived ON public.kenlo_leads (tenant_id, archived_at);
