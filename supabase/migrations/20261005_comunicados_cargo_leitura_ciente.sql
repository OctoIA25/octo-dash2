-- ============================================================
-- A.2 do Plano Final — o que faltava no "Enviar notificação".
--
--   1. Público por CARGO e PESSOA POR PESSOA pela tela (antes: casa ou equipes).
--   2. Antes de enviar, a tela diz para quantas pessoas vai e QUEM são.
--   3. "Abrir ao tocar": lançamento, material de estudo, Metas ou Bolsão
--      (antes: só lead). Nada de URL livre.
--   4. "Exige ciente": o aviso fica no sino como não lido até a pessoa clicar
--      em "Ciente". A trava é do banco, não da tela.
--   5. Enviados: quantos leram, e ao abrir, QUEM leu e quem não leu.
--
-- Base: 20261001_comunicados.sql e 20261002_destinatario_nos_avisos.sql.
-- Enviar continua sendo AÇÃO — decide o role, não o cargo (21/09):
--   Diretoria/owner: casa, equipes, cargos ou pessoas.
--   Gerente: só equipes que lidera, ou pessoas dessas equipes (e quem responde a ele).
--
-- Compatível com o que está no ar: as duas funções que mudam de assinatura
-- (publicar_comunicado, enviar_comunicado) só GANHAM parâmetros com default, então
-- a rota da LIA e a tela antiga, que chamam por nome, continuam funcionando.
-- Idempotente: reaplicar o arquivo inteiro é seguro.
-- ============================================================

-- 1. comunicados: cargo, destinos novos e ciente -------------------------
alter table public.comunicados add column if not exists exige_ciente boolean not null default false;

alter table public.comunicados drop constraint if exists comunicados_publico_tipo_check;
alter table public.comunicados add constraint comunicados_publico_tipo_check
  check (publico_tipo in ('todos', 'equipes', 'cargos', 'pessoas'));

-- Metas e Bolsão são telas, não registros: vão sem id. Os outros exigem o id.
alter table public.comunicados drop constraint if exists comunicados_link_type_check;
alter table public.comunicados drop constraint if exists comunicados_check;
alter table public.comunicados drop constraint if exists comunicados_link_check;
alter table public.comunicados add constraint comunicados_link_check check (
     (link_type is null and link_id is null)
  or (link_type in ('lead', 'lancamento', 'material') and link_id is not null)
  or (link_type in ('metas', 'bolsao') and link_id is null));

-- 2. notifications: quando deu ciente ------------------------------------
-- Nula e sem default: só metadado. Quem pede ciente está em metadata.exige_ciente
-- (fotografia do envio, como o resto das etiquetas).
alter table public.notifications add column if not exists ciente_em timestamptz;

-- Previsto no spec de 30/09 para quando existisse a tela "Enviados": é ela.
create index if not exists notifications_comunicado_id
  on public.notifications (comunicado_id) where comunicado_id is not null;

-- O navegador só marca como lida. Ciente sai pela função (dar_ciente), e
-- título, metadata e comunicado_id deixam de ser editáveis por quem recebe —
-- senão bastava apagar o exige_ciente do próprio aviso.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- 3. A trava do ciente ---------------------------------------------------
-- "Marcar como lida" e "Marcar tudo como lido" não tiram do sino um aviso que
-- pede ciente: ele só deixa de ser não lido junto com o ciente.
create or replace function public.tg_notifications_ciente()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.metadata->>'exige_ciente' = 'true' and new.ciente_em is null then
    new.read_at := old.read_at;
  end if;
  return new;
end $$;
revoke execute on function public.tg_notifications_ciente() from public, anon, authenticated;

drop trigger if exists tg_notifications_ciente on public.notifications;
create trigger tg_notifications_ciente
  before update of read_at on public.notifications
  for each row execute function public.tg_notifications_ciente();

create or replace function public.dar_ciente(p_notification_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_em timestamptz;
begin
  update public.notifications n
     set ciente_em = now(), read_at = coalesce(n.read_at, now())
   where n.id = p_notification_id and n.user_id = auth.uid() and n.ciente_em is null
  returning n.ciente_em into v_em;
  if v_em is null then
    -- Já tinha dado ciente: devolve quando. Aviso de outra pessoa: devolve nulo.
    select n.ciente_em into v_em
      from public.notifications n
     where n.id = p_notification_id and n.user_id = auth.uid();
  end if;
  return v_em;
end $$;
revoke execute on function public.dar_ciente(uuid) from public, anon;
grant execute on function public.dar_ciente(uuid) to authenticated;

-- 4. Quem é o público: UMA casa para o envio e para a prévia --------------
-- Sem o owner da plataforma. Quem enviou sai depois, em quem chama.
create or replace function public.membros_do_publico(p_tenant_id uuid, p_publico_tipo text, p_ids uuid[])
returns setof uuid language sql stable security definer set search_path = public as $$
  with membros as (
    select tm.user_id, tm.team_id, tm.cargo_id
      from public.tenant_memberships tm
      join auth.users u on u.id = tm.user_id
     where tm.tenant_id = p_tenant_id
       and not exists (select 1 from public.platform_owners po where po.email = lower(u.email))
  )
  select m.user_id from membros m where p_publico_tipo = 'todos'
  union
  select m.user_id from membros m where p_publico_tipo = 'equipes' and m.team_id = any(p_ids)
  union
  select m.user_id from membros m join public.teams t on m.user_id = any(t.leader_user_ids)
   where p_publico_tipo = 'equipes' and t.id = any(p_ids) and t.tenant_id = p_tenant_id
  union
  select m.user_id from membros m where p_publico_tipo = 'cargos' and m.cargo_id = any(p_ids)
  union
  select m.user_id from membros m where p_publico_tipo = 'pessoas' and m.user_id = any(p_ids)
$$;
revoke execute on function public.membros_do_publico(uuid, text, uuid[]) from public, anon, authenticated;

-- 5. Quem pode enviar para quem: UMA casa para enviar, prever e listar opções
create or replace function public.checar_envio_de_comunicado(
  p_tenant_id uuid, p_publico_tipo text, p_equipe_ids uuid[], p_user_ids uuid[]
) returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'sem_permissao';
  end if;
  select tm.role into v_role
    from public.tenant_memberships tm
   where tm.tenant_id = p_tenant_id and tm.user_id = v_uid;

  if public.is_platform_owner() or v_role = 'admin' then
    if p_publico_tipo is null or p_publico_tipo not in ('todos', 'equipes', 'cargos', 'pessoas') then
      raise exception 'publico_invalido';
    end if;
  elsif v_role = 'team_leader' then
    if p_publico_tipo = 'equipes' then
      -- Só as equipes que ele lidera — TODAS as pedidas.
      if exists (
           select 1 from unnest(coalesce(p_equipe_ids, '{}')) e(id)
            where not exists (
              select 1 from public.teams t
               where t.id = e.id and t.tenant_id = p_tenant_id
                 and (t.leader_user_id = v_uid or v_uid = any(t.leader_user_ids)))) then
        raise exception 'sem_permissao';
      end if;
    elsif p_publico_tipo = 'pessoas' then
      -- Só quem responde a ele: está numa equipe que ele lidera, ou o tem como gestor.
      if exists (
           select 1 from unnest(coalesce(p_user_ids, '{}')) p(id)
            where not exists (
              select 1 from public.tenant_memberships tm
                left join public.teams t on t.id = tm.team_id
               where tm.tenant_id = p_tenant_id and tm.user_id = p.id
                 and (tm.leader_user_id = v_uid
                      or t.leader_user_id = v_uid or v_uid = any(t.leader_user_ids)))) then
        raise exception 'sem_permissao';
      end if;
    else
      raise exception 'sem_permissao';
    end if;
  else
    raise exception 'sem_permissao';
  end if;
end $$;
revoke execute on function public.checar_envio_de_comunicado(uuid, text, uuid[], uuid[]) from public, anon, authenticated;

-- 6. Publicar: a ÚNICA casa do fan-out (agora com cargo, pessoas por id,
-- destinos novos e ciente). Troca de assinatura: a antiga sai para não
-- sobrar sobrecarga ambígua no PostgREST.
drop function if exists public.publicar_comunicado(uuid, text, uuid, text, text, text, text, text, uuid[], text[], boolean, text, text, text);
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
  p_idempotency_key text default null,
  p_cargo_ids uuid[] default '{}',
  p_user_ids uuid[] default '{}',
  p_exige_ciente boolean default false
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
  if p_publico_tipo = 'cargos' and (
       coalesce(cardinality(p_cargo_ids), 0) = 0
       or exists (select 1 from unnest(p_cargo_ids) x(id)
                   where not exists (select 1 from public.cargos c
                                      where c.id = x.id and c.tenant_id = p_tenant_id))) then
    raise exception 'cargo_invalido';
  end if;
  if p_link_type = 'lead' and not exists (
       select 1 from public.leads l where l.id = p_link_id::uuid and l.tenant_id = p_tenant_id) then
    raise exception 'lead_nao_encontrado';
  end if;
  if p_link_type = 'lancamento' and not exists (
       select 1 from public.lancamentos l where l.id = p_link_id::uuid and l.tenant_id = p_tenant_id) then
    raise exception 'lancamento_nao_encontrado';
  end if;
  -- Só material publicado: rascunho abriria uma tela vazia para quem recebe.
  if p_link_type = 'material' and not exists (
       select 1 from public.materiais m
        where m.id = p_link_id::uuid and m.tenant_id = p_tenant_id
          and m.ativo and m.publicado_em is not null) then
    raise exception 'material_nao_encontrado';
  end if;

  -- c. Pessoas: a tela manda ids; a LIA, e-mails (não conhece ids). Tudo ou nada.
  if p_publico_tipo = 'pessoas' and coalesce(cardinality(p_user_ids), 0) > 0 then
    if exists (select 1 from unnest(p_user_ids) p(id)
                where not exists (select 1 from public.tenant_memberships tm
                                   where tm.tenant_id = p_tenant_id and tm.user_id = p.id)) then
      raise exception 'destinatario_desconhecido';
    end if;
    select array_agg(distinct x) into v_publico_ids from unnest(p_user_ids) x;
  elsif p_publico_tipo = 'pessoas' then
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
  elsif p_publico_tipo = 'cargos' then
    v_publico_ids := p_cargo_ids;
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
    when 'cargos' then (select string_agg(c.nome, ', ' order by c.nome)
                          from public.cargos c where c.id = any(v_publico_ids))
    else 'Você'
  end;

  -- e. Quem recebe: uma consulta só, sem laço.
  with diretos as (
    select m.user_id from public.membros_do_publico(p_tenant_id, p_publico_tipo, v_publico_ids) as m(user_id)
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
      destinatarios, idempotency_key, exige_ciente)
  values (p_tenant_id, p_categoria, btrim(p_titulo), btrim(p_mensagem), coalesce(p_prioridade, 'normal'),
      p_origem, p_autor_user_id, p_publico_tipo, v_publico_ids, coalesce(p_copiar_gestor, false),
      p_link_type, p_link_id, v_n, p_idempotency_key, coalesce(p_exige_ciente, false))
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
           'copia_gestor', case when a->>'sobre' is not null then true end,
           'exige_ciente', case when p_exige_ciente then true end))
    from jsonb_array_elements(v_alvos) a;

  return query select v_id, v_n, true;
end $$;
revoke execute on function public.publicar_comunicado(uuid, text, uuid, text, text, text, text, text, uuid[], text[], boolean, text, text, text, uuid[], uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.publicar_comunicado(uuid, text, uuid, text, text, text, text, text, uuid[], text[], boolean, text, text, text, uuid[], uuid[], boolean)
  to service_role;

-- 7. Enviar pela tela: autoriza e delega ---------------------------------
drop function if exists public.enviar_comunicado(uuid, text, text, text, text, uuid[], text);
create or replace function public.enviar_comunicado(
  p_tenant_id uuid,
  p_titulo text,
  p_mensagem text,
  p_prioridade text,
  p_publico_tipo text,
  p_equipe_ids uuid[],
  p_idempotency_key text,
  p_cargo_ids uuid[] default '{}',
  p_user_ids uuid[] default '{}',
  p_link_type text default null,
  p_link_id text default null,
  p_exige_ciente boolean default false
) returns table (comunicado_id uuid, destinatarios int, criado boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.checar_envio_de_comunicado(p_tenant_id, p_publico_tipo, p_equipe_ids, p_user_ids);

  return query select * from public.publicar_comunicado(
    p_tenant_id => p_tenant_id, p_origem => 'usuario', p_autor_user_id => auth.uid(),
    p_categoria => 'comunicado', p_titulo => p_titulo, p_mensagem => p_mensagem,
    p_prioridade => p_prioridade, p_publico_tipo => p_publico_tipo,
    p_equipe_ids => coalesce(p_equipe_ids, '{}'),
    p_cargo_ids => coalesce(p_cargo_ids, '{}'),
    p_user_ids => coalesce(p_user_ids, '{}'),
    p_link_type => p_link_type, p_link_id => p_link_id,
    p_exige_ciente => coalesce(p_exige_ciente, false),
    -- A chave da tela leva o remetente: nunca colide com outro remetente nem com a LIA
    -- (a dedup do publicar_comunicado é por casa); o mesmo remetente reenviando ainda dedup.
    p_idempotency_key => case when p_idempotency_key is null then null
                              else 'tela:' || auth.uid()::text || ':' || p_idempotency_key end);
end $$;
revoke execute on function public.enviar_comunicado(uuid, text, text, text, text, uuid[], text, uuid[], uuid[], text, text, boolean) from public, anon;
grant execute on function public.enviar_comunicado(uuid, text, text, text, text, uuid[], text, uuid[], uuid[], text, text, boolean) to authenticated;

-- 8. Prévia: para quantas pessoas vai, e quem são -------------------------
-- Mesma autorização e mesmo público do envio (as funções acima), sem gravar nada.
create or replace function public.previa_comunicado(
  p_tenant_id uuid,
  p_publico_tipo text,
  p_equipe_ids uuid[] default '{}',
  p_cargo_ids uuid[] default '{}',
  p_user_ids uuid[] default '{}'
) returns table (user_id uuid, nome text, cargo text, equipe text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.checar_envio_de_comunicado(p_tenant_id, p_publico_tipo, p_equipe_ids, p_user_ids);

  return query
    select m.uid, p.perfil->>'nome', p.perfil->>'cargo', p.perfil->>'equipe'
      from public.membros_do_publico(
             p_tenant_id, p_publico_tipo,
             case p_publico_tipo when 'equipes' then coalesce(p_equipe_ids, '{}')
                                 when 'cargos' then coalesce(p_cargo_ids, '{}')
                                 when 'pessoas' then coalesce(p_user_ids, '{}')
                                 else '{}'::uuid[] end) as m(uid)
      cross join lateral (select public.perfil_de_aviso(p_tenant_id, m.uid) as perfil) p
     where m.uid is distinct from auth.uid()
     order by lower(p.perfil->>'nome');
end $$;
revoke execute on function public.previa_comunicado(uuid, text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.previa_comunicado(uuid, text, uuid[], uuid[], uuid[]) to authenticated;

-- 9. O que o compositor oferece: só o que quem está logado pode escolher --
-- Uma chamada: equipes, cargos, pessoas e os destinos do clique.
create or replace function public.opcoes_do_comunicado(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_diretoria boolean;
begin
  if v_uid is null then
    raise exception 'sem_permissao';
  end if;
  select tm.role into v_role
    from public.tenant_memberships tm
   where tm.tenant_id = p_tenant_id and tm.user_id = v_uid;
  -- coalesce: quem não é da casa tem role NULO, e NULL numa condição de bloqueio deixa passar.
  v_diretoria := coalesce(public.is_platform_owner(), false) or v_role is not distinct from 'admin';
  if not v_diretoria and v_role is distinct from 'team_leader' then
    raise exception 'sem_permissao';
  end if;

  return jsonb_build_object(
    'equipes', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.name) order by t.name)
        from public.teams t
       where t.tenant_id = p_tenant_id
         and (v_diretoria or t.leader_user_id = v_uid or v_uid = any(t.leader_user_ids))), '[]'::jsonb),
    -- Cargo é recorte da casa inteira: só a Diretoria.
    'cargos', case when v_diretoria then coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'pessoas', x.n) order by c.nome)
        from public.cargos c
        cross join lateral (
          select count(*)::int as n
            from public.membros_do_publico(p_tenant_id, 'cargos', array[c.id]) m(uid)
           where m.uid <> v_uid) x
       where c.tenant_id = p_tenant_id and c.ativo and x.n > 0), '[]'::jsonb) else '[]'::jsonb end,
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.uid, 'nome', p.perfil->>'nome',
                                          'cargo', p.perfil->>'cargo', 'equipe', p.perfil->>'equipe')
                       order by lower(p.perfil->>'nome'))
        from public.membros_do_publico(p_tenant_id, 'todos', '{}') m(uid)
        join public.tenant_memberships tm on tm.tenant_id = p_tenant_id and tm.user_id = m.uid
        left join public.teams t on t.id = tm.team_id
        cross join lateral (select public.perfil_de_aviso(p_tenant_id, m.uid) as perfil) p
       where m.uid <> v_uid
         and (v_diretoria or tm.leader_user_id = v_uid
              or t.leader_user_id = v_uid or v_uid = any(t.leader_user_ids))), '[]'::jsonb),
    'lancamentos', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome) order by l.nome)
        from public.lancamentos l where l.tenant_id = p_tenant_id), '[]'::jsonb),
    'materiais', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'titulo', m.titulo) order by m.titulo)
        from public.materiais m
       where m.tenant_id = p_tenant_id and m.ativo and m.publicado_em is not null), '[]'::jsonb));
end $$;
revoke execute on function public.opcoes_do_comunicado(uuid) from public, anon;
grant execute on function public.opcoes_do_comunicado(uuid) to authenticated;

-- 10. Enviados: o que a casa anunciou e quantos leram ---------------------
-- Diretoria/owner veem todos os da casa (inclusive os da LIA); o gerente, os dele.
create or replace function public.comunicados_enviados(p_tenant_id uuid)
returns table (
  id uuid, titulo text, created_at timestamptz, remetente text, publico text,
  prioridade text, exige_ciente boolean, destinatarios int, leram int, cientes int
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_diretoria boolean;
begin
  if v_uid is null then
    raise exception 'sem_permissao';
  end if;
  select tm.role into v_role
    from public.tenant_memberships tm
   where tm.tenant_id = p_tenant_id and tm.user_id = v_uid;
  -- coalesce: quem não é da casa tem role NULO, e NULL numa condição de bloqueio deixa passar.
  v_diretoria := coalesce(public.is_platform_owner(), false) or v_role is not distinct from 'admin';
  if not v_diretoria and v_role is distinct from 'team_leader' then
    raise exception 'sem_permissao';
  end if;

  return query
    select c.id, c.titulo, c.created_at,
           case when c.origem = 'lia' then 'LIA' else public.nome_de_exibicao(c.autor_user_id) end,
           case c.publico_tipo
             when 'todos' then 'Toda a imobiliária'
             when 'equipes' then (select string_agg(t.name, ', ' order by t.name)
                                    from public.teams t where t.id = any(c.publico_ids))
             when 'cargos' then (select string_agg(g.nome, ', ' order by g.nome)
                                   from public.cargos g where g.id = any(c.publico_ids))
             else case when cardinality(c.publico_ids) = 1
                       then public.nome_de_exibicao(c.publico_ids[1])
                       else cardinality(c.publico_ids) || ' pessoas' end
           end,
           c.prioridade, c.exige_ciente, c.destinatarios,
           (select count(*)::int from public.notifications n where n.comunicado_id = c.id and n.read_at is not null),
           (select count(*)::int from public.notifications n where n.comunicado_id = c.id and n.ciente_em is not null)
      from public.comunicados c
     where c.tenant_id = p_tenant_id
       and (v_diretoria or c.autor_user_id = v_uid)
     order by c.created_at desc
     limit 100;
end $$;
revoke execute on function public.comunicados_enviados(uuid) from public, anon;
grant execute on function public.comunicados_enviados(uuid) to authenticated;

-- 11. Quem leu e quem não leu, nome por nome -----------------------------
-- O nome, o cargo e a equipe vêm do retrato gravado na entrega (metadata.destinatario).
create or replace function public.leitura_do_comunicado(p_comunicado_id uuid)
returns table (
  user_id uuid, nome text, cargo text, equipe text,
  lido_em timestamptz, ciente_em timestamptz, copia_gestor boolean
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_autor uuid;
  v_role text;
begin
  select c.tenant_id, c.autor_user_id into v_tenant, v_autor
    from public.comunicados c where c.id = p_comunicado_id;
  select tm.role into v_role
    from public.tenant_memberships tm
   where tm.tenant_id = v_tenant and tm.user_id = v_uid;
  -- Comunicado que não existe e comunicado alheio respondem igual: nada vaza.
  -- is not distinct from: quem não é da casa tem role NULO, e NULL aqui deixaria passar.
  if v_uid is null or v_tenant is null
     or not (coalesce(public.is_platform_owner(), false)
             or v_role is not distinct from 'admin'
             or (v_role is not distinct from 'team_leader' and v_autor is not distinct from v_uid)) then
    raise exception 'sem_permissao';
  end if;

  return query
    select n.user_id,
           coalesce(n.metadata->'destinatario'->>'nome', public.nome_de_exibicao(n.user_id)),
           n.metadata->'destinatario'->>'cargo',
           n.metadata->'destinatario'->>'equipe',
           n.read_at, n.ciente_em,
           coalesce((n.metadata->>'copia_gestor')::boolean, false)
      from public.notifications n
     where n.comunicado_id = p_comunicado_id
     order by (n.read_at is not null), lower(coalesce(n.metadata->'destinatario'->>'nome', ''));
end $$;
revoke execute on function public.leitura_do_comunicado(uuid) from public, anon;
grant execute on function public.leitura_do_comunicado(uuid) to authenticated;

-- O PostgREST guarda o esquema em cache: coluna e parâmetros novos ficam
-- invisíveis até recarregar.
notify pgrst, 'reload schema';
