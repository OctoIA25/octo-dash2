-- ============================================================
-- Comunicados e alertas.
-- Spec: docs/superpowers/specs/2026-09-30-comunicados-e-alertas-design.md
--
-- ADITIVA. Pode ir para produção antes do deploy do front. A que fecha a
-- gravação direta em notifications é 20261001_notifications_fecha_insert.sql.
--
-- MODELO: um comunicado é a mensagem (1 linha, imutável). A entrega é uma
-- linha de notifications por destinatário, com o próprio estado de leitura.
-- As duas nascem juntas, numa transação só, em publicar_comunicado().
--
-- Idempotente: reaplicar o arquivo inteiro é seguro.
-- ============================================================

-- 1. O comunicado --------------------------------------------------------
create table if not exists public.comunicados (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  categoria       text not null check (categoria in ('comunicado', 'alerta')),
  titulo          text not null check (char_length(btrim(titulo)) between 1 and 120),
  mensagem        text not null check (char_length(btrim(mensagem)) between 1 and 2000),
  prioridade      text not null default 'normal' check (prioridade in ('normal', 'importante')),
  origem          text not null check (origem in ('usuario', 'lia')),
  autor_user_id   uuid references auth.users(id) on delete set null,
  publico_tipo    text not null check (publico_tipo in ('todos', 'equipes', 'pessoas')),
  -- Fotografia do pedido (equipes ou pessoas). A entrega real está em notifications.
  publico_ids     uuid[] not null default '{}',
  copiar_gestor   boolean not null default false,
  link_type       text check (link_type in ('lead')),
  link_id         text,
  destinatarios   int not null check (destinatarios > 0),
  idempotency_key text check (char_length(idempotency_key) between 1 and 200),
  created_at      timestamptz not null default now(),
  check ((link_type is null) = (link_id is null))
);

-- Corretude, não desempenho: sem ele duas tentativas simultâneas viram dois comunicados.
create unique index if not exists comunicados_idempotencia
  on public.comunicados (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- Sem policy: só as funções abaixo (security definer) e o service_role tocam.
alter table public.comunicados enable row level security;
revoke all on public.comunicados from public, anon, authenticated;

-- 2. A entrega aponta para o comunicado ----------------------------------
-- Nula e sem default: só metadado, não reescreve a tabela.
-- Sem índice: nenhuma consulta da v1 filtra por ela (121 linhas em 30/09).
alter table public.notifications
  add column if not exists comunicado_id uuid references public.comunicados(id) on delete cascade;

-- O PostgREST guarda o esquema em cache e esconde coluna nova até recarregar.
notify pgrst, 'reload schema';

-- 3. O nome que aparece na tela ------------------------------------------
-- Mesma fonte da view user_profiles (raw_user_meta_data->>'name'), sem o filtro
-- por auth.uid() dela. Sem nome, o e-mail. Nunca o UUID.
create or replace function public.nome_de_exibicao(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'name'), ''), u.email)
    from auth.users u
   where u.id = p_user_id
$$;
revoke execute on function public.nome_de_exibicao(uuid) from public, anon, authenticated;

-- 4. Quem responde pelo membro -------------------------------------------
-- Os gestores dele (leader_user_id + teams.leader_user_ids da equipe — o mesmo
-- par da regra de acesso do WhatsApp). Sem nenhum, a Diretoria (role admin).
-- Só quem ainda é da casa; nunca ele mesmo; nunca owner da plataforma.
create or replace function public.responsaveis_pelo_membro(p_tenant_id uuid, p_user_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with membros as (
    select tm.user_id, tm.role
      from public.tenant_memberships tm
      join auth.users u on u.id = tm.user_id
     where tm.tenant_id = p_tenant_id
       and tm.user_id <> p_user_id
       and not exists (select 1 from public.platform_owners po where po.email = lower(u.email))
  ),
  gestores as (
    select tm.leader_user_id as user_id
      from public.tenant_memberships tm
     where tm.tenant_id = p_tenant_id and tm.user_id = p_user_id
    union
    select unnest(t.leader_user_ids)
      from public.tenant_memberships tm
      join public.teams t on t.id = tm.team_id
     where tm.tenant_id = p_tenant_id and tm.user_id = p_user_id
  ),
  validos as (
    select m.user_id from membros m join gestores g on g.user_id = m.user_id
  )
  select user_id from validos
  union
  select m.user_id from membros m
   where m.role = 'admin' and not exists (select 1 from validos)
$$;
revoke execute on function public.responsaveis_pelo_membro(uuid, uuid) from public, anon, authenticated;
-- 5. Publicar: a ÚNICA casa do fan-out -----------------------------------
-- Chamada pela RPC da tela (enviar_comunicado) e pela rota da LIA
-- (service_role). Faz tudo numa transação: o comunicado e todas as entregas
-- entram juntos, ou nada entra.
create or replace function public.publicar_comunicado(
  p_tenant_id uuid,
  p_origem text,
  p_autor_user_id uuid,
  p_categoria text,
  p_titulo text,
  p_mensagem text,
  p_prioridade text,
  p_publico_tipo text,
  p_equipe_ids uuid[] default '{}',
  p_emails text[] default '{}',
  p_copiar_gestor boolean default false,
  p_link_type text default null,
  p_link_id text default null,
  p_idempotency_key text default null
) returns table (comunicado_id uuid, destinatarios int, criado boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_n int;
  v_publico_ids uuid[];
  v_desconhecidos text;
  v_remetente jsonb;
  v_rotulo text;
  v_alvos jsonb;
begin
  -- a. Reenvio: a mesma chave devolve o mesmo comunicado, sem recalcular nada.
  if p_idempotency_key is not null then
    select c.id, c.destinatarios into v_id, v_n
      from public.comunicados c
     where c.tenant_id = p_tenant_id and c.idempotency_key = p_idempotency_key;
    if found then
      return query select v_id, v_n, false;
      return;
    end if;
  end if;

  -- b. O que aponta para fora tem que ser da casa.
  if p_publico_tipo = 'equipes' and (
       coalesce(cardinality(p_equipe_ids), 0) = 0
       or exists (select 1 from unnest(p_equipe_ids) e(id)
                   where not exists (select 1 from public.teams t
                                      where t.id = e.id and t.tenant_id = p_tenant_id))) then
    raise exception 'equipe_invalida';
  end if;
  if p_link_type = 'lead' and not exists (
       select 1 from public.leads l where l.id = p_link_id::uuid and l.tenant_id = p_tenant_id) then
    raise exception 'lead_nao_encontrado';
  end if;

  -- c. Pessoas chegam por e-mail (a LIA não conhece ids). Tudo ou nada.
  if p_publico_tipo = 'pessoas' then
    select string_agg(e.email, ', ' order by e.email) into v_desconhecidos
      from (select distinct lower(btrim(x)) as email from unnest(p_emails) x) e
     where not exists (
       select 1 from public.tenant_memberships tm join auth.users u on u.id = tm.user_id
        where tm.tenant_id = p_tenant_id and lower(u.email) = e.email);
    if v_desconhecidos is not null then
      raise exception 'destinatario_desconhecido' using detail = v_desconhecidos;
    end if;
    select coalesce(array_agg(distinct tm.user_id), '{}') into v_publico_ids
      from unnest(p_emails) x
      join auth.users u on lower(u.email) = lower(btrim(x))
      join public.tenant_memberships tm on tm.user_id = u.id and tm.tenant_id = p_tenant_id;
  else
    v_publico_ids := coalesce(p_equipe_ids, '{}');
  end if;

  -- d. As etiquetas: fotografia do momento do envio.
  if p_origem = 'lia' then
    v_remetente := jsonb_build_object('tipo', 'lia', 'nome', 'LIA');
  else
    select jsonb_strip_nulls(jsonb_build_object(
             'tipo', 'usuario',
             'nome', public.nome_de_exibicao(p_autor_user_id),
             'cargo', coalesce(c.nome, case tm.role when 'admin' then 'Diretoria'
                                                    when 'team_leader' then 'Gerência' end)))
      into v_remetente
      from (select 1) um
      left join public.tenant_memberships tm on tm.tenant_id = p_tenant_id and tm.user_id = p_autor_user_id
      left join public.cargos c on c.id = tm.cargo_id;
  end if;
  v_rotulo := case p_publico_tipo
    when 'todos' then 'Toda a imobiliária'
    when 'equipes' then (select string_agg(t.name, ', ' order by t.name)
                           from public.teams t where t.id = any(v_publico_ids))
    else 'Você'
  end;

  -- e. Quem recebe: uma consulta só, sem laço.
  with membros as (
    select tm.user_id, tm.team_id
      from public.tenant_memberships tm
      join auth.users u on u.id = tm.user_id
     where tm.tenant_id = p_tenant_id
       and not exists (select 1 from public.platform_owners po where po.email = lower(u.email))
  ),
  diretos as (
    select m.user_id from membros m where p_publico_tipo = 'todos'
    union
    select m.user_id from membros m where p_publico_tipo = 'equipes' and m.team_id = any(v_publico_ids)
    union
    select m.user_id from membros m join public.teams t on m.user_id = any(t.leader_user_ids)
     where p_publico_tipo = 'equipes' and t.id = any(v_publico_ids)
    union
    select m.user_id from membros m where p_publico_tipo = 'pessoas' and m.user_id = any(v_publico_ids)
  ),
  copias as (
    select r.gestor as user_id,
           string_agg(public.nome_de_exibicao(p.user_id), ', ' order by public.nome_de_exibicao(p.user_id)) as sobre
      from unnest(v_publico_ids) as p(user_id)
      cross join lateral public.responsaveis_pelo_membro(p_tenant_id, p.user_id) as r(gestor)
     where p_copiar_gestor and p_publico_tipo = 'pessoas'
     group by r.gestor
  ),
  alvos as (
    select d.user_id, null::text as sobre from diretos d
    union all
    select c.user_id, c.sobre from copias c where c.user_id not in (select user_id from diretos)
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'sobre', a.sobre)), '[]'::jsonb)
    into v_alvos
    from alvos a
   where a.user_id is distinct from p_autor_user_id;

  v_n := jsonb_array_length(v_alvos);
  if v_n = 0 then
    raise exception 'sem_destinatarios';
  end if;

  -- f. Grava. O ON CONFLICT resolve a corrida entre duas tentativas iguais:
  -- a segunda espera o commit da primeira, não grava e lê o que existe.
  insert into public.comunicados (tenant_id, categoria, titulo, mensagem, prioridade, origem,
      autor_user_id, publico_tipo, publico_ids, copiar_gestor, link_type, link_id,
      destinatarios, idempotency_key)
  values (p_tenant_id, p_categoria, btrim(p_titulo), btrim(p_mensagem), coalesce(p_prioridade, 'normal'),
      p_origem, p_autor_user_id, p_publico_tipo, v_publico_ids, coalesce(p_copiar_gestor, false),
      p_link_type, p_link_id, v_n, p_idempotency_key)
  on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select c.id, c.destinatarios into v_id, v_n
      from public.comunicados c
     where c.tenant_id = p_tenant_id and c.idempotency_key = p_idempotency_key;
    return query select v_id, v_n, false;
    return;
  end if;

  insert into public.notifications
    (tenant_id, user_id, title, body, type, link_type, link_id, comunicado_id, metadata)
  select p_tenant_id, (a->>'user_id')::uuid, btrim(p_titulo), btrim(p_mensagem), p_categoria,
         p_link_type, p_link_id, v_id,
         jsonb_strip_nulls(jsonb_build_object(
           'remetente', v_remetente,
           'publico', case when a->>'sobre' is null then v_rotulo else 'Você, como gestor' end,
           'prioridade', coalesce(p_prioridade, 'normal'),
           'sobre', a->>'sobre',
           'copia_gestor', case when a->>'sobre' is not null then true end))
    from jsonb_array_elements(v_alvos) a;

  return query select v_id, v_n, true;
end $$;
revoke execute on function public.publicar_comunicado(uuid, text, uuid, text, text, text, text, text, uuid[], text[], boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.publicar_comunicado(uuid, text, uuid, text, text, text, text, text, uuid[], text[], boolean, text, text, text)
  to service_role;
