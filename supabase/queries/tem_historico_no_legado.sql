-- Item 8: o módulo antigo guardava um histórico de etapas (recruitment_stages).
-- Esta query diz se vale trazer esse histórico para a ficha do candidato, ou se
-- a tabela está vazia e o assunto morre. Só leitura.

select count(*) as linhas,
       count(distinct candidate_id) as candidatos,
       count(*) filter (where nullif(trim(notas), '') is not null) as com_anotacao,
       min(data) as mais_antiga,
       max(data) as mais_recente
  from public.recruitment_stages;

-- Uma amostra do que está escrito ali (as 10 mais recentes).
select etapa, data::date as data, responsavel, left(coalesce(notas, ''), 80) as notas
  from public.recruitment_stages
 order by data desc
 limit 10;
