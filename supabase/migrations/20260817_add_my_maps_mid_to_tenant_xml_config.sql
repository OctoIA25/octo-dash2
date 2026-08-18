-- Mapa curado (Google My Maps) por tenant.
-- Cada imobiliária cadastra o mid do seu próprio mapa; NULL = aba "Curado" não aparece.
ALTER TABLE public.tenant_xml_config
  ADD COLUMN IF NOT EXISTS my_maps_mid text;

COMMENT ON COLUMN public.tenant_xml_config.my_maps_mid IS
  'ID do mapa do Google My Maps (parâmetro mid). O mapa precisa estar compartilhado como "qualquer pessoa com o link".';

-- A tabela deixou de ser "config do feed XML" para ser "config de catálogo do tenant":
-- dá para ter mapa curado sem ter feed Kenlo. O único leitor de xml_url já trata
-- ausência (imoveisXmlService: `if (config?.xml_url)`).
ALTER TABLE public.tenant_xml_config
  ALTER COLUMN xml_url DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
