-- ============================================================
-- MIGRATION: Fila (outbox) do Agente de Recuperação
--
-- Por quê uma fila? O arquivamento de um lead é um PATCH direto no Supabase
-- (frontend), sem passar pelo servidor. O trigger de banco (próxima migration)
-- é o único ponto que captura TODO arquivamento — mas o Postgres não faz HTTP
-- nem WhatsApp. Então o trigger ENFILEIRA aqui e o worker existente
-- (server/recommendations) DRENA e entrega, reutilizando deliverRecommendation().
-- É o mesmo padrão "outbox" do recommendation_schedules, porém sem snapshot de
-- conteúdo: o conteúdo (mensagem + imóveis fixos) vem da config do tenant na
-- hora do envio.
--
-- Segurança: tabela 100% server-side. RLS habilitada SEM POLICIES — só o
-- service_role (servidor) acessa, como tenant_email_secrets. O frontend nunca lê
-- nem escreve a fila.
--
-- Idempotência: idempotency_key UNIQUE = tenant|lead|archived_at. Cada NOVA
-- transição ativo→arquivado tem um archived_at novo → nova key → reenvia (regra
-- de produto: recuperar de novo). Duplicatas TÉCNICAS do mesmo arquivamento
-- (UPDATEs concorrentes) caem no ON CONFLICT DO NOTHING e não duplicam.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recovery_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- leads.id é TEXT no domínio (compatível com lead_id de lead_recommendations).
  lead_id TEXT NOT NULL,
  -- Origem do lead. MVP: apenas 'crm' (tabela leads).
  lead_source TEXT NOT NULL DEFAULT 'crm',
  lead_name TEXT,
  lead_phone TEXT,
  -- Momento do arquivamento que originou o item (parte da idempotency_key).
  archived_at TIMESTAMPTZ NOT NULL,
  archive_reason TEXT,
  -- pending → processing → done | skipped | failed
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'skipped', 'failed')),
  -- Dedup de eventos: tenant|lead|archived_at. UNIQUE garante 1 item por evento.
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  -- Motivo de skip (ex.: agente desabilitado, lead sem telefone) ou erro de envio.
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (idempotency_key)
);

-- Query do worker: drena os pendentes mais antigos primeiro.
CREATE INDEX IF NOT EXISTS idx_recovery_queue_pending
  ON public.recovery_queue (status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_recovery_queue_tenant
  ON public.recovery_queue (tenant_id, created_at DESC);

-- RLS habilitada e SEM POLICIES: nenhum usuário (anon/authenticated) lê ou
-- escreve. Só o service_role (que ignora RLS) acessa — ou seja, só o servidor.
ALTER TABLE public.recovery_queue ENABLE ROW LEVEL SECURITY;

-- Defesa extra: revoga qualquer privilégio direto dos roles do PostgREST.
REVOKE ALL ON public.recovery_queue FROM anon, authenticated;

COMMENT ON TABLE public.recovery_queue
  IS 'Outbox do Agente de Recuperação: itens enfileirados ao arquivar um lead, drenados pelo worker. Acessível apenas pelo service_role.';
