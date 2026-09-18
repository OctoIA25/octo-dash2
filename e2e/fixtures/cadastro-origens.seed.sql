-- Fixture do e2e do cadastro de origens (P0.4).
-- SÓ no Supabase LOCAL: reescreve a coluna `source` dos leads do tenant de teste.
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f e2e/fixtures/cadastro-origens.seed.sql
--
-- Reproduz o defeito que o P0.4 relata, com os textos EXATOS de produção:
-- a mesma LIA escrita de três formas e a construtora com duas capitalizações.

BEGIN;

DELETE FROM public.tenant_lead_origin_map
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a';
DELETE FROM public.tenant_lead_origins
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a';

WITH numerados AS (
  SELECT id, row_number() OVER (ORDER BY id) AS n
    FROM public.leads
   WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a'
)
UPDATE public.leads l
   SET source = CASE
         WHEN n <=  8 THEN 'Lia (Japi Terceiros)'
         WHEN n <= 12 THEN 'Lia (Lotus Brokers)'
         WHEN n <= 14 THEN 'Lia · teste'
         WHEN n <= 20 THEN 'Santa Angela'
         WHEN n <= 22 THEN 'santa angela'
         ELSE 'ZAP Imoveis'
       END
  FROM numerados
 WHERE l.id = numerados.id;

COMMIT;

SELECT source, count(*) FROM public.leads
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a'
 GROUP BY source ORDER BY 2 DESC;
