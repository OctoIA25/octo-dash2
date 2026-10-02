-- ============================================================
-- Visita marcada pela Lia vira atividade na agenda do corretor
--
-- Pedido do Erick em 01/10: "Quando agendado visita, tá aparecendo na 2a aba?
-- Seria importante a Lia colocar ali também". A aba Visitas (Central de Leads
-- › Atividades) lê `agenda_eventos`; a Lia nunca escreveu lá. Ela registra a
-- visita no histórico do lead (`lead_events`, event_type 'lia.visita_*'), e o
-- histórico basta: este gatilho espelha a visita na agenda, sem mudar a Lia.
--
--   lia.visita_agendada  → cria a atividade "Visita — <empreendimento>"
--   lia.visita_remarcada → muda data/horário ("... para 2026-09-30 às 14:00")
--   lia.visita_confirmada → status confirmado (e a data, se vier)
--   lia.visita_recusada  → cancelada
--
-- De quem é a atividade: do corretor que a Lia nomeia na visita ("aguardando
-- confirmação de Marcos Lafratta") — nem sempre é o dono do lead: o plantão
-- visita lead de outro. A Lia escreve apelido ("Gabi Favaro", "Mari Mamede"),
-- então o nome casa por sobrenome + 3 primeiras letras, só se for um único
-- membro. Sem casar, vai para o dono do lead; sem dono gente, não cria.
--
-- Uma falha aqui NUNCA derruba o registro da Lia: o gatilho engole o erro e
-- deixa um WARNING no log.
--
-- Bloqueio: 'visita_agendada' é tipo bloqueante, mas o bloqueio está pausado
-- (20261020). Ao religar, as visitas da Lia passam a contar.
-- ============================================================

BEGIN;

-- Membro da casa pelo nome que a Lia escreveu. NULL quando não há um só.
CREATE OR REPLACE FUNCTION public.membro_pelo_nome(p_tenant_id uuid, p_nome text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH alvo AS (
    SELECT regexp_split_to_array(lower(public.unaccent(btrim(regexp_replace(p_nome, '\s+', ' ', 'g')))), ' ') AS p
  ),
  gente AS (
    SELECT user_id, regexp_split_to_array(lower(public.unaccent(nome)), ' ') AS p
      FROM public.pessoas_da_casa(p_tenant_id)
  ),
  exato AS (
    SELECT g.user_id FROM gente g, alvo a WHERE g.p = a.p
  ),
  parecido AS (
    SELECT g.user_id FROM gente g, alvo a
     WHERE cardinality(a.p) > 1 AND cardinality(g.p) > 1
       AND g.p[cardinality(g.p)] = a.p[cardinality(a.p)]
       AND left(g.p[1], 3) = left(a.p[1], 3)
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM exato) = 1 THEN (SELECT user_id FROM exato)
    WHEN (SELECT count(*) FROM exato) = 0 AND (SELECT count(*) FROM parecido) = 1 THEN (SELECT user_id FROM parecido)
  END;
$function$;

REVOKE ALL ON FUNCTION public.membro_pelo_nome(uuid, text) FROM PUBLIC, anon, authenticated;

-- Aplica um evento de visita da Lia na agenda. Separada do gatilho para a
-- carga inicial usar exatamente a mesma regra.
CREATE OR REPLACE FUNCTION public.agenda_da_visita_da_lia(e public.lead_events)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visita text := NULLIF(e.metadata ->> 'visitaId', '');
  v_data   date;
  v_hora   text;
  v_emp    text;
  v_lead   record;
  v_quem   uuid;
  v_email  text;
  v_alvo   uuid;
BEGIN
  SELECT id, name, phone, assigned_agent_id INTO v_lead
    FROM leads WHERE id::text = e.lead_id::text AND tenant_id = e.tenant_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF e.event_type = 'lia.visita_agendada' THEN
    v_data := COALESCE(NULLIF(e.metadata ->> 'data', ''),
                       substring(e.descricao FROM 'em (\d{4}-\d{2}-\d{2})'))::date;
    v_hora := COALESCE(NULLIF(e.metadata ->> 'horario', ''),
                       substring(e.descricao FROM 'em \d{4}-\d{2}-\d{2} às (\d{2}:\d{2})'));
    v_emp  := COALESCE(NULLIF(e.metadata ->> 'empreendimento', ''),
                       substring(e.descricao FROM '^Visita ao (.*) em \d{4}-'));
    IF v_data IS NULL THEN RETURN; END IF;

    v_quem := public.membro_pelo_nome(e.tenant_id, substring(e.descricao FROM 'confirmação de (.*)$'));
    IF v_quem IS NULL THEN
      SELECT p.user_id INTO v_quem FROM public.pessoas_da_casa(e.tenant_id) p
       WHERE p.user_id::text = v_lead.assigned_agent_id;
    END IF;
    IF v_quem IS NULL THEN RETURN; END IF;
    SELECT email INTO v_email FROM auth.users WHERE id = v_quem;

    -- A mesma visita não entra duas vezes (a Lia às vezes repete o evento).
    IF EXISTS (
      SELECT 1 FROM agenda_eventos
       WHERE lead_uuid = v_lead.id AND tipo = 'visita_agendada'
         AND data = v_data AND horario IS NOT DISTINCT FROM v_hora
         AND status IN ('pendente', 'confirmado')
    ) THEN RETURN; END IF;

    INSERT INTO agenda_eventos
      (tenant_id, corretor_email, titulo, descricao, data, horario, tipo, status, prioridade,
       lead_uuid, lead_nome, lead_telefone)
    VALUES
      (e.tenant_id, v_email, 'Visita — ' || COALESCE(v_emp, 'imóvel'),
       'Marcada pela Lia.' || COALESCE(' Visita ' || v_visita || '.', ''),
       v_data, v_hora, 'visita_agendada', 'pendente', 'alta',
       v_lead.id, v_lead.name, v_lead.phone);
    RETURN;
  END IF;

  -- Remarcar / confirmar / recusar: a visita da Lia em aberto deste lead —
  -- a do mesmo visitaId quando ele vem; senão a mais recente.
  SELECT id INTO v_alvo FROM agenda_eventos
   WHERE lead_uuid = v_lead.id AND tipo = 'visita_agendada'
     AND status IN ('pendente', 'confirmado')
     AND descricao LIKE 'Marcada pela Lia.%'
     AND (v_visita IS NULL OR descricao LIKE '%Visita ' || v_visita || '.%')
   ORDER BY created_at DESC LIMIT 1;
  IF v_alvo IS NULL THEN RETURN; END IF;

  v_data := substring(e.descricao FROM 'para (\d{4}-\d{2}-\d{2}) às \d{2}:\d{2}')::date;
  v_hora := substring(e.descricao FROM 'para \d{4}-\d{2}-\d{2} às (\d{2}:\d{2})');

  UPDATE agenda_eventos SET
    status = CASE e.event_type
               WHEN 'lia.visita_recusada' THEN 'cancelado'
               WHEN 'lia.visita_confirmada' THEN 'confirmado'
               ELSE status END,
    data = COALESCE(v_data, data),
    horario = COALESCE(v_hora, horario),
    -- Data nova é prazo novo: os avisos voltam a valer para ela.
    due_soon_notified_at = CASE WHEN v_data IS NOT NULL THEN NULL ELSE due_soon_notified_at END,
    pending_notified_at  = CASE WHEN v_data IS NOT NULL THEN NULL ELSE pending_notified_at END,
    updated_at = now()
  WHERE id = v_alvo;
END;
$function$;

REVOKE ALL ON FUNCTION public.agenda_da_visita_da_lia(public.lead_events) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_visita_da_lia_na_agenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.agenda_da_visita_da_lia(NEW);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'visita da Lia não foi para a agenda (evento %): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_visita_da_lia_na_agenda ON public.lead_events;
CREATE TRIGGER tr_visita_da_lia_na_agenda
  AFTER INSERT ON public.lead_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('lia.visita_agendada', 'lia.visita_remarcada',
                           'lia.visita_confirmada', 'lia.visita_recusada'))
  EXECUTE FUNCTION public.tg_visita_da_lia_na_agenda();

-- Carga inicial: repassa as visitas das últimas duas semanas, em ordem, e
-- apaga o que ficou no passado — visita que já aconteceu viraria "pendente"
-- vencida na tela. `created_at = now()` é esta transação: só o que ela criou.
DO $$
DECLARE ev public.lead_events;
BEGIN
  FOR ev IN
    SELECT * FROM public.lead_events
     WHERE event_type IN ('lia.visita_agendada', 'lia.visita_remarcada',
                          'lia.visita_confirmada', 'lia.visita_recusada')
       AND created_at > now() - interval '14 days'
     ORDER BY created_at
  LOOP
    PERFORM public.agenda_da_visita_da_lia(ev);
  END LOOP;

  DELETE FROM public.agenda_eventos
   WHERE created_at = now() AND descricao LIKE 'Marcada pela Lia.%' AND data < current_date;
END $$;

COMMIT;
