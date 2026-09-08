-- Conferência do backfill de recrutamento. Só leitura.
select 'legado (recruitment_candidates)' as fonte, count(*) as linhas from public.recruitment_candidates
union all
select 'legado — histórico (recruitment_stages)', count(*) from public.recruitment_stages
union all
select 'novo (recrut_candidato)', count(*) from public.recrut_candidato
union all
select 'novo — migrados do legado', count(*) from public.recrut_candidato
 where observacoes like '%Migrado de recruitment_candidates%'
union all
select 'legado que NÃO migrou (telefone inválido/ausente)', count(*) from public.recruitment_candidates
 where tenant_id is null or length(public.recrut_norm_phone(telefone)) not between 12 and 15;

-- De-para: como cada status antigo ficou no modelo novo.
select l.status as status_legado, c.estagio as estagio_novo, count(*) as qtd
  from public.recruitment_candidates l
  join public.recrut_candidato c
    on c.tenant_id = l.tenant_id
   and c.telefone = public.recrut_norm_phone(l.telefone)
 group by 1, 2
 order by 1, 2;
