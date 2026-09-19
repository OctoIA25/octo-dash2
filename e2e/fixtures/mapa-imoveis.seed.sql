-- Fixture do e2e do Mapa de Imóveis (P0.1). SÓ no Supabase local.
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f e2e/fixtures/mapa-imoveis.seed.sql
--
-- Reproduz o cenário medido na Lotus Brokers em 18/09/2026: a imobiliária NÃO
-- tem catálogo XML (tenant_xml_config com xml_url vazio e backup_data nulo),
-- e os imóveis vivem em `imoveis_locais` — a tabela que o Mapa não consultava.
--
-- As coordenadas já vêm resolvidas em `imoveis_geolocalizacao` para o teste
-- não depender do Nominatim (serviço externo, 1 requisição por segundo).

BEGIN;

DELETE FROM public.imoveis_geolocalizacao
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a' AND referencia LIKE 'MAP%';
DELETE FROM public.imoveis_locais
 WHERE tenant_id = 'e2e00000-0000-4000-a000-00000000000a' AND codigo_imovel LIKE 'MAP%';

-- O mesmo estado da Lotus: integração XML desligada.
INSERT INTO public.tenant_xml_config (tenant_id, xml_url, imoveis_count)
VALUES ('e2e00000-0000-4000-a000-00000000000a', '', 0)
ON CONFLICT (tenant_id) DO UPDATE SET xml_url = '', imoveis_count = 0, backup_data = NULL;

-- 4 imóveis aprovados + 1 rascunho (que NÃO pode aparecer no mapa).
-- O gatilho tg_valida_publicacao_imovel exige proprietário e logradouro/número
-- para status 'aprovado' — por isso os campos abaixo.
INSERT INTO public.imoveis_locais (tenant_id, codigo_imovel, titulo, tipo, finalidade,
                                   bairro, cidade, estado, cep, logradouro, numero,
                                   proprietario_nome, proprietario_telefone, status_aprovacao)
VALUES
  ('e2e00000-0000-4000-a000-00000000000a','MAP001','Casa no Centro','Casa','venda','Centro','Jundiaí','SP','13201-000','Rua Barão de Jundiaí','100','Proprietario Teste 1','11990000001','aprovado'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP002','Apto Anhangabaú','Apartamento','venda','Anhangabaú','Jundiaí','SP','13208-000','Av Nove de Julho','200','Proprietario Teste 2','11990000002','aprovado'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP003','Sala Vila Arens','Sala','locacao','Vila Arens','Jundiaí','SP','13201-800','Rua Rangel Pestana','300','Proprietario Teste 3','11990000003','aprovado'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP004','Terreno Eloy Chaves','Terreno','venda','Parque Eloy Chaves','Jundiaí','SP','13212-000','Av Antonio Pincinato','400','Proprietario Teste 4','11990000004','aprovado'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP005','RASCUNHO nao deve aparecer','Casa','venda','Centro','Jundiaí','SP','13201-000','Rua do Rascunho','500','Proprietario Teste 5','11990000005','rascunho');

-- Coordenadas já resolvidas para os 4 aprovados (e uma para o rascunho, de
-- propósito: se ele aparecer no mapa, é defeito do filtro, não falta de coordenada).
INSERT INTO public.imoveis_geolocalizacao (tenant_id, referencia, latitude, longitude, geo_status, source, confidence)
VALUES
  ('e2e00000-0000-4000-a000-00000000000a','MAP001',-23.1857,-46.8978,'resolved','nominatim','low'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP002',-23.1901,-46.8845,'resolved','nominatim','low'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP003',-23.1795,-46.8912,'resolved','nominatim','low'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP004',-23.2104,-46.9231,'resolved','nominatim','low'),
  ('e2e00000-0000-4000-a000-00000000000a','MAP005',-23.1857,-46.8978,'resolved','nominatim','low');

COMMIT;

SELECT (SELECT count(*) FROM public.imoveis_locais
         WHERE tenant_id='e2e00000-0000-4000-a000-00000000000a' AND codigo_imovel LIKE 'MAP%') AS imoveis,
       (SELECT count(*) FROM public.imoveis_geolocalizacao
         WHERE tenant_id='e2e00000-0000-4000-a000-00000000000a' AND referencia LIKE 'MAP%') AS coordenadas;
