-- =============================================================================
-- Quem não recebe lead automático sai da escolha DENTRO do Postgres.
--
-- POR QUE
-- A marca "não recebe lead automático" é
-- `tenant_memberships.permissions->lead_limit->>'receives_auto_leads' = 'false'`
-- (captador, pausa). Ela já era respeitada no Node — roleta do Express, os três
-- pipelines de atribuição e a fila por equipe —, mas TRÊS caminhos atribuem lead
-- sem passar por uma linha de JavaScript:
--
--   1. o trigger BEFORE INSERT `tr_leads_assign_roleta` em `public.leads`
--      (20260428_roleta_auto_assign_on_leads_insert.sql), que roda em todo insert
--      sem corretor — inclusive o de webhook de portal;
--   2. o pg_cron 'bolsao-expire-every-minute' chamando `expire_bolsao_leads()`
--      (20260428_enable_pg_cron_and_bolsao_master_switch.sql), de minuto em minuto;
--   3. a mesma `expire_bolsao_leads()` chamada pelo front
--      (MeusLeadsAtribuidosSection.tsx).
--
-- Sem esta migration, a exclusão feita em JS é DESFEITA pelo Postgres no mesmo
-- INSERT: o lead nasce sem corretor e o trigger o entrega ao captador de novo.
--
-- ONDE A TRAVA FICA
-- Dentro das funções que ESCOLHEM, não num trigger posterior. Triggers BEFORE
-- disparam em ordem alfabética e `tr_leads_assign_roleta` já rodou — anular a
-- atribuição depois dele deixaria o lead órfão sem refazer a distribuição. Mesmo
-- raciocínio do cabeçalho de 20260910_leads_assignee_tenant_guard.sql: uma trava
-- só, no fim do funil, vale mais que N revisões.
--
-- CORPOS
-- Os arquivos 20260428_* deste repo NÃO têm o corpo real: o stub
-- 20260428_roleta_random_and_team_queue_postgres.sql diz "Corpo completo das
-- funcoes esta no projeto Supabase" e registra que as funções passaram a
-- `ORDER BY random()`, que nasceu `pick_team_queue_member` e que
-- `expire_bolsao_leads` ganhou ramificação por `team_queue_enabled`. Um
-- CREATE OR REPLACE copiado do repo reverteria as três coisas em silêncio.
--
-- Os corpos abaixo foram lidos da PRODUÇÃO em 12/set/2026 com
-- `pg_get_functiondef` e estão reproduzidos como estavam; a ÚNICA alteração em
-- cada um é o predicado marcado com "— 20260912". Esta migration passa a ser a
-- fonte no repo para as três funções.
--
-- `expire_bolsao_leads` NÃO é alterada: ela só chama as funções de escolha e, se
-- nenhuma devolver corretor, move o lead para o pool do bolsão ('movido_para_pool')
-- — ou seja, excluir o captador ali nunca perde lead.
--
-- ponytail: o predicado repete a leitura do JSONB em vez de virar uma função
-- `recebe_lead_automatico(tenant, user)`. São 3 call sites em 1 arquivo; função
-- nova custaria mais um objeto para manter e uma camada para depurar. Se um 4º
-- lugar precisar da mesma pergunta, vale extrair.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Roleta: escolha aleatória entre os participantes ativos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pick_roleta_broker(p_tenant_id uuid)
 RETURNS TABLE(broker_id text, broker_name text, broker_email text, broker_phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_picked_id uuid;
BEGIN
  SELECT roleta_enabled INTO v_enabled
  FROM public.tenant_bolsao_config
  WHERE tenant_id = p_tenant_id;

  IF v_enabled = false THEN
    RETURN;
  END IF;

  SELECT rp.id INTO v_picked_id
  FROM public.roleta_participantes rp
  WHERE rp.tenant_id = p_tenant_id
    AND rp.is_active = true
    -- 20260912: fora quem não recebe lead automático (captador/pausa).
    -- `broker_id` é texto e guarda o auth uid; o cast é do lado do uuid para que
    -- valor não-uuid simplesmente não case, em vez de estourar 22P02.
    AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id::text = lower(rp.broker_id)
        AND tm.permissions -> 'lead_limit' ->> 'receives_auto_leads' = 'false'
    )
  ORDER BY random()
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_picked_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.roleta_participantes rp
  SET last_assigned_at = now(),
      updated_at = now()
  WHERE rp.id = v_picked_id
  RETURNING rp.broker_id, rp.broker_name, rp.broker_email, rp.broker_phone
  INTO broker_id, broker_name, broker_email, broker_phone;

  RETURN NEXT;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2) Roleta da redistribuição: igual, excluindo quem já teve o lead
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pick_roleta_broker_excluding(p_tenant_id uuid, p_exclude_name text)
 RETURNS TABLE(broker_id text, broker_name text, broker_email text, broker_phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_picked_id uuid;
BEGIN
  SELECT roleta_enabled INTO v_enabled
  FROM public.tenant_bolsao_config
  WHERE tenant_id = p_tenant_id;

  IF v_enabled = false THEN
    RETURN;
  END IF;

  SELECT rp.id INTO v_picked_id
  FROM public.roleta_participantes rp
  WHERE rp.tenant_id = p_tenant_id
    AND rp.is_active = true
    AND (p_exclude_name IS NULL OR rp.broker_name IS DISTINCT FROM p_exclude_name)
    -- 20260912: mesmo predicado de pick_roleta_broker.
    AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id::text = lower(rp.broker_id)
        AND tm.permissions -> 'lead_limit' ->> 'receives_auto_leads' = 'false'
    )
  ORDER BY random()
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_picked_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.roleta_participantes rp
  SET last_assigned_at = now(),
      updated_at = now()
  WHERE rp.id = v_picked_id
  RETURNING rp.broker_id, rp.broker_name, rp.broker_email, rp.broker_phone
  INTO broker_id, broker_name, broker_email, broker_phone;

  RETURN NEXT;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3) Fila da equipe: esta já lê tenant_memberships, então o predicado é direto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pick_team_queue_member(p_tenant_id uuid, p_original_corretor_name text)
 RETURNS TABLE(user_id uuid, broker_name text, broker_email text, broker_phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original_user_id uuid;
  v_team text;
  v_leader_user_id uuid;
BEGIN
  IF p_original_corretor_name IS NULL THEN
    RETURN;
  END IF;

  -- Acha o user_id do corretor original pelo nome
  SELECT up.id INTO v_original_user_id
  FROM public.user_profiles up
  WHERE up.full_name ILIKE p_original_corretor_name
  LIMIT 1;

  IF v_original_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Pega team + leader do corretor original
  SELECT
    (m.permissions->>'team')::text,
    m.leader_user_id
  INTO v_team, v_leader_user_id
  FROM public.tenant_memberships m
  WHERE m.tenant_id = p_tenant_id AND m.user_id = v_original_user_id
  LIMIT 1;

  IF v_team IS NULL OR v_leader_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Pick random member of same team+leader (excluindo original)
  RETURN QUERY
  SELECT
    m.user_id,
    COALESCE(up.full_name, split_part(up.email, '@', 1))::text AS broker_name,
    up.email::text,
    up.phone::text
  FROM public.tenant_memberships m
  LEFT JOIN public.user_profiles up ON up.id = m.user_id
  WHERE m.tenant_id = p_tenant_id
    AND m.role = 'corretor'
    AND m.leader_user_id = v_leader_user_id
    AND (m.permissions->>'team')::text = v_team
    AND m.user_id != v_original_user_id
    -- 20260912: fora quem não recebe lead automático (captador/pausa).
    -- COALESCE porque a chave não existe na maioria dos membros.
    AND COALESCE(m.permissions -> 'lead_limit' ->> 'receives_auto_leads', 'true') <> 'false'
  ORDER BY random()
  LIMIT 1;
END;
$function$;

-- =============================================================================
-- VERIFICAÇÃO (rodar dentro de BEGIN/ROLLBACK, como em 20260910)
--
--   BEGIN;
--     -- marca um participante da roleta como captador
--     UPDATE public.tenant_memberships
--        SET permissions = jsonb_set(
--              COALESCE(permissions, '{}'::jsonb),
--              '{lead_limit}',
--              COALESCE(permissions->'lead_limit', '{}'::jsonb)
--                || '{"receives_auto_leads": false, "motivo": "captador"}'::jsonb,
--              true)
--      WHERE tenant_id = '<tenant>' AND user_id = '<captador>';
--
--     -- 20 sorteios: o captador não pode aparecer em nenhum
--     SELECT DISTINCT broker_id, broker_name
--       FROM generate_series(1, 20) g,
--            LATERAL public.pick_roleta_broker('<tenant>');
--   ROLLBACK;
--
-- ROLLBACK DEFINITIVO: reaplicar as três funções sem as cláusulas marcadas
-- "20260912" (o resto do corpo é idêntico ao que estava em produção em
-- 12/set/2026). A marca em permissions não precisa ser removida: sem o predicado
-- ela volta a ser lida só pelo Node.
-- =============================================================================
