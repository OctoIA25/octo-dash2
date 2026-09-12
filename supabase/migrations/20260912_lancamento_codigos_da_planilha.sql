-- =============================================================================
-- Os códigos da planilha "Links anúncios Lançamentos" (11/set/2026) em cada
-- lançamento do tenant Lótus Brokers.
--
-- DE ONDE VEM: a planilha lista um código por ANÚNCIO do ZAP (código, nome do
-- empreendimento, link com o id do anúncio). Os ids conferem com os de
-- `lancamento_anuncios` — é a mesma planilha que semeou o de-para em 03/set.
-- O que ela acrescenta é o que faltava: de que EMPREENDIMENTO é cada código.
--
-- O nome da planilha não é o nome do cadastro ('Giovialle' x 'Gioviale',
-- 'Nexos Residence' x 'Nexus'), então o de-para foi conferido um a um por
-- bairro/cidade/construtora do anúncio contra o cadastro — por isso o UPDATE é
-- por id, com o nome da planilha no comentário de cada linha.
--
-- TRÊS CÓDIGOS FICAM DE FORA porque o empreendimento não existe em
-- `lancamentos`: L018 (Essence By Tebas), L021 (Ávora) e L022 (Vistta Bela,
-- Cajamar). Lead desses anúncios continua chegando com o código cru, como hoje
-- — cadastrar o empreendimento e preencher o código na tela resolve. Chutar um
-- parecido mandaria o corretor para o empreendimento errado.
--
-- Idempotente: reaplicar grava os mesmos valores, e a linha só é tocada se
-- mudou. A planilha é a fonte: rode antes de alguém editar códigos na tela.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

WITH planilha(id, codigos) AS (VALUES
  ('a9893011-be73-4b19-8d55-a7946f143964'::uuid, ARRAY['L001']),  -- Villa Itália
  ('187d4b94-51cf-4b4f-9127-80c0d2c3a296'::uuid, ARRAY['L002']),  -- Residencial Bellacqua
  ('1e11b93d-c79c-49b1-b274-e75d3d7d7672'::uuid, ARRAY['L003']),  -- Altíssimi
  ('54faa312-478a-4731-83fc-d43a282214ee'::uuid, ARRAY['L004']),  -- Lago da Samambaia
  ('1929cab8-510b-42e9-b30a-33a1dcd43822'::uuid, ARRAY['L005']),  -- Terrace Serra do Japi
  ('a912ac87-90ab-4587-b209-db6361941a81'::uuid, ARRAY['L006']),  -- Vitale Fernandes
  ('9ce7ac73-0e04-4490-9604-eef12f4ed8cb'::uuid, ARRAY['L007']),  -- Vista Castanho
  ('3f1d5425-aa78-4077-ba97-f405374e57e9'::uuid, ARRAY['L008']),  -- Portal dos Lagos
  ('24860ab4-e86d-4344-af47-652b53201cd5'::uuid, ARRAY['L009']),  -- Resort Prime
  ('e0b7ab97-8dce-4f1c-a6fe-178bc70ab411'::uuid, ARRAY['L010']),  -- Villaggio Engordadouro
  ('1e20bd63-6e81-4255-9d0f-d227ef847250'::uuid, ARRAY['L011']),  -- Altos da Avenida
  ('c1e5b898-dea5-4ca2-b87e-17005619745e'::uuid, ARRAY['L012', 'L023', 'L025', 'L028', 'L029']),  -- Reserva Castanheira (5 anuncios)
  ('7ce43757-a06f-415b-b04c-6adbf53b1e61'::uuid, ARRAY['L013']),  -- Santorini
  ('08ae2e4d-3655-42be-ad30-93591efadbc6'::uuid, ARRAY['L014']),  -- Giovialle
  ('71fbf50c-6c40-4016-b806-15c4abc05f01'::uuid, ARRAY['L015']),  -- Avelã Vila Residencial
  ('1409b51b-d890-44a8-bea5-770ec6f7aace'::uuid, ARRAY['L016']),  -- Nexos Residence
  ('6bedc51f-8654-4b35-bd89-cbf8cccfa129'::uuid, ARRAY['L017']),  -- Sollegiato
  ('fa4c01f1-03f1-4503-8887-7972fd9b7685'::uuid, ARRAY['L019']),  -- Authoria By Tebas
  ('3fa12af5-8a6b-4020-852c-e2704aaa132f'::uuid, ARRAY['L020']),  -- Terras da Alvorada
  ('990cdad9-c258-4eb6-96c8-35c9e5fcdfba'::uuid, ARRAY['L024']),  -- Vallis Residencial
  ('5c32a490-c147-466a-aff1-eb2fef14aa6f'::uuid, ARRAY['L026']),  -- Gran Ville Santo Angelo
  ('8e4e84f9-43cd-44bc-9dc9-5b4b590183f5'::uuid, ARRAY['L027']),  -- Auten Jundiaí
  ('5f4ae161-de7c-46c5-9e90-42db68ea8d0a'::uuid, ARRAY['L030']),  -- Allegrato
  ('a517b0bd-2eb7-4993-8fa8-7da448839e63'::uuid, ARRAY['L031'])   -- Maitá Residencial
)
UPDATE public.lancamentos l
   SET codigos = p.codigos,
       updated_at = now()
  FROM planilha p
 WHERE l.id = p.id
   AND l.tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid
   AND l.codigos IS DISTINCT FROM p.codigos;

DO $$
DECLARE v_lanc int; v_cod int;
BEGIN
  SELECT count(*), coalesce(sum(array_length(codigos, 1)), 0)
    INTO v_lanc, v_cod
    FROM public.lancamentos
   WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid AND codigos IS NOT NULL;
  RAISE NOTICE 'lançamentos com código: % (esperado 24) | códigos: % (esperado 28)', v_lanc, v_cod;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--   UPDATE public.lancamentos SET codigos = NULL
--    WHERE tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'::uuid;
-- =============================================================================
