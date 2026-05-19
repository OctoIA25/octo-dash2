CREATE OR REPLACE FUNCTION public.sync_tarefa_semanal_from_agenda_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data DATE;
  v_dia_semana INTEGER;
  v_semana_an INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.tarefas_semanais
    WHERE agenda_evento_id = OLD.id;

    RETURN OLD;
  END IF;

  IF NEW.data IS NULL THEN
    RETURN NEW;
  END IF;

  v_data := NEW.data::DATE;
  v_dia_semana := EXTRACT(ISODOW FROM v_data)::INTEGER;
  v_semana_an := EXTRACT(YEAR FROM v_data)::INTEGER * 100
    + GREATEST(
      1,
      CEIL(
        (
          v_data - make_date(EXTRACT(YEAR FROM v_data)::INTEGER, 1, 1)
        )::NUMERIC / 7
      )::INTEGER
    );

  UPDATE public.tarefas_semanais AS ts
  SET
    titulo = NEW.titulo,
    descricao = NEW.descricao,
    prioridade = CASE NEW.prioridade
      WHEN 'alta' THEN 'alta'
      WHEN 'baixa' THEN 'baixa'
      ELSE 'media'
    END,
    semana_an = v_semana_an,
    dia_semana = v_dia_semana,
    data_especifica = v_data,
    dados_recorrencia = jsonb_set(
      COALESCE(ts.dados_recorrencia, '{}'::JSONB),
      '{horario}',
      COALESCE(to_jsonb(NEW.horario), 'null'::JSONB),
      TRUE
    ),
    concluida = COALESCE(NEW.status = 'concluido', FALSE),
    data_conclusao = CASE
      WHEN NEW.status = 'concluido' THEN COALESCE(ts.data_conclusao, NOW())
      ELSE NULL
    END,
    ordem = CASE
      WHEN ts.semana_an IS DISTINCT FROM v_semana_an
        OR ts.dia_semana IS DISTINCT FROM v_dia_semana
      THEN (
        SELECT COALESCE(MAX(tarefa_dia.ordem), -1) + 1
        FROM public.tarefas_semanais AS tarefa_dia
        WHERE tarefa_dia.tenant_id = ts.tenant_id
          AND tarefa_dia.user_id = ts.user_id
          AND tarefa_dia.semana_an = v_semana_an
          AND tarefa_dia.dia_semana = v_dia_semana
          AND tarefa_dia.id <> ts.id
      )
      ELSE ts.ordem
    END,
    atualizado_em = NOW()
  WHERE ts.agenda_evento_id = NEW.id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.tarefas_semanais') IS NOT NULL
     AND to_regclass('public.agenda_eventos') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'tarefas_semanais_agenda_evento_id_fkey'
        AND conrelid = 'public.tarefas_semanais'::REGCLASS
    ) THEN
      ALTER TABLE public.tarefas_semanais
        DROP CONSTRAINT tarefas_semanais_agenda_evento_id_fkey;
    END IF;

    ALTER TABLE public.tarefas_semanais
      ADD CONSTRAINT tarefas_semanais_agenda_evento_id_fkey
      FOREIGN KEY (agenda_evento_id)
      REFERENCES public.agenda_eventos(id)
      ON DELETE CASCADE;

    DROP TRIGGER IF EXISTS trigger_sync_tarefa_semanal_from_agenda_update
      ON public.agenda_eventos;
    DROP TRIGGER IF EXISTS trigger_sync_tarefa_semanal_from_agenda_delete
      ON public.agenda_eventos;

    CREATE TRIGGER trigger_sync_tarefa_semanal_from_agenda_update
      AFTER UPDATE OF titulo, descricao, data, horario, status, prioridade
      ON public.agenda_eventos
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_tarefa_semanal_from_agenda_evento();

    CREATE TRIGGER trigger_sync_tarefa_semanal_from_agenda_delete
      BEFORE DELETE
      ON public.agenda_eventos
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_tarefa_semanal_from_agenda_evento();

    ALTER TABLE public.tarefas_semanais REPLICA IDENTITY FULL;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tarefas_semanais;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.tarefas_semanais') IS NOT NULL
     AND to_regclass('public.agenda_eventos') IS NOT NULL THEN
    WITH candidatos AS (
      SELECT
        ts.id AS tarefa_id,
        (ARRAY_AGG(ae.id))[1] AS agenda_evento_id
      FROM public.tarefas_semanais AS ts
      JOIN public.agenda_eventos AS ae
        ON ae.tenant_id::TEXT = ts.tenant_id::TEXT
       AND ae.corretor_id::TEXT = ts.user_id::TEXT
       AND ae.tipo = 'tarefa'
       AND ae.titulo = ts.titulo
       AND ae.data::DATE = ts.data_especifica::DATE
      WHERE ts.agenda_evento_id IS NULL
      GROUP BY ts.id
      HAVING COUNT(*) = 1
    )
    UPDATE public.tarefas_semanais AS ts
    SET
      agenda_evento_id = candidatos.agenda_evento_id,
      atualizado_em = NOW()
    FROM candidatos
    WHERE ts.id = candidatos.tarefa_id;
  END IF;
END $$;
