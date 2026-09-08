-- Opt-out de marca d'água POR IMÓVEL: fotos que já chegam marcadas (fotógrafo,
-- construtora, portal) não devem receber a marca do tenant de novo — senão fica
-- marca duplicada. Lido em server/watermark/service.js (ensureDerivative), que
-- mapeia property_photos.property_id -> imoveis_locais.codigo_imovel.
-- Default false = comportamento atual (aplica a marca).
ALTER TABLE public.imoveis_locais
  ADD COLUMN IF NOT EXISTS sem_marca_dagua boolean NOT NULL DEFAULT false;
