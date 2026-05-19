ALTER TABLE IF EXISTS public.tarefas_semanais
  ADD COLUMN IF NOT EXISTS agenda_evento_id UUID;

DO $$
BEGIN
  IF to_regclass('public.tarefas_semanais') IS NOT NULL
     AND to_regclass('public.agenda_eventos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'tarefas_semanais_agenda_evento_id_fkey'
     ) THEN
    ALTER TABLE public.tarefas_semanais
      ADD CONSTRAINT tarefas_semanais_agenda_evento_id_fkey
      FOREIGN KEY (agenda_evento_id)
      REFERENCES public.agenda_eventos(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.tarefas_semanais') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tarefas_semanais_agenda_evento_id
      ON public.tarefas_semanais(agenda_evento_id);
  END IF;
END $$;
