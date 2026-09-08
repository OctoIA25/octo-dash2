-- =============================================================================
-- Backfill: recruitment_candidates (28/04) -> recrut_candidato (05/09).
--
-- O módulo antigo guarda um ÚNICO `status` ('Lead','Interação','Reunião',
-- 'Onboard','Aprovado','Rejeitado'). É por isso que o funil da tela imprime
-- 0·0·0·1: cada etapa conta "está atualmente em", então quem chegou ao Onboard
-- sai das anteriores. O modelo novo guarda timestamps por etapa, e o funil
-- passa a contar estágio MÁXIMO ALCANÇADO.
--
-- Idempotente: ON CONFLICT DO NOTHING sobre (tenant_id, telefone). Rodar duas
-- vezes não duplica. NÃO apaga nem altera recruitment_candidates — ela fica de
-- pé como legado até a tela e as metas estarem migradas e conferidas.
--
-- O que este script NÃO inventa:
--   - As três condições (região/tempo/verba) ficam 'pendente': ninguém foi
--     perguntado, e marcar 'aprovado' seria fabricar diagnóstico. Consequência
--     visível: o funil vai mostrar Qualificado = 0 mesmo com gente no Onboard.
--   - 'Reunião' não distingue agendada de realizada — vira agendada, que é a
--     leitura conservadora. Fica registrado em `observacoes`.
-- =============================================================================

-- Espelha server/utils/phone.js: tira DDI duplicado, insere o 9º dígito em
-- celular BR de 10 dígitos, prefixa 55. Mesmo canônico que as rotas usam — sem
-- isso o mesmo candidato entra duas vezes.
create or replace function public.recrut_norm_phone(v text)
returns text language sql immutable as $fn$
  with d as (select regexp_replace(coalesce(v, ''), '\D', '', 'g') as x),
       s as (select case when length(x) > 11 and left(x, 2) = '55' then substr(x, 3) else x end as x from d),
       n as (select case when length(x) = 10 then left(x, 2) || '9' || substr(x, 3) else x end as x from s)
  select case when length(x) = 11 then '55' || x else x end from n;
$fn$;

with origem as (
  select
    rc.*,
    public.recrut_norm_phone(rc.telefone) as tel,
    -- Coordenador provisório: a regra D062 recusa Onboard sem Coordenador, e o
    -- legado não tem esse campo. Usa um admin/owner do tenant e deixa marcado
    -- em observacoes para o Erick corrigir na ficha.
    (select tm.user_id from public.tenant_memberships tm
      where tm.tenant_id = rc.tenant_id and tm.role in ('admin', 'owner') limit 1) as coord
  from public.recruitment_candidates rc
  where rc.tenant_id is not null
    and length(public.recrut_norm_phone(rc.telefone)) between 12 and 15
),
-- Onboard/Aprovado sem coordenador no tenant não pode ser ativado (D062):
-- fica um degrau abaixo, com o motivo escrito na ficha.
classificado as (
  select o.*,
    case
      when o.status in ('Onboard', 'Aprovado') and o.coord is not null then 'onboard'
      when o.status in ('Onboard', 'Aprovado') then 'reuniao_realizada'
      when o.status = 'Rejeitado' then 'perdido'
      when o.status = 'Reunião'   then 'interacao'
      when o.status = 'Interação' then 'interacao'
      else 'lead'
    end as estagio_novo
  from origem o
)
insert into public.recrut_candidato (
  tenant_id, nome, telefone, email, canal, estagio, coordenador_id, motivo_perda,
  ts_candidatura, ts_primeira_resposta, ts_reuniao_agendada, ts_reuniao_realizada,
  ts_matricula, ts_onboard, ts_encerrado, observacoes, created_at
)
select
  c.tenant_id,
  c.nome,
  c.tel,
  c.email,
  'outro',                                   -- o legado não registra canal
  c.estagio_novo::recrut_estagio,
  case when c.estagio_novo = 'onboard' then c.coord end,
  case when c.estagio_novo = 'perdido' then 'reprovado_por_nos'::recrut_motivo_perda end,
  coalesce(c.data_inscricao, c.created_at, now()),
  case when c.status in ('Interação','Reunião','Onboard','Aprovado') then coalesce(c.updated_at, c.created_at) end,
  case when c.status in ('Reunião','Onboard','Aprovado')             then coalesce(c.updated_at, c.created_at) end,
  case when c.status in ('Onboard','Aprovado')                       then coalesce(c.updated_at, c.created_at) end,
  -- Quem opera necessariamente se matriculou: o curso é pré-requisito do CRECI.
  case when c.status in ('Onboard','Aprovado')                       then coalesce(c.updated_at, c.created_at) end,
  case when c.estagio_novo = 'onboard'                               then coalesce(c.updated_at, c.created_at) end,
  case when c.status = 'Rejeitado'                                   then coalesce(c.updated_at, c.created_at) end,
  trim(both E'\n' from concat_ws(E'\n',
    nullif(c.observacoes, ''),
    'Migrado de recruitment_candidates em ' || to_char(now(), 'DD/MM/YYYY') || ' (status: ' || c.status || ').',
    case when c.status = 'Reunião' then 'O legado não distingue reunião agendada de realizada — registrada como agendada.' end,
    case when c.status in ('Onboard','Aprovado') and c.coord is not null then 'Coordenador provisório (regra D062): confirmar na ficha.' end,
    case when c.status in ('Onboard','Aprovado') and c.coord is null then 'Não ativado: tenant sem admin/owner para ser Coordenador (regra D062).' end,
    case when c.cargo is not null then 'Cargo no legado: ' || c.cargo || '.' end
  )),
  coalesce(c.created_at, now())
from classificado c
on conflict (tenant_id, telefone) do nothing;

-- Timeline mínima: um evento de origem por candidato migrado, para a ficha não
-- nascer vazia. 'candidatura_recebida' não move estágio (o trigger sai cedo),
-- então não sobrescreve o de-para acima.
insert into public.recrut_evento (candidato_id, tipo, autor, payload, created_at)
select c.id, 'candidatura_recebida', 'sistema',
       jsonb_build_object('origem', 'backfill_recruitment_candidates'),
       c.ts_candidatura
from public.recrut_candidato c
where c.observacoes like '%Migrado de recruitment_candidates%'
  and not exists (
    select 1 from public.recrut_evento e
     where e.candidato_id = c.id and e.payload->>'origem' = 'backfill_recruitment_candidates'
  );

-- Relatório: o que entrou e o que ficou de fora (telefone ausente/curto é o
-- caso mais comum — o legado só exige email).
do $$
declare
  v_origem   int;
  v_migrados int;
  v_sem_tel  int;
begin
  select count(*) into v_origem from public.recruitment_candidates;
  select count(*) into v_migrados from public.recrut_candidato
   where observacoes like '%Migrado de recruitment_candidates%';
  select count(*) into v_sem_tel from public.recruitment_candidates
   where tenant_id is null or length(public.recrut_norm_phone(telefone)) not between 12 and 15;
  raise notice 'legado: % | migrados: % | fora (sem tenant ou telefone inválido): %',
    v_origem, v_migrados, v_sem_tel;
end $$;
