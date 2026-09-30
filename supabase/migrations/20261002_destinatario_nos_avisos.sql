-- ============================================================
-- Todo aviso diz para quem foi — e a cópia do gestor, sobre quem é — com
-- nome, cargo e equipe.
-- Spec: docs/superpowers/specs/2026-09-30-comunicados-e-alertas-design.md
--
-- POR QUE UM GATILHO: notificação nasce em muitos lugares (cron, gatilhos,
-- publicar_comunicado, o servidor). Um BEFORE INSERT em notifications grava o
-- retrato de quem recebe em metadata.destinatario — uma casa só, e todo
-- produtor futuro já sai com ele. Retrato do momento, como o remetente: se a
-- pessoa trocar de equipe depois, o aviso antigo continua dizendo onde ela
-- estava quando recebeu.
--
-- ADITIVA e idempotente. Preenche as notificações que já existem.
-- ============================================================

-- 1. O retrato: nome, cargo (ou o papel) e equipe --------------------------
create or replace function public.perfil_de_aviso(p_tenant_id uuid, p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
           'nome', public.nome_de_exibicao(p_user_id),
           'cargo', coalesce(c.nome, case tm.role when 'admin' then 'Diretoria'
                                                  when 'team_leader' then 'Gerência'
                                                  when 'corretor' then 'Corretor' end),
           'equipe', t.name))
    from (select 1) um
    left join public.tenant_memberships tm on tm.tenant_id = p_tenant_id and tm.user_id = p_user_id
    left join public.cargos c on c.id = tm.cargo_id
    left join public.teams t on t.id = tm.team_id
$$;
revoke execute on function public.perfil_de_aviso(uuid, uuid) from public, anon, authenticated;

-- 2. Toda notificação nova sai com o retrato de quem recebe ---------------
create or replace function public.tg_notifications_destinatario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  if jsonb_typeof(new.metadata) <> 'object' then
    return new;
  end if;
  if not new.metadata ? 'destinatario' then
    new.metadata := new.metadata
      || jsonb_build_object('destinatario', public.perfil_de_aviso(new.tenant_id, new.user_id));
  end if;
  -- Cópia do gestor: o retrato de sobre quem é. Id inválido não derruba a gravação.
  if new.metadata ? 'sobre_user_id' and not new.metadata ? 'sobre_perfil'
     and new.metadata->>'sobre_user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    new.metadata := new.metadata
      || jsonb_build_object('sobre_perfil', public.perfil_de_aviso(new.tenant_id, (new.metadata->>'sobre_user_id')::uuid));
  end if;
  return new;
end $$;
revoke execute on function public.tg_notifications_destinatario() from public, anon, authenticated;

drop trigger if exists tg_notifications_destinatario on public.notifications;
create trigger tg_notifications_destinatario
  before insert on public.notifications
  for each row execute function public.tg_notifications_destinatario();

-- 3. publicar_comunicado: remetente pelo mesmo retrato (ganha a equipe) e a
-- cópia do gestor passa a apontar sobre quem é (sobre_user_id).
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
    v_remetente := jsonb_build_object('tipo', 'usuario') || public.perfil_de_aviso(p_tenant_id, p_autor_user_id);
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
           string_agg(public.nome_de_exibicao(p.user_id), ', ' order by public.nome_de_exibicao(p.user_id)) as sobre,
           -- Uma pessoa só: o gatilho de notifications monta o retrato dela (cargo, equipe).
           case when count(*) = 1 then min(p.user_id::text) end as sobre_user_id
      from unnest(v_publico_ids) as p(user_id)
      cross join lateral public.responsaveis_pelo_membro(p_tenant_id, p.user_id) as r(gestor)
     where p_copiar_gestor and p_publico_tipo = 'pessoas'
     group by r.gestor
  ),
  alvos as (
    select d.user_id, null::text as sobre, null::text as sobre_user_id from diretos d
    union all
    select c.user_id, c.sobre, c.sobre_user_id from copias c where c.user_id not in (select user_id from diretos)
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'sobre', a.sobre, 'sobre_user_id', a.sobre_user_id)), '[]'::jsonb)
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
           'sobre_user_id', a->>'sobre_user_id',
           'copia_gestor', case when a->>'sobre' is not null then true end))
    from jsonb_array_elements(v_alvos) a;

  return query select v_id, v_n, true;
end $$;
revoke execute on function public.publicar_comunicado(uuid, text, uuid, text, text, text, text, text, uuid[], text[], boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.publicar_comunicado(uuid, text, uuid, text, text, text, text, text, uuid[], text[], boolean, text, text, text)
  to service_role;

-- 4. As que já existem ganham o retrato uma vez --------------------------
update public.notifications
   set metadata = coalesce(metadata, '{}'::jsonb)
       || jsonb_build_object('destinatario', public.perfil_de_aviso(tenant_id, user_id))
 where jsonb_typeof(coalesce(metadata, '{}'::jsonb)) = 'object'
   and not coalesce(metadata, '{}'::jsonb) ? 'destinatario';

update public.notifications
   set metadata = metadata
       || jsonb_build_object('sobre_perfil', public.perfil_de_aviso(tenant_id, (metadata->>'sobre_user_id')::uuid))
 where metadata ? 'sobre_user_id' and not metadata ? 'sobre_perfil'
   and metadata->>'sobre_user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
