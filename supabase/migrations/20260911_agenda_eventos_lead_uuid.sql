-- =============================================================================
-- `agenda_eventos` ganha `lead_uuid`: o lead do CRM não cabia em `lead_id`.
--
-- POR QUE
-- Existem DUAS identidades de lead nesta base:
--   • `bolsao_leads.id`  → inteiro. É o que `agenda_eventos.lead_id` sempre
--     guardou, porque quem criava atividade era o modal do Bolsão.
--   • `leads.id`         → uuid. É o lead do Kanban ("Meus Leads"), o mesmo que
--     `proposals.lead_id` e `sales_transactions.lead_id` referenciam.
--
-- A seção de Atividades dentro do card do lead (Kanban) só tem o uuid em mãos.
-- Enfiar uuid em coluna inteira não é possível, e converter `lead_id` para text
-- para caber os dois faria a coluna deixar de ser chave de nada — nenhuma FK,
-- nenhuma garantia, e todo consumidor atual teria que ser revisado.
--
-- Então cada identidade ganha sua coluna, com a FK de verdade no lado do CRM.
-- `lead_id` fica exatamente como está: nada a migrar, nada a reescrever no
-- caminho do Bolsão.
--
-- ponytail: duas colunas porque são dois mundos de lead que ainda não foram
-- unificados. Se um dia `bolsao_leads` passar a apontar sempre para `leads`
-- (já existe `source_lead_id uuid` lá desde 20260427), isto vira uma coluna só.
-- =============================================================================

ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS lead_uuid uuid;

DO $$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'agenda_eventos_lead_uuid_fkey'
     ) THEN
    ALTER TABLE public.agenda_eventos
      ADD CONSTRAINT agenda_eventos_lead_uuid_fkey
      FOREIGN KEY (lead_uuid) REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A seção dentro do card busca sempre por (tenant, lead) — sem índice seria um
-- scan da agenda do tenant inteiro a cada card aberto no Kanban.
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_tenant_lead_uuid
  ON public.agenda_eventos (tenant_id, lead_uuid)
  WHERE lead_uuid IS NOT NULL;

COMMENT ON COLUMN public.agenda_eventos.lead_uuid IS
  'Lead do CRM (public.leads.id). Distinto de lead_id, que é o id inteiro do bolsão.';
