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

-- 6. Enviar pela tela: autoriza pelo auth.uid() e delega -----------------
-- Enviar é AÇÃO: quem decide é o role, não o cargo (decidido em 21/09).
create or replace function public.enviar_comunicado(
  p_tenant_id uuid,
  p_titulo text,
  p_mensagem text,
  p_prioridade text,
  p_publico_tipo text,
  p_equipe_ids uuid[],
  p_idempotency_key text
) returns table (comunicado_id uuid, destinatarios int, criado boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
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
    if p_publico_tipo not in ('todos', 'equipes') then
      raise exception 'publico_invalido';
    end if;
  elsif v_role = 'team_leader' then
    -- Só as equipes que ele lidera — TODAS as pedidas.
    if p_publico_tipo is distinct from 'equipes' or exists (
         select 1 from unnest(coalesce(p_equipe_ids, '{}')) e(id)
          where not exists (
            select 1 from public.teams t
             where t.id = e.id and t.tenant_id = p_tenant_id
               and (t.leader_user_id = v_uid or v_uid = any(t.leader_user_ids)))) then
      raise exception 'sem_permissao';
    end if;
  else
    raise exception 'sem_permissao';
  end if;

  return query select * from public.publicar_comunicado(
    p_tenant_id => p_tenant_id, p_origem => 'usuario', p_autor_user_id => v_uid,
    p_categoria => 'comunicado', p_titulo => p_titulo, p_mensagem => p_mensagem,
    p_prioridade => p_prioridade, p_publico_tipo => p_publico_tipo,
    p_equipe_ids => coalesce(p_equipe_ids, '{}'),
    -- A chave da tela leva o remetente: nunca colide com outro remetente nem com a LIA
    -- (a dedup do publicar_comunicado é por casa); o mesmo remetente reenviando ainda dedup.
    p_idempotency_key => case when p_idempotency_key is null then null
                              else 'tela:' || v_uid::text || ':' || p_idempotency_key end);
end $$;
revoke execute on function public.enviar_comunicado(uuid, text, text, text, text, uuid[], text) from public, anon;
grant execute on function public.enviar_comunicado(uuid, text, text, text, text, uuid[], text) to authenticated;

-- 7. Problema chega também a quem responde pelo corretor -----------------
-- Mesma função que está em produção (pg_get_functiondef, 30/09), mais as
-- cópias nos laços 2 (vencida) e 3 (bloqueio). O laço 1 é LEMBRETE: continua
-- só com quem executa. A deduplicação segue nas colunas pending_notified_at e
-- bolsao_blocked_enabled, que já impedem repetir o aviso — e a cópia com ele.
CREATE OR REPLACE FUNCTION public.processar_atividades_pendentes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bloqueantes text[] := ARRAY['retornar_cliente', 'visita_agendada'];
  v_abertas text[] := ARRAY['pendente', 'confirmado'];
  -- 20260917: o bloqueio só começa na segunda; avisar antes, punir depois.
  v_inicio_bloqueio constant timestamptz := timestamptz '2026-09-21 00:00:00-03';
  r record;
  v_nome text;
BEGIN
  FOR r IN
    SELECT ae.id, ae.tenant_id, ae.titulo, ae.lead_nome, u.id AS user_id
    FROM public.agenda_eventos ae
    JOIN auth.users u ON lower(u.email) = lower(ae.corretor_email)
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ae.tenant_id AND tm.user_id = u.id
    WHERE ae.status = ANY(v_abertas)
      AND ae.due_soon_notified_at IS NULL
      AND public.prazo_atividade(ae.data, ae.horario)
            BETWEEN now() AND now() + interval '1 hour'
  LOOP
    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    VALUES (
      r.tenant_id, r.user_id,
      'Atividade em 1 hora',
      '"' || r.titulo || '"' ||
        COALESCE(' — ' || NULLIF(r.lead_nome, ''), '') ||
        ' vence na próxima hora.',
      'activity_pending', 'agenda_event', r.id::text,
      jsonb_build_object('motivo', 'lembrete')
    );
    UPDATE public.agenda_eventos
    SET due_soon_notified_at = now(), updated_at = now()
    WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT ae.id, ae.tenant_id, ae.titulo, ae.tipo, u.id AS user_id
    FROM public.agenda_eventos ae
    JOIN auth.users u ON lower(u.email) = lower(ae.corretor_email)
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ae.tenant_id AND tm.user_id = u.id
    WHERE ae.status = ANY(v_abertas)
      AND ae.tipo = ANY(v_bloqueantes)
      AND ae.pending_notified_at IS NULL
      AND public.prazo_atividade(ae.data, ae.horario) < now()
  LOOP
    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    VALUES (
      r.tenant_id, r.user_id,
      'Atividade pendente',
      '"' || r.titulo || '" (' ||
        CASE WHEN r.tipo = 'visita_agendada' THEN 'Visita' ELSE 'Retorno ao lead' END ||
        ') passou do prazo. Realize em até 24h para não ser bloqueado do recebimento de leads.',
      'activity_pending', 'agenda_event', r.id::text,
      jsonb_build_object('motivo', 'vencida')
    );

    v_nome := public.nome_de_exibicao(r.user_id);
    INSERT INTO public.notifications
      (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
    SELECT
      r.tenant_id, g.user_id,
      'Atividade pendente · ' || v_nome,
      '"' || r.titulo || '" (' ||
        CASE WHEN r.tipo = 'visita_agendada' THEN 'Visita' ELSE 'Retorno ao lead' END ||
        ') de ' || v_nome || ' passou do prazo. Sem conclusão em 24h, ' || v_nome ||
        ' sai da distribuição.',
      'activity_pending', 'agenda_event', r.id::text,
      jsonb_build_object('motivo', 'vencida', 'copia_gestor', true,
                         'sobre', v_nome, 'sobre_user_id', r.user_id)
    FROM public.responsaveis_pelo_membro(r.tenant_id, r.user_id) AS g(user_id);

    UPDATE public.agenda_eventos
    SET pending_notified_at = now(), updated_at = now()
    WHERE id = r.id;
  END LOOP;

  IF now() >= v_inicio_bloqueio THEN
    FOR r IN
      SELECT DISTINCT ON (tm.id) tm.id AS membership_id, ae.id AS evento_id,
             ae.tenant_id, u.id AS user_id
      FROM public.agenda_eventos ae
      JOIN auth.users u ON lower(u.email) = lower(ae.corretor_email)
      JOIN public.tenant_memberships tm
        ON tm.tenant_id = ae.tenant_id AND tm.user_id = u.id
      WHERE ae.status = ANY(v_abertas)
        AND ae.tipo = ANY(v_bloqueantes)
        AND ae.pending_notified_at IS NOT NULL
        AND ae.pending_notified_at < now() - interval '24 hours'
        AND COALESCE((tm.permissions->>'bolsao_blocked_enabled')::boolean, false) = false
    LOOP
      UPDATE public.tenant_memberships
      SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
            'bolsao_blocked_enabled', true,
            'bolsao_blocked_until', NULL,
            'bolsao_blocked_reason', 'atividade_pendente',
            'bolsao_blocked_duration', 'indefinido'
          )
      WHERE id = r.membership_id;

      INSERT INTO public.notifications
        (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
      VALUES (
        r.tenant_id, r.user_id,
        'Você foi bloqueado do recebimento de leads',
        'Por não realizar a atividade pendente em 24h, você está temporariamente bloqueado. Conclua a atividade para ser desbloqueado.',
        'blocked', 'agenda_event', r.evento_id::text,
        jsonb_build_object('motivo', 'atividade_pendente')
      );

      v_nome := public.nome_de_exibicao(r.user_id);
      INSERT INTO public.notifications
        (tenant_id, user_id, title, body, type, link_type, link_id, metadata)
      SELECT
        r.tenant_id, g.user_id,
        'Corretor bloqueado · ' || v_nome,
        v_nome || ' foi bloqueado do recebimento de leads por atividade pendente há mais de 24h.',
        'blocked', 'agenda_event', r.evento_id::text,
        jsonb_build_object('motivo', 'atividade_pendente', 'copia_gestor', true,
                           'sobre', v_nome, 'sobre_user_id', r.user_id)
      FROM public.responsaveis_pelo_membro(r.tenant_id, r.user_id) AS g(user_id);
    END LOOP;
  END IF;
END;
$function$;

-- 8. Demandas avisam pelo banco ------------------------------------------
-- Até 30/09 o navegador gravava este aviso direto em notifications — o único
-- motivo para a policy de INSERT existir. O módulo de Demandas já grava o
-- histórico por gatilho ("tela esquece quando o status muda por outro
-- caminho"); o aviso segue a mesma regra. Destinatário sai da LINHA, nunca do
-- cliente. Ninguém é avisado da própria ação.
create or replace function public.tg_mkt_demanda_avisa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quem uuid := auth.uid();
begin
  if new.responsavel_id is not null
     and new.responsavel_id is distinct from old.responsavel_id
     and new.responsavel_id is distinct from v_quem then
    insert into public.notifications (tenant_id, user_id, title, body, type, link_type, link_id)
    values (new.tenant_id, new.responsavel_id, 'Nova demanda para você',
            '"' || new.titulo || '" foi atribuída a você.', 'info', 'mkt_demanda', new.id::text);
  end if;

  if new.status = 'aprovado' and old.status is distinct from 'aprovado'
     and new.solicitante_id is not null
     and new.solicitante_id is distinct from v_quem then
    insert into public.notifications (tenant_id, user_id, title, body, type, link_type, link_id)
    values (new.tenant_id, new.solicitante_id, 'Sua demanda foi aprovada',
            '"' || new.titulo || '" está aprovada e pronta para publicar.', 'info', 'mkt_demanda', new.id::text);
  end if;

  return new;
end $$;
revoke execute on function public.tg_mkt_demanda_avisa() from public, anon, authenticated;

drop trigger if exists tg_mkt_demanda_avisa on public.mkt_demandas;
create trigger tg_mkt_demanda_avisa
  after update of responsavel_id, status on public.mkt_demandas
  for each row execute function public.tg_mkt_demanda_avisa();
