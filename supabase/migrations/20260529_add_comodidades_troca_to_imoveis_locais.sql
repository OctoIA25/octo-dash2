-- Migration: Comodidades e aceita troca em imóveis locais
-- Data: 2026-05-29
-- Descrição: Adiciona comodidades (áreas comum/privativa) e flag de permuta,
--            espelhando o feed do Kenlo, para que cheguem ao feed VRSync (ZAP/OLX/VivaReal).

ALTER TABLE imoveis_locais
  ADD COLUMN IF NOT EXISTS area_comum JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS area_privativa JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aceita_troca BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_video TEXT,
  ADD COLUMN IF NOT EXISTS tour_virtual TEXT;

COMMENT ON COLUMN imoveis_locais.area_comum IS 'Comodidades da área comum/condomínio (array de strings). Espelha <area_comum> do XML Kenlo.';
COMMENT ON COLUMN imoveis_locais.area_privativa IS 'Comodidades da área privativa/unidade (array de strings). Espelha <area_privativa> do XML Kenlo.';
COMMENT ON COLUMN imoveis_locais.aceita_troca IS 'Imóvel aceita permuta/troca. Espelha <aceita_troca> do XML Kenlo. No feed VRSync vira <Feature>Aceita Permuta</Feature>.';
COMMENT ON COLUMN imoveis_locais.link_video IS 'URL de vídeo do YouTube (normalizada para watch?v=ID). No feed VRSync vira <Item medium="video"> dentro de <Media>.';
COMMENT ON COLUMN imoveis_locais.tour_virtual IS 'URL do tour virtual 360° (qualquer provedor). No feed VRSync vira <Item medium="virtual_tour"> dentro de <Media>.';
