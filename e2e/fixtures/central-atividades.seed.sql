-- Fixture do e2e de performance da Central de Atividades (P0.7).
-- SÓ no Supabase local.
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f e2e/fixtures/central-atividades.seed.sql
--
-- 40 atividades ligadas a 40 dos 1.655 leads do tenant de teste. É o cenário
-- do defeito: a tela mostra dezenas de linhas e baixava a base inteira para
-- escrever o nome do cliente em cada uma.

BEGIN;

DELETE FROM public.agenda_eventos
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a'
   AND titulo LIKE 'Perf %';

INSERT INTO public.agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, prioridade,
                                   lead_uuid, lead_nome, lead_telefone)
SELECT 'e2e00000-0000-4000-a000-00000000000a',
       'e2e.local@octo.dev',
       'Perf ' || row_number() OVER (ORDER BY l.id),
       current_date + (((row_number() OVER (ORDER BY l.id)) % 5 - 2))::int,
       '09:00',
       'tarefa', 'pendente', 'media',
       l.id, l.name, l.phone
  FROM (SELECT id, name, phone FROM public.leads
         WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a' AND archived_at IS NULL
         ORDER BY created_at DESC LIMIT 40) l;

COMMIT;

SELECT count(*) AS atividades, count(lead_uuid) AS com_lead
  FROM public.agenda_eventos
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a';
