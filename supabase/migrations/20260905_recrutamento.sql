-- =============================================================================
-- Recrutamento — passo 1 da spec ("Tabelas + view do funil + ficha do candidato").
--
-- Modelo de eventos: `estagio` NUNCA é escrito pela UI. Todo avanço grava um
-- evento em recrut_evento; o trigger carimba o ts_* correspondente e recalcula
-- `estagio` por ESTÁGIO MÁXIMO ALCANÇADO — é isso que corrige o funil 0·0·0·1.
--
-- Três traduções em relação ao texto da spec, porque o SQL literal não roda aqui
-- (a própria spec prevê: "traduzível direto — o que importa é a estrutura"):
--   1. tenant_id + RLS: o Dash é multi-tenant. Sem isso um tenant lê candidato
--      do outro. Por consequência, o UNIQUE de telefone virou (tenant_id, telefone).
--   2. `references usuario(id)` -> `auth.users(id)`: não existe tabela `usuario`.
--   3. `create view vw_recrut_funil` -> função `recrut_funil(...)`: view em
--      Postgres não recebe os parâmetros de/ate/canal que a spec pede na rota.
--      O corpo do SELECT é o mesmo, colunas e nomes idênticos.
--
-- APLICAR NO SUPABASE ANTES DO DEPLOY DO CÓDIGO.
-- =============================================================================

-- 1 · Enums -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'recrut_canal') then
    create type public.recrut_canal as enum ('indicacao','anuncio_meta','portal_vagas','panfletagem','linkedin','instagram','site','outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'recrut_estagio') then
    create type public.recrut_estagio as enum ('lead','interacao','qualificado','reuniao_realizada','matricula','onboard','perdido');
  end if;
  if not exists (select 1 from pg_type where typname = 'recrut_estado') then
    create type public.recrut_estado as enum ('estagiario','corretor');
  end if;
  if not exists (select 1 from pg_type where typname = 'recrut_creci') then
    create type public.recrut_creci as enum ('ativo','em_curso','nao_tem');
  end if;
  if not exists (select 1 from pg_type where typname = 'recrut_cond') then
    create type public.recrut_cond as enum ('pendente','aprovado','reprovado','decisao_erick');
  end if;
  if not exists (select 1 from pg_type where typname = 'recrut_autor') then
    create type public.recrut_autor as enum ('lia','erick','coordenador','sistema');
  end if;
  if not exists (select 1 from pg_type where typname = 'recrut_motivo_perda') then
    create type public.recrut_motivo_perda as enum (
      'fora_de_regiao','sem_tempo','sem_verba','nao_pagou_matricula',
      'sumiu','escolheu_concorrente','reprovado_por_nos'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'recrut_evento_tipo') then
    create type public.recrut_evento_tipo as enum (
      'candidatura_recebida','primeiro_contato','resposta_candidato',
      'condicoes_respondidas','reuniao_agendada','reuniao_confirmada',
      'reuniao_realizada','no_show','decisao','link_matricula_enviado',
      'matricula_confirmada','prazo_matricula_vencido','marco_ativacao','encerrado'
    );
  end if;
end $$;

-- 2 · Tabela principal --------------------------------------------------------
create table if not exists public.recrut_candidato (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  nome              text not null,
  telefone          text not null,               -- E.164 sem "+": 5511999999999
  email             text,
  canal             recrut_canal not null default 'outro',
  indicado_por      text,                        -- nome de quem indicou
  cidade            text,
  bairro            text,

  estagio           recrut_estagio not null default 'lead',
  estado            recrut_estado,               -- estagiario | corretor
  creci             recrut_creci,

  -- as três condições de entrada
  cond_regiao       recrut_cond not null default 'pendente',
  cond_tempo        recrut_cond not null default 'pendente',
  cond_verba        recrut_cond not null default 'pendente',
  dias_semana       smallint check (dias_semana between 0 and 7),

  score_cultural    smallint check (score_cultural  between 0 and 100),
  score_aderencia   smallint check (score_aderencia between 0 and 100),

  coordenador_id    uuid references auth.users(id),
  prazo_matricula   date,
  motivo_perda      recrut_motivo_perda,
  observacoes       text,

  ts_candidatura       timestamptz not null default now(),
  ts_primeiro_contato  timestamptz,
  ts_primeira_resposta timestamptz,
  ts_qualificado       timestamptz,
  ts_reuniao_agendada  timestamptz,
  ts_reuniao_realizada timestamptz,
  ts_matricula         timestamptz,
  ts_onboard           timestamptz,
  ts_encerrado         timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- REGRA: card não fecha sem motivo
  constraint encerrado_exige_motivo
    check (estagio <> 'perdido' or motivo_perda is not null),

  -- REGRA D062: corretor sem Coordenador é anomalia
  constraint onboard_exige_coordenador
    check (estagio <> 'onboard' or coordenador_id is not null)
);

create unique index if not exists uq_recrut_candidato_tenant_telefone
  on public.recrut_candidato (tenant_id, telefone);
create index if not exists idx_recrut_candidato_tenant_estagio
  on public.recrut_candidato (tenant_id, estagio);
create index if not exists idx_recrut_candidato_tenant_canal
  on public.recrut_candidato (tenant_id, canal);
create index if not exists idx_recrut_candidato_tenant_candidatura
  on public.recrut_candidato (tenant_id, ts_candidatura desc);

-- 3 · Eventos — a fonte da verdade do funil -----------------------------------
create table if not exists public.recrut_evento (
  id           bigserial primary key,
  candidato_id uuid not null references public.recrut_candidato(id) on delete cascade,
  tipo         recrut_evento_tipo not null,
  autor        recrut_autor not null default 'sistema',
  payload      jsonb not null default '{}',   -- ex: {"horario":"2026-09-10T15:00","canal":"whatsapp"}
  created_at   timestamptz not null default now()
);
create index if not exists idx_recrut_evento_candidato
  on public.recrut_evento (candidato_id, created_at desc);
create index if not exists idx_recrut_evento_tipo
  on public.recrut_evento (tipo, created_at desc);

-- 4 · Marcos de ativação (os 30 dias) -----------------------------------------
create table if not exists public.recrut_ativacao_marco (
  id           bigserial primary key,
  candidato_id uuid not null references public.recrut_candidato(id) on delete cascade,
  marco        text not null,   -- matricula | primeiro_plantao | primeira_lista_leads
                                -- | primeira_visita | checkpoint_30d
  dono_id      uuid references auth.users(id),
  prazo        date not null,
  concluido_em timestamptz,
  unique (candidato_id, marco)
);

-- 5 · Trigger: evento carimba o timestamp e recalcula o estágio ---------------
create or replace function public.recrut_aplica_evento()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- Saída antecipada: 6 dos 14 tipos (reuniao_confirmada, no_show, decisao,
  -- link_matricula_enviado, prazo_matricula_vencido, candidatura_recebida) não
  -- movem timestamp nenhum. Sair aqui evita 2 UPDATEs e evita bumpar updated_at
  -- à toa — eles continuam gravados em recrut_evento, que é o que a timeline lê.
  -- ponytail: a spec não diz qual evento marca o Onboard. Uso o primeiro plantão
  -- (D+7), que é quando a pessoa passa a operar. Se o Erick entender Onboard como
  -- outro momento, troca-se o payload testado aqui.
  if new.tipo not in ('primeiro_contato','resposta_candidato','condicoes_respondidas',
                      'reuniao_agendada','reuniao_realizada','matricula_confirmada',
                      'marco_ativacao','encerrado')
     or (new.tipo = 'marco_ativacao'
         and new.payload->>'marco' is distinct from 'primeiro_plantao') then
    return null;
  end if;

  -- Primeira ocorrência vence (coalesce), exceto reunião agendada — remarcação
  -- sobrescreve — e encerramento, que sempre reflete o último.
  update public.recrut_candidato c set
    ts_primeiro_contato  = case when new.tipo = 'primeiro_contato'      then coalesce(c.ts_primeiro_contato,  new.created_at) else c.ts_primeiro_contato  end,
    ts_primeira_resposta = case when new.tipo = 'resposta_candidato'    then coalesce(c.ts_primeira_resposta, new.created_at) else c.ts_primeira_resposta end,
    ts_qualificado       = case when new.tipo = 'condicoes_respondidas' then coalesce(c.ts_qualificado,       new.created_at) else c.ts_qualificado       end,
    -- Guarda QUANDO É a reunião (payload.horario), não quando foi marcada: a fila
    -- de ação procura "reunião amanhã sem confirmação" por esta coluna. Sem
    -- horario no payload, cai no created_at. Horario malformado falha o INSERT
    -- do evento de propósito — dado ruim aqui vira reunião que ninguém confirma.
    ts_reuniao_agendada  = case when new.tipo = 'reuniao_agendada'      then coalesce((new.payload->>'horario')::timestamptz, new.created_at) else c.ts_reuniao_agendada  end,
    ts_reuniao_realizada = case when new.tipo = 'reuniao_realizada'     then coalesce(c.ts_reuniao_realizada, new.created_at) else c.ts_reuniao_realizada end,
    ts_matricula         = case when new.tipo = 'matricula_confirmada'  then coalesce(c.ts_matricula,         new.created_at) else c.ts_matricula         end,
    ts_onboard           = case when new.tipo = 'marco_ativacao'        then coalesce(c.ts_onboard,           new.created_at) else c.ts_onboard           end,
    ts_encerrado         = case when new.tipo = 'encerrado'             then new.created_at                                   else c.ts_encerrado         end
  where c.id = new.candidato_id;

  -- Estágio máximo alcançado. Encerrado vence tudo.
  -- Se cair em 'perdido' sem motivo_perda, ou em 'onboard' sem coordenador_id,
  -- as constraints acima recusam o INSERT do evento — é a regra, não um bug:
  -- a API grava o motivo/coordenador ANTES de gravar o evento.
  update public.recrut_candidato set
    estagio = (case
      when ts_encerrado         is not null then 'perdido'
      when ts_onboard           is not null then 'onboard'
      when ts_matricula         is not null then 'matricula'
      when ts_reuniao_realizada is not null then 'reuniao_realizada'
      when ts_qualificado       is not null then 'qualificado'
      when ts_primeira_resposta is not null then 'interacao'
      else 'lead'
    end)::recrut_estagio,
    updated_at = now()
  where id = new.candidato_id;

  return null;
end
$fn$;

drop trigger if exists tr_recrut_aplica_evento on public.recrut_evento;
create trigger tr_recrut_aplica_evento
  after insert on public.recrut_evento
  for each row execute function public.recrut_aplica_evento();

create or replace function public.update_recrut_candidato_updated_at()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at = now();
  return new;
end
$fn$;

drop trigger if exists tr_update_recrut_candidato_updated_at on public.recrut_candidato;
create trigger tr_update_recrut_candidato_updated_at
  before update on public.recrut_candidato
  for each row execute function public.update_recrut_candidato_updated_at();

-- 6 · O funil (o que corrige o 0·0·0·1) ---------------------------------------
-- Cumulativo, não excludente: quem chegou ao Onboard também conta em Lead,
-- Interação e Qualificado. A conversão de cada etapa é a divisão pela anterior,
-- calculada no front. p_de/p_ate são inclusivos e resolvidos no timezone da
-- sessão — o servidor manda as datas já no fuso do tenant.
create or replace function public.recrut_funil(
  p_tenant_id uuid,
  p_de        date default null,
  p_ate       date default null,
  p_canal     recrut_canal default null
)
returns table (
  lead              bigint,
  interacao         bigint,
  qualificado       bigint,
  reuniao_realizada bigint,
  matricula         bigint,
  onboard           bigint
)
language sql
stable
as $fn$
  select
    count(*)                                                 as lead,
    count(*) filter (where ts_primeira_resposta is not null) as interacao,
    count(*) filter (where cond_regiao = 'aprovado'
                       and cond_tempo  = 'aprovado'
                       and cond_verba  = 'aprovado')         as qualificado,
    count(*) filter (where ts_reuniao_realizada is not null) as reuniao_realizada,
    count(*) filter (where ts_matricula is not null)         as matricula,
    count(*) filter (where ts_onboard is not null)           as onboard
  from public.recrut_candidato
  where tenant_id = p_tenant_id
    and (p_de    is null or ts_candidatura >= p_de::timestamptz)
    and (p_ate   is null or ts_candidatura <  (p_ate + 1)::timestamptz)
    and (p_canal is null or canal = p_canal);
$fn$;

-- 7 · RLS ---------------------------------------------------------------------
-- Candidato é dado pessoal de quem não trabalha aqui: leitura e escrita ficam
-- em admin/owner do tenant. O servidor (service_role) bypassa, como nas demais
-- rotas — o gate de papel é feito na aplicação.
alter table public.recrut_candidato      enable row level security;
alter table public.recrut_evento         enable row level security;
alter table public.recrut_ativacao_marco enable row level security;

drop policy if exists "recrut_candidato_all" on public.recrut_candidato;
create policy "recrut_candidato_all" on public.recrut_candidato
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm
       WHERE tm.user_id = (select auth.uid()) AND tm.role IN ('admin','owner')
    )
  )
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm
       WHERE tm.user_id = (select auth.uid()) AND tm.role IN ('admin','owner')
    )
  );

-- Filhas: herdam a permissão do candidato.
drop policy if exists "recrut_evento_all" on public.recrut_evento;
create policy "recrut_evento_all" on public.recrut_evento
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recrut_candidato c WHERE c.id = candidato_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recrut_candidato c WHERE c.id = candidato_id));

drop policy if exists "recrut_ativacao_marco_all" on public.recrut_ativacao_marco;
create policy "recrut_ativacao_marco_all" on public.recrut_ativacao_marco
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recrut_candidato c WHERE c.id = candidato_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recrut_candidato c WHERE c.id = candidato_id));

-- 8 · Privilégios -------------------------------------------------------------
-- RLS já nega tudo para anon (não existe policy TO anon), mas no schema public do
-- Supabase o GRANT vem por default privileges — e neste repo já houve tabela
-- legível sem JWT. Defesa em profundidade: tirar também o GRANT.
revoke all on public.recrut_candidato      from anon;
revoke all on public.recrut_evento         from anon;
revoke all on public.recrut_ativacao_marco from anon;

-- EXECUTE em função é concedido a PUBLIC por padrão: revogar de anon não basta.
revoke execute on function public.recrut_funil(uuid, date, date, recrut_canal) from public;
grant  execute on function public.recrut_funil(uuid, date, date, recrut_canal) to authenticated, service_role;

-- NOTA PARA A ROTA GET /recrutamento/funil: `p_tenant_id` é parâmetro, e o
-- servidor usa service_role (bypassa RLS). O tenant TEM que sair do JWT da
-- sessão, nunca de query param vindo do cliente — senão o parâmetro vira o
-- caminho para ler o funil de outro tenant. Chamada por usuário authenticated
-- é segura mesmo com tenant errado: a RLS filtra e o retorno vem zerado.
