-- Volume realista para medir a Central de Atividades e a ficha do negócio (P0.7).
-- SÓ no Supabase local.
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f e2e/fixtures/volume-leads.seed.sql
--
-- Leva o tenant de teste aos 1.655 leads não arquivados da Lotus — o volume em
-- que o defeito aparece. A origem é uma só e DISTINTA das origens reais, para
-- não mexer nas contagens de `cadastro-origens.seed.sql`, que usa o mesmo
-- tenant.

BEGIN;

DELETE FROM public.leads
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a'
   AND name LIKE 'Volume %';

INSERT INTO public.leads (tenant_id, name, phone, email, source, status, temperature,
                          property_code, property_value, assigned_agent_name, comments,
                          lead_type, created_at, updated_at, assigned_at)
SELECT 'e2e00000-0000-4000-a000-00000000000a',
       'Volume ' || n,
       '1199' || lpad(n::text, 7, '0'),
       'volume' || n || '@exemplo.com.br',
       'Carga de volume',
       (ARRAY['Novos Leads','Interação','Negociação','Visita Agendada','Proposta Enviada'])[1 + n % 5],
       (ARRAY['Quente','Morno','Frio'])[1 + n % 3],
       'IM' || lpad(n::text, 5, '0'),
       250000 + (n % 40) * 25000,
       (ARRAY['Ana Souza','Bruno Lima','Carla Dias','Não atribuído'])[1 + n % 4],
       'Cliente pediu retorno no periodo da tarde.',
       1,
       now() - (n || ' hours')::interval,
       now() - (n || ' hours')::interval,
       now() - (n || ' hours')::interval
  FROM generate_series(1, 1631) AS n;

COMMIT;

SELECT count(*) AS leads_nao_arquivados,
       count(*) FILTER (WHERE source = 'Carga de volume') AS de_volume
  FROM public.leads
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a' AND archived_at IS NULL;
