-- =============================================================================
-- Limpeza one-off das duplicatas de leads Santa Ângela — tenant Lotus Brokers.
--
-- ORIGEM DO PROBLEMA (corrigido no código em 2975a09): getExisting devolvia
-- sets VAZIOS quando a leitura falhava (statement timeout) e o sync re-inseria
-- a página 1 inteira como leads novos, a cada ciclo com falha. Resultado em
-- prod: 2.006 linhas Santa Ângela para 1.306 leads reais — 700 linhas
-- excedentes, com até 7 cópias do mesmo source_lead_id (as extras com phone
-- null, fallback do conflito unique_phone_per_tenant).
--
-- QUAL LINHA FICA, por source_lead_id: a que tem telefone > a referenciada no
-- bolsão > a mais antiga. Os grupos "ambíguos" (mais de uma linha com
-- telefone) são o MESMO número com e sem "+", então a escolha é indiferente.
--
-- DEPENDÊNCIAS, medidas antes de escrever isto:
--   bolsao.source_lead_id    700 (1:1 com as condenadas) -> apagadas junto
--   webhook_events.source_id 700                         -> apagados junto
--   proposals.lead_id          6 -> ver abaixo
--   whatsapp_conversations     3 -> repontadas (lead_id não tem FK nem unique)
--
-- PROPOSTAS: o trigger tr_leads_mirror_to_proposals cria uma proposta a cada
-- INSERT de lead, então cada cópia gerou a sua. Todas as 6 condenadas têm
-- rival na linha mantida (proposals tem UNIQUE (tenant_id, lead_id)), logo
-- repontar viola a constraint — foi o erro 23505 na primeira tentativa. O diff
-- campo a campo mostrou que 5 são idênticas à mantida (ELAINE x3, LUCIANO e
-- JULIO — estas duas só diferem em created_by, null na condenada) e 1
-- (LERIANE) tem property_reference que a mantida não tem. Então: preserva o
-- property_reference, reponta o que puder, apaga o resto.
--
-- Transacional: qualquer erro aborta tudo. O DO block aborta se o volume
-- divergir do esperado (~700).
-- =============================================================================

BEGIN;

CREATE TEMP TABLE sa_dedup AS
WITH ranked AS (
  SELECT l.id, l.source_lead_id,
         ROW_NUMBER() OVER (
           PARTITION BY l.source_lead_id
           ORDER BY (l.phone IS NOT NULL) DESC,
                    EXISTS (SELECT 1 FROM public.bolsao b WHERE b.source_lead_id = l.id) DESC,
                    l.created_at ASC) AS rn
  FROM public.leads l
  WHERE l.tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
    AND l.source = 'Santa Angela'
)
SELECT r.id AS doomed_id,
       (SELECT k.id FROM ranked k
         WHERE k.source_lead_id = r.source_lead_id AND k.rn = 1) AS keep_id
FROM ranked r
WHERE r.rn > 1;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM sa_dedup;
  IF n NOT BETWEEN 600 AND 800 THEN
    RAISE EXCEPTION 'volume inesperado (% linhas a apagar), abortando', n;
  END IF;
  RAISE NOTICE 'linhas a apagar: %', n;
END $$;

-- 1) preserva property_reference que só existe na proposta da linha condenada
UPDATE public.proposals k
   SET property_reference = d.property_reference
  FROM public.proposals d
  JOIN sa_dedup s ON s.doomed_id = d.lead_id
 WHERE k.lead_id = s.keep_id
   AND COALESCE(k.property_reference, '') = ''
   AND COALESCE(d.property_reference, '') <> '';

-- 2) proposta condenada cujo destino está LIVRE: reponta (uma por destino,
--    senão o UNIQUE (tenant_id, lead_id) estoura)
WITH cand AS (
  SELECT DISTINCT ON (s.keep_id) p.id, s.keep_id
    FROM public.proposals p
    JOIN sa_dedup s ON s.doomed_id = p.lead_id
   WHERE NOT EXISTS (SELECT 1 FROM public.proposals x WHERE x.lead_id = s.keep_id)
   ORDER BY s.keep_id, p.created_at
)
UPDATE public.proposals p
   SET lead_id = c.keep_id
  FROM cand c
 WHERE p.id = c.id;

-- 3) o que sobrou são espelhos redundantes do trigger (a mantida já tem a sua)
DELETE FROM public.proposals p USING sa_dedup s WHERE p.lead_id = s.doomed_id;

-- 4) conversas: sem FK e sem unique em lead_id, reponta todas
UPDATE public.whatsapp_conversations w
   SET lead_id = s.keep_id
  FROM sa_dedup s
 WHERE w.lead_id = s.doomed_id;

-- 5) espelhos do bolsão e eventos das linhas condenadas
DELETE FROM public.bolsao b USING sa_dedup s WHERE b.source_lead_id = s.doomed_id;
DELETE FROM public.webhook_events e USING sa_dedup s
 WHERE e.source_table = 'leads' AND e.source_id = s.doomed_id::text;

-- 6) as duplicatas
DELETE FROM public.leads l USING sa_dedup s WHERE l.id = s.doomed_id;

-- verificação: linhas e distintos devem ser IGUAIS (1.306)
SELECT count(*) AS linhas, count(DISTINCT source_lead_id) AS distintos
FROM public.leads
WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
  AND source = 'Santa Angela';

COMMIT;
