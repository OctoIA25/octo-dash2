-- 🔎 Diagnóstico: feed XML compartilhado entre tenants
-- Os dois tenants abaixo estão com a MESMA xml_url em tenant_xml_config,
-- por isso importam os mesmos imóveis (vazamento na aba "Meus Imóveis").
-- Rode no SQL Editor do Supabase para decidir qual é o dono legítimo.

-- 1) Quem são os dois tenants e qual config de XML cada um tem
select
  t.id                                  as tenant_id,
  t.name                                as tenant_nome,
  c.xml_url,
  c.imoveis_count,
  c.last_sync_at,
  (c.backup_data is not null)           as tem_backup,
  c.backup_at
from tenants t
left join tenant_xml_config c on c.tenant_id = t.id
where t.id in (
  '65c69875-dc83-4062-90f6-6f6adc30df26',
  '656d7d4d-0bcf-43c2-a078-258ff6c1eb7e'
);

-- 2) Tamanho da contaminação: quantas atribuições e corretores cada tenant tem
select
  tenant_id,
  count(*)                              as atribuicoes_imoveis_corretores
from imoveis_corretores
where tenant_id in (
  '65c69875-dc83-4062-90f6-6f6adc30df26',
  '656d7d4d-0bcf-43c2-a078-258ff6c1eb7e'
)
group by tenant_id;

select
  tenant_id,
  source,
  count(*)                             as corretores
from tenant_brokers
where tenant_id in (
  '65c69875-dc83-4062-90f6-6f6adc30df26',
  '656d7d4d-0bcf-43c2-a078-258ff6c1eb7e'
)
group by tenant_id, source
order by tenant_id, source;

-- 3) (Opcional) Há OUTROS tenants compartilhando feeds? Visão geral.
select xml_url, count(*) as qtd_tenants, array_agg(tenant_id) as tenants
from tenant_xml_config
where coalesce(xml_url, '') <> ''
group by xml_url
having count(*) > 1
order by qtd_tenants desc;
