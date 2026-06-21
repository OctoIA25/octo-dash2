-- ============================================================
-- MIGRATION: Agente Disparador — runs (cabeçalho) + fila (outbox) de ações
--
-- O Agente Disparador transforma comandos em linguagem natural ("envie uma
-- mensagem para todos os clientes arquivados") em UMA operação estruturada e a
-- executa de forma controlada, em duas etapas:
--   1) PRÉVIA  — interpreta a intenção, resolve o segmento e mostra contagens.
--                NENHUM disparo ocorre aqui.
--   2) CONFIRMAÇÃO — o usuário confirma; só então a operação é enfileirada.
--
-- Por que duas tabelas?
--   - agent_action_runs : 1 linha por OPERAÇÃO confirmada. É o cabeçalho de
--                         auditoria/observabilidade (quem, quando, filtros,
--                         contagens, resultado agregado). É também o ponto de
--                         idempotência da CONFIRMAÇÃO: o previewToken vira o id
--                         do run, então confirmar duas vezes o mesmo token não
--                         cria dois runs (ON CONFLICT DO NOTHING).
--   - agent_action_queue: N linhas por run (1 por destinatário). É o outbox que
--                         o worker drena, reutilizando deliverRecommendation()
--                         — MESMO núcleo de envio do recovery/scheduler, com
--                         idempotência, proteção de ambiente e histórico em
--                         lead_recommendations. Não duplicamos envio.
--
-- Espelha o padrão de recovery_queue: tabelas 100% server-side. RLS habilitada
-- mas com policies SOMENTE de leitura por membro do tenant (para o frontend
-- mostrar o relatório do run). A ESCRITA é exclusiva do service_role (servidor):
-- a confirmação passa pelo backend, que valida permissão e tenant antes de
-- enfileirar. O frontend nunca escreve na fila diretamente.
--
-- Extensibilidade: action_type não é fixo em 'send_whatsapp'. Novas ações
-- (create_task, add_tag, move_pipeline, assign_broker) reusam exatamente estas
-- tabelas — basta registrar a ação no actionRegistry do servidor.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Cabeçalho da operação (auditoria + observabilidade)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Tipo da ação executada. MVP: 'send_whatsapp'. Extensível sem migração.
  action_type TEXT NOT NULL,

  -- Comando original em linguagem natural (auditoria de "o que foi pedido").
  command_text TEXT,
  -- Segmento estruturado resolvido pelo interpretador (type + parâmetros).
  -- Ex.: { "type": "archived_period", "days": 30 } ou
  --      { "type": "explicit_list", "names": ["João Silva"] }
  segment JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Contagens da prévia (o que foi apresentado ANTES da confirmação).
  found_count INTEGER NOT NULL DEFAULT 0,        -- clientes encontrados no segmento
  eligible_count INTEGER NOT NULL DEFAULT 0,     -- elegíveis (com WhatsApp válido etc.)
  no_whatsapp_count INTEGER NOT NULL DEFAULT 0,  -- sem WhatsApp válido (excluídos)
  excluded_count INTEGER NOT NULL DEFAULT 0,     -- demais exclusões (limite, dedup recente)

  -- Resultado agregado (preenchido pelo worker conforme drena a fila).
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  deduplicated_count INTEGER NOT NULL DEFAULT 0,

  -- pending → running → done | failed
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),

  -- Quem solicitou (observabilidade exigida).
  requested_by_user_id UUID,
  requested_by_email TEXT,
  requested_by_role TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_action_runs_tenant
  ON public.agent_action_runs(tenant_id, created_at DESC);

-- ------------------------------------------------------------
-- 2) Fila (outbox): 1 item por destinatário do run
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.agent_action_runs(id) ON DELETE CASCADE,

  action_type TEXT NOT NULL,

  -- Alvo do item. lead_id é TEXT por flexibilidade (igual a lead_recommendations).
  lead_id TEXT NOT NULL,
  lead_source TEXT NOT NULL DEFAULT 'crm',
  lead_name TEXT,
  lead_phone TEXT,

  -- Payload da ação (ex.: { templateParams: [...] }). Genérico p/ futuras ações.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- pending → processing → done | skipped | failed
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'skipped', 'failed')),

  -- Dedup de itens: tenant|run|lead. UNIQUE garante 1 envio por lead por run,
  -- mesmo sob enfileiramentos concorrentes (ON CONFLICT DO NOTHING). É uma camada
  -- ALÉM da idempotência de deliverRecommendation (que protege contra reenvio
  -- entre runs dentro da janela).
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (idempotency_key)
);

-- Query do worker: drena os pendentes mais antigos primeiro.
CREATE INDEX IF NOT EXISTS idx_agent_action_queue_pending
  ON public.agent_action_queue (status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_agent_action_queue_run
  ON public.agent_action_queue (run_id);

-- ------------------------------------------------------------
-- RLS: leitura por membro do tenant (relatório no frontend); escrita só servidor
-- ------------------------------------------------------------
ALTER TABLE public.agent_action_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_queue ENABLE ROW LEVEL SECURITY;

-- Defesa extra: nenhuma escrita direta dos roles do PostgREST. INSERT/UPDATE/
-- DELETE só pelo service_role (que ignora RLS). SELECT é liberado via policy.
REVOKE INSERT, UPDATE, DELETE ON public.agent_action_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.agent_action_queue FROM anon, authenticated;

-- SELECT do cabeçalho do run: membro do tenant ou owner da plataforma.
CREATE POLICY "agent_action_runs_select"
  ON public.agent_action_runs FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- SELECT dos itens da fila: mesma regra (para detalhar falhas por destinatário).
CREATE POLICY "agent_action_queue_select"
  ON public.agent_action_queue FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

COMMENT ON TABLE public.agent_action_runs
  IS 'Cabeçalho de cada operação do Agente Disparador (auditoria, contagens da prévia e resultado). Escrita exclusiva do service_role.';
COMMENT ON TABLE public.agent_action_queue
  IS 'Outbox do Agente Disparador: 1 item por destinatário, drenado pelo worker reusando deliverRecommendation(). Escrita exclusiva do service_role.';
COMMENT ON COLUMN public.agent_action_runs.segment
  IS 'Segmento estruturado resolvido pelo interpretador (type + parâmetros). Inclui explicit_list para listas de clientes fornecidas pelo usuário.';
COMMENT ON COLUMN public.agent_action_queue.idempotency_key
  IS 'tenant|run|lead — garante 1 envio por lead por run mesmo sob concorrência (camada além da idempotência de deliverRecommendation).';
