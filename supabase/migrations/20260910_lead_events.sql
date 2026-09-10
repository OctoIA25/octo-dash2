-- ============================================================
-- Histórico do lead — tabela de eventos + triggers de auditoria
--
-- CONTEXTO
-- O card do lead mostra o estado atual, mas não conta a história: quando o
-- lead entrou, por qual origem, quem recebeu, quando mudou de etapa, o que a
-- LIA já fez. Hoje isso não existe em lugar nenhum do banco.
--
-- Duas tentativas anteriores ficaram pelo caminho e NÃO são reaproveitadas:
--   - `lead_history_logs` — sem migration, lead_id INTEGER, escrita só por
--     updateLeadService.ts contra a tabela legada `CRM_Octo-Dash`. O modelo
--     atual é uuid; o tipo não casa.
--   - `lead_queue_history` — sem migration (schema só existe em prod), cobre
--     apenas redistribuição de bolsão.
--
-- POR QUE TRIGGER E NÃO CÓDIGO
-- Lead nasce e muda em ~15 lugares: POST /api/v1/leads (duas versões, tabelas
-- diferentes), /batch, /upsert, /roleta, webhook ZAP/OLX, crmSync/engine.js
-- (Kenlo + C2S), santaAngelaSyncService, loopback do Meta, CriarLeadQuickModal,
-- import de Excel, atualizarStatusLeadCRM, PATCH /leads/:id/stage,
-- leadClassification.js, expire_bolsao_leads() (pg_cron) e a fila de equipe.
-- Instrumentar todos é diff enorme com garantia de esquecer um — e dois desses
-- rodam DENTRO do Postgres, onde não há código nosso para instrumentar.
-- Um par de triggers cobre os quinze. Mesmo raciocínio de
-- 20260817_imoveis_locais_log.sql.
--
-- UMA FUNÇÃO PARA AS DUAS TABELAS
-- `leads` e `kenlo_leads` guardam o mesmo conceito com nomes diferentes
-- (status/stage, assigned_agent_name/attended_by_name, source/portal). A função
-- lê `to_jsonb(NEW)` em vez de referenciar colunas: `->>` de coluna inexistente
-- devolve NULL em vez de erro, então o mesmo corpo serve às duas sem
-- duplicação e sem quebrar quando uma delas ganhar/perder coluna.
--
-- POR QUE NÃO FOREIGN KEY em lead_id
-- Mesma razão de lia_followups: parte das linhas é escrita por integração
-- externa (POST /api/v1/lia/lead-events) e uma FK transformaria corrida ou
-- lead apagado em erro de escrita do lado de quem integra. O join é na leitura,
-- que tolera órfão. É também por isso que lead_id é TEXT + lead_source: as duas
-- tabelas de origem têm ids independentes.
--
-- ORDEM DE DEPLOY
--   1. Esta migration.
--   2. Deploy do servidor (GET /leads/:id/eventos, POST /lia/lead-events).
--   3. Deploy do front (seção Histórico no modal do lead).
-- Inverter 1 e 2 quebra: a rota de leitura devolveria 42703.
--
-- APLICAR NO SUPABASE ANTES DO DEPLOY.
-- Rodar UM BLOCO POR EXECUÇÃO no SQL Editor: a aba inteira roda em uma
-- transação e DDL multi-tabela já deadlockou (40P01) contra os syncs aqui.
-- ============================================================

SET lock_timeout = '10s';

-- ------------------------------------------------------------
-- BLOCO 1 — tabela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  -- uuid como TEXT: casa com `leads` E `kenlo_leads`, que são tabelas
  -- distintas com ids próprios. Mesma convenção de recovery_queue e
  -- agent_action_queue.
  lead_id       text NOT NULL,
  lead_source   text NOT NULL CHECK (lead_source IN ('leads', 'kenlo_leads')),
  -- ENUM ABERTO DE PROPÓSITO: sem CHECK. O app da LIA cria tipo novo sem
  -- avisar (mesma realidade das tags em cadenciaLabels.ts) e um CHECK faria o
  -- POST dela virar 500. A leitura humaniza o desconhecido, nunca esconde.
  event_type    text NOT NULL,
  descricao     text,
  de            text,
  para          text,
  ator_tipo     text NOT NULL DEFAULT 'sistema' CHECK (ator_tipo IN ('sistema', 'usuario', 'lia')),
  ator_user_id  uuid,
  ator_nome     text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Só quem integra de fora manda. NULL nas linhas do trigger.
  idempotency_key text,
  -- Quando o fato ACONTECEU, não quando a linha foi gravada. Para lead.created
  -- o trigger usa a data do próprio lead, senão um lead importado de 2023
  -- apareceria como criado hoje.
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- BLOCO 2 — índices
-- ------------------------------------------------------------

-- A leitura é sempre "histórico deste lead, mais recente primeiro".
CREATE INDEX IF NOT EXISTS idx_lead_events_lead
  ON public.lead_events (tenant_id, lead_id, created_at DESC);

-- Sustenta o find-then-update do POST /api/v1/lia/lead-events. Parcial porque
-- as linhas do trigger têm idempotency_key NULL e um índice único cheio não
-- aceitaria mais de uma delas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_lead_events_idem
  ON public.lead_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ------------------------------------------------------------
-- BLOCO 3 — trigger de auditoria
--
-- SECURITY DEFINER: anon/authenticated não têm INSERT aqui (REVOKE no bloco 4),
-- então quem grava é a função. É o que torna o histórico inforjável — um
-- corretor não consegue inventar nem apagar evento, só ler pelo servidor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_log_lead_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_novo   jsonb := to_jsonb(NEW);
  v_velho  jsonb;
  v_ator   uuid  := auth.uid();
  -- service_role (sync, jobs, endpoints) não tem auth.uid(): vira "Sistema",
  -- igual a imoveis_locais_log.alterado_por.
  v_tipo   text  := CASE WHEN auth.uid() IS NULL THEN 'sistema' ELSE 'usuario' END;
  v_corretor_novo  text;
  v_corretor_velho text;
  v_etapa_nova     text;
  v_etapa_velha    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Backfill histórico não é "lead criado agora". A linha entra sem evento e
    -- a leitura mostra o evento DERIVADO de created_at, que carrega a data
    -- real. Mesmo gate de 20260706_webhook_gate_backfill_freshness.
    IF COALESCE((v_novo ->> 'is_backfill')::boolean, false) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.lead_events
      (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, ator_user_id, metadata, created_at)
    VALUES (
      NEW.tenant_id,
      NEW.id::text,
      TG_TABLE_NAME,
      'lead.created',
      COALESCE(v_novo ->> 'source', v_novo ->> 'portal'),
      v_tipo,
      v_ator,
      jsonb_strip_nulls(jsonb_build_object(
        'etapa',    COALESCE(v_novo ->> 'status', v_novo ->> 'stage'),
        'corretor', COALESCE(v_novo ->> 'assigned_agent_name', v_novo ->> 'attended_by_name')
      )),
      -- lead_timestamp é o event time do portal (Kenlo); created_at é o
      -- processing time. O histórico quer o primeiro.
      COALESCE((v_novo ->> 'lead_timestamp')::timestamptz, (v_novo ->> 'created_at')::timestamptz, now())
    );
    RETURN NEW;
  END IF;

  v_velho := to_jsonb(OLD);

  -- --- corretor -------------------------------------------------------
  v_corretor_novo  := COALESCE(v_novo  ->> 'assigned_agent_name', v_novo  ->> 'attended_by_name');
  v_corretor_velho := COALESCE(v_velho ->> 'assigned_agent_name', v_velho ->> 'attended_by_name');

  IF v_corretor_novo IS DISTINCT FROM v_corretor_velho THEN
    INSERT INTO public.lead_events
      (tenant_id, lead_id, lead_source, event_type, de, para, ator_tipo, ator_user_id, metadata)
    VALUES (
      NEW.tenant_id, NEW.id::text, TG_TABLE_NAME, 'lead.assigned',
      v_corretor_velho, v_corretor_novo, v_tipo, v_ator,
      jsonb_strip_nulls(jsonb_build_object(
        'corretor_user_id', COALESCE(v_novo ->> 'assigned_agent_id', v_novo ->> 'attended_by_id')
      ))
    );
  END IF;

  -- --- etapa ----------------------------------------------------------
  v_etapa_nova  := COALESCE(v_novo  ->> 'status', v_novo  ->> 'stage');
  v_etapa_velha := COALESCE(v_velho ->> 'status', v_velho ->> 'stage');

  IF v_etapa_nova IS DISTINCT FROM v_etapa_velha THEN
    INSERT INTO public.lead_events
      (tenant_id, lead_id, lead_source, event_type, de, para, ator_tipo, ator_user_id)
    VALUES (
      NEW.tenant_id, NEW.id::text, TG_TABLE_NAME, 'lead.stage_changed',
      v_etapa_velha, v_etapa_nova, v_tipo, v_ator
    );
  END IF;

  -- --- arquivamento ---------------------------------------------------
  -- Só a transição entre arquivado e ativo importa; mudar a data de um lead
  -- que já estava arquivado não é evento.
  IF (v_velho ->> 'archived_at') IS NULL AND (v_novo ->> 'archived_at') IS NOT NULL THEN
    INSERT INTO public.lead_events
      (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, ator_user_id)
    VALUES (
      NEW.tenant_id, NEW.id::text, TG_TABLE_NAME, 'lead.archived',
      v_novo ->> 'archive_reason', v_tipo, v_ator
    );
  ELSIF (v_velho ->> 'archived_at') IS NOT NULL AND (v_novo ->> 'archived_at') IS NULL THEN
    INSERT INTO public.lead_events
      (tenant_id, lead_id, lead_source, event_type, ator_tipo, ator_user_id)
    VALUES (
      NEW.tenant_id, NEW.id::text, TG_TABLE_NAME, 'lead.unarchived', v_tipo, v_ator
    );
  END IF;

  -- --- classificação --------------------------------------------------
  -- classification é text[]; comparar o jsonb evita depender da ordem textual.
  IF (v_novo -> 'classification') IS DISTINCT FROM (v_velho -> 'classification') THEN
    INSERT INTO public.lead_events
      (tenant_id, lead_id, lead_source, event_type, de, para, ator_tipo, ator_user_id, metadata)
    VALUES (
      NEW.tenant_id, NEW.id::text, TG_TABLE_NAME, 'lead.classified',
      array_to_string(OLD.classification, ', '),
      array_to_string(NEW.classification, ', '),
      v_tipo, v_ator,
      -- 'lia' | 'dashboard' | 'automatic': é o que distingue quem classificou
      -- quando a escrita veio do servidor e não há auth.uid().
      jsonb_strip_nulls(jsonb_build_object('origem', v_novo ->> 'classification_source'))
    );
  END IF;

  RETURN NEW;
END;
$fn$;

-- Lista de colunas EXPLÍCITA no AFTER UPDATE OF: os syncs do Kenlo/C2S tocam
-- as linhas a cada 3 minutos e sem isso o trigger seria chamado à toa milhares
-- de vezes por hora. O IS DISTINCT FROM lá dentro é a segunda barreira.
DROP TRIGGER IF EXISTS tr_leads_log_event ON public.leads;
CREATE TRIGGER tr_leads_log_event
  AFTER INSERT OR UPDATE OF status, assigned_agent_id, assigned_agent_name, archived_at, classification
  ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_lead_event();

DROP TRIGGER IF EXISTS tr_kenlo_leads_log_event ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_log_event
  AFTER INSERT OR UPDATE OF stage, attended_by_id, attended_by_name, archived_at, classification
  ON public.kenlo_leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_lead_event();

-- ------------------------------------------------------------
-- BLOCO 4 — segurança
--
-- RLS ligada e SEM policy, como lia_followups / webhook_events / recovery_queue:
-- tabela 100% server-side. A leitura do card passa por
-- GET /api/v1/leads/:leadId/eventos, que recorta em código quem pode ver — a
-- RLS de `leads` neste banco está frouxa demais (leads legíveis sem JWT) para
-- confiar numa policy nova aqui.
--
-- O REVOKE também protege o histórico de ser forjado: sem GRANT, nem um
-- authenticated com JWT válido insere evento inventado. Nunca revogar de
-- service_role, que é a chave do servidor e do trigger.
-- ------------------------------------------------------------
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_events FROM anon, authenticated;

COMMENT ON TABLE public.lead_events IS
  'Histórico append-only do lead (criação, atribuição, etapa, arquivamento, classificação) + eventos reportados pela LIA. Escrito pelos triggers tr_*_log_event (SECURITY DEFINER) e pela rota POST /api/v1/lia/lead-events; leitura só via servidor (service_role).';
COMMENT ON COLUMN public.lead_events.event_type IS
  'Enum ABERTO. A dash emite lead.created|assigned|stage_changed|archived|unarchived|classified; a LIA emite lia.*. Sem CHECK de propósito: tipo novo do app externo não pode virar erro de escrita.';
COMMENT ON COLUMN public.lead_events.lead_id IS
  'Id do lead como texto, na tabela indicada por lead_source. Sem FK: parte das linhas vem de integração externa e o join é feito na leitura.';
COMMENT ON COLUMN public.lead_events.created_at IS
  'Quando o fato aconteceu. Em lead.created é a data do próprio lead (lead_timestamp/created_at), não a do INSERT.';
COMMENT ON COLUMN public.lead_events.idempotency_key IS
  'Chave do emissor externo, única por tenant. Formato sugerido: lia:<lead_id>:<event_type>:<etapa>. NULL nas linhas do trigger.';

-- ------------------------------------------------------------
-- BLOCO 5 — prova
--
-- Sem INSERT de mentira: uma linha fake apareceria como evento real no card do
-- lead. A prova é estrutural.
-- ------------------------------------------------------------
DO $$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(c, ', ') INTO faltando
  FROM unnest(ARRAY['tenant_id','lead_id','lead_source','event_type','de','para',
                    'ator_tipo','ator_user_id','metadata','idempotency_key','created_at']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lead_events' AND column_name = c
  );
  ASSERT faltando IS NULL, format('colunas não criadas: %s', faltando);

  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'ux_lead_events_idem'),
         'índice único de idempotência não existe';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'idx_lead_events_lead'),
         'índice por lead não existe';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lead_events'::regclass),
         'RLS não está habilitada';
  ASSERT NOT EXISTS (
           SELECT 1 FROM information_schema.role_table_grants
            WHERE table_schema = 'public' AND table_name = 'lead_events'
              AND grantee IN ('anon', 'authenticated')
         ), 'anon/authenticated ainda têm grant na tabela';

  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.leads'::regclass AND tgname = 'tr_leads_log_event'),
         'trigger de leads não criado';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.kenlo_leads'::regclass AND tgname = 'tr_kenlo_leads_log_event'),
         'trigger de kenlo_leads não criado';

  RAISE NOTICE 'OK — lead_events pronta (% eventos)', (SELECT count(*) FROM public.lead_events);
END $$;

-- ------------------------------------------------------------
-- BLOCO 6 — CONFERIR À MÃO depois de aplicar
--
-- Em 02/09 descobriu-se um trigger gêmeo `trg_enqueue_lead_created_webhook`
-- (com "g") criado fora de migration, que furou todos os gates por semanas
-- porque as migrations só derrubavam o nome `tr_`. Antes de confiar neste
-- histórico, LISTE os triggers reais sem filtrar por prefixo:
--
--   SELECT tgrelid::regclass AS tabela, tgname
--     FROM pg_trigger
--    WHERE tgrelid IN ('public.leads'::regclass, 'public.kenlo_leads'::regclass)
--      AND NOT tgisinternal
--    ORDER BY 1, 2;
--
-- Qualquer gêmeo de tg_log_lead_event ali gravaria evento duplicado no card.
-- ------------------------------------------------------------

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP TRIGGER IF EXISTS tr_leads_log_event ON public.leads;
-- DROP TRIGGER IF EXISTS tr_kenlo_leads_log_event ON public.kenlo_leads;
-- DROP FUNCTION IF EXISTS public.tg_log_lead_event();
-- DROP TABLE IF EXISTS public.lead_events;
