-- 🧹 Limpeza do feed XML duplicado
-- Dono LEGÍTIMO do feed ValueGaia : 656d7d4d-0bcf-43c2-a078-258ff6c1eb7e
-- Tenant INTRUSO (config errada)  : 65c69875-dc83-4062-90f6-6f6adc30df26
--
-- A limpeza acontece SOMENTE no tenant intruso. O tenant legítimo não é tocado.
-- Rode por etapas no SQL Editor do Supabase. Os blocos de alteração estão dentro
-- de uma transação: confira os números nos previews e só então faça COMMIT.

-- ===================================================================
-- STEP 0 — PREVIEW (somente leitura): dimensão da contaminação
-- ===================================================================

-- 0a. Config atual do tenant intruso
select tenant_id, xml_url, imoveis_count, (backup_data is not null) as tem_backup
from tenant_xml_config
where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26';

-- 0b. Atribuições do intruso que VIERAM do feed compartilhado
--     (códigos que também existem no tenant legítimo)
select count(*) as atribuicoes_contaminadas
from imoveis_corretores ic_intruso
where ic_intruso.tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
  and ic_intruso.codigo_imovel in (
    select codigo_imovel from imoveis_corretores
    where tenant_id = '656d7d4d-0bcf-43c2-a078-258ff6c1eb7e'
  );

-- 0c. Atribuições do intruso que NÃO estão no legítimo (possíveis dados próprios — NÃO serão apagadas)
select count(*) as atribuicoes_proprias_preservadas
from imoveis_corretores ic_intruso
where ic_intruso.tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
  and ic_intruso.codigo_imovel not in (
    select codigo_imovel from imoveis_corretores
    where tenant_id = '656d7d4d-0bcf-43c2-a078-258ff6c1eb7e'
  );

-- 0d. Corretores do intruso criados via XML (candidatos a remoção)
select id, name, email, source, auth_user_id
from tenant_brokers
where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
  and source = 'xml';


-- ===================================================================
-- STEP 1 — Corrigir a FONTE (config). Sem isto, o cache recontamina.
-- Limpa a URL e o backup do intruso. xml_url é NOT NULL, então usamos string
-- vazia ('') — o app trata '' como "sem feed". Se este tenant tiver um feed
-- PRÓPRIO, troque '' pela URL correta em vez de limpar.
-- ===================================================================
begin;

update tenant_xml_config
set xml_url = '',
    backup_data = null,
    imoveis_count = 0
where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
  and xml_url = 'https://imob.valuegaia.com.br/integra/midia.ashx?midia=GaiaWebServiceImovel&p=S%2fsarRpwsyxYFpUGdzKym40cmz3sXmlgUut9dHvbxvk%3d';

-- confira: deve afetar 1 linha
-- commit;   -- descomente para confirmar, ou rollback; para cancelar


-- ===================================================================
-- STEP 2 — Remover as atribuições contaminadas do intruso
-- (apenas códigos que também existem no tenant legítimo)
-- ===================================================================
begin;

-- preview do que será apagado
select tenant_id, codigo_imovel, corretor_nome
from imoveis_corretores
where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
  and codigo_imovel in (
    select codigo_imovel from imoveis_corretores
    where tenant_id = '656d7d4d-0bcf-43c2-a078-258ff6c1eb7e'
  );

delete from imoveis_corretores
where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
  and codigo_imovel in (
    select codigo_imovel from imoveis_corretores
    where tenant_id = '656d7d4d-0bcf-43c2-a078-258ff6c1eb7e'
  );

-- confira a contagem apagada vs. o preview do STEP 0b
-- commit;   -- ou rollback;


-- ===================================================================
-- STEP 3 (OPCIONAL) — Remover corretores criados pelo feed alheio
-- Revise o STEP 0d antes. NÃO apaga usuários de auth (globais), só o vínculo
-- com este tenant. Faça por último e com cautela.
-- ===================================================================
-- begin;
--
-- -- remover memberships desses corretores neste tenant
-- delete from tenant_memberships
-- where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
--   and user_id in (
--     select auth_user_id from tenant_brokers
--     where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
--       and source = 'xml' and auth_user_id is not null
--   );
--
-- -- remover os corretores XML deste tenant
-- delete from tenant_brokers
-- where tenant_id = '65c69875-dc83-4062-90f6-6f6adc30df26'
--   and source = 'xml';
--
-- commit;   -- ou rollback;
