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
