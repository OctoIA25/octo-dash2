-- =============================================================================
-- De-para anúncio do portal -> código do lançamento (L001, L002, ...).
--
-- POR QUE ESTA TABELA EXISTE
-- O ZAP/Grupo OLX manda no webhook `clientListingId` (ex.: 'OFOUFJ') e
-- `originListingId` (ex.: '2894694297'). Nenhum dos dois casa com o catálogo do
-- CRM, e é por isso que a regra de classificação abstém todo lead de ZAP
-- (`indefinido`, ver 20260815_add_lead_classification.sql §4). A equipe passou a
-- numerar os anúncios de lançamento como L001..L0NN; esta tabela é o de-para
-- entre o id do anúncio no portal e esse código.
--
-- Medido no lead de teste de 03/set: o payload do ZAP tem 14 campos e NENHUM
-- deles é a descrição ou o título do anúncio — o código L0NN não chega pelo
-- texto. `originListingId` chega, e é único por anúncio. Ele é a chave.
--
-- A LISTA É DADO, NÃO CÓDIGO: anúncio novo entra com um INSERT aqui, sem
-- deploy. O seed abaixo são os 31 anúncios da planilha "relacao lancamentos"
-- (02/set/2026, tenant Lotus Brokers) — a lista ainda vai crescer.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lancamento_anuncios (
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Id do anúncio no portal. Hoje é sempre o `originListingId` do Grupo OLX
  -- (numérico, o mesmo que aparece como `id-2894694297` na URL do anúncio).
  origin_listing_id text NOT NULL,
  -- Código do lançamento como a equipe o usa: 'L001', 'L002', ...
  codigo            text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, origin_listing_id)
);

-- O trigger de classificação pergunta "este código é de lançamento?" — busca
-- por (tenant_id, codigo), não pela PK.
CREATE INDEX IF NOT EXISTS lancamento_anuncios_codigo_idx
  ON public.lancamento_anuncios (tenant_id, codigo);

-- Dois anúncios diferentes PODEM apontar para o mesmo lançamento (o mesmo
-- empreendimento anunciado em tipologias diferentes), então `codigo` não é
-- único de propósito. O que não pode é o mesmo anúncio ter dois códigos — isso
-- a PK já garante.

COMMENT ON TABLE public.lancamento_anuncios IS
  'De-para originListingId (ZAP/Grupo OLX) -> código do lançamento (L0NN). Alimenta o webhook e a classificação automática.';

-- RLS ligada SEM POLICY: hoje quem lê é só o servidor (service_role, que passa
-- por cima da RLS). Sem policy, anon e usuário logado não leem nada — que é o
-- correto enquanto não existe tela para isso. Ver [[rls-leads-aberta-ao-anon]].
ALTER TABLE public.lancamento_anuncios ENABLE ROW LEVEL SECURITY;

-- ---------- Seed: planilha "relacao lancamentos", 02/set/2026 ----------
-- ON CONFLICT DO NOTHING: reaplicar a migration não sobrescreve correção feita
-- à mão no banco.
INSERT INTO public.lancamento_anuncios (tenant_id, origin_listing_id, codigo) VALUES
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2896047789', 'L001'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894696888', 'L002'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894694297', 'L003'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894402723', 'L004'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894401982', 'L005'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894414974', 'L006'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894417480', 'L007'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2893426477', 'L008'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2893879977', 'L009'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894412593', 'L010'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2893875194', 'L011'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2893665477', 'L012'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2893878173', 'L013'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2893866801', 'L014'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894438608', 'L015'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894455286', 'L016'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894461081', 'L017'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2895805877', 'L018'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2895804815', 'L019'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2895811588', 'L020'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2895809889', 'L021'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2896759300', 'L022'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2896750796', 'L023'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2896228002', 'L024'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2896749014', 'L025'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894421097', 'L026'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2888227911', 'L027'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2896751679', 'L028'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2896753708', 'L029'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894431997', 'L030'),
  ('65c69875-dc83-4062-90f6-6f6adc30df26'::uuid, '2894452674', 'L031')
ON CONFLICT (tenant_id, origin_listing_id) DO NOTHING;
-- =============================================================================
-- ROLLBACK
--   DROP TABLE IF EXISTS public.lancamento_anuncios;
-- =============================================================================
