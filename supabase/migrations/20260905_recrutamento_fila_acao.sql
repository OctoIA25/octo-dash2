-- =============================================================================
-- Recrutamento — passo 2 da spec, parte SQL: a fila de ação.
-- "É a tela que o Erick abre de manhã. Substitui procurar conversa esquecida
--  no WhatsApp."
--
-- Depende de 20260905_recrutamento.sql. Rodar DEPOIS dela.
--
-- Duas traduções, pelos mesmos motivos da migration anterior:
--   1. `tenant_id` exposto como coluna: o servidor usa service_role (bypassa
--      RLS) e precisa filtrar a fila por tenant. Sem a coluna, não tem como.
--   2. `with (security_invoker = true)`: sem isso a view roda com os privilégios
--      do dono e IGNORA a RLS das tabelas base — qualquer authenticated leria a
--      fila de todos os tenants. Mesmo idiom de commercial_sales_monthly_summary.
--
-- Os jobs que consomem esta fila (SLA de 5 min, confirmação 18h, prazo de
-- matrícula 09h) são código de servidor e vêm depois — precisam ser registrados
-- nos DOIS entrypoints e ficar atrás de RECRUTAMENTO_SCHEDULER=1.
-- =============================================================================

create or replace view public.vw_recrut_fila_acao
with (security_invoker = true) as

-- 1. SLA de primeiro contato estourado (1 hora útil)
-- NOTA: a spec escreve "1 hora útil" no texto e `interval '1 hour'` no SQL.
-- Mantido literal: hora corrida. Candidatura às 23h vira alerta à meia-noite.
select tenant_id, id, nome, telefone, 'sla_primeiro_contato'::text as motivo,
       ts_candidatura as desde, 1 as prioridade
from public.recrut_candidato
where estagio = 'lead' and ts_primeiro_contato is null
  and ts_candidatura < now() - interval '1 hour'

union all
-- 2. Candidato respondeu e ninguém devolveu em 24h
select c.tenant_id, c.id, c.nome, c.telefone, 'sem_resposta_24h', e.created_at, 1
from public.recrut_candidato c
join lateral (
  select created_at, tipo from public.recrut_evento
  where candidato_id = c.id order by created_at desc limit 1
) e on true
where e.tipo = 'resposta_candidato'
  and e.created_at < now() - interval '24 hours'
  and c.estagio not in ('perdido','onboard')

union all
-- 3. Reunião amanhã sem confirmação enviada
select c.tenant_id, c.id, c.nome, c.telefone, 'confirmar_reuniao', c.ts_reuniao_agendada, 2
from public.recrut_candidato c
where c.ts_reuniao_agendada::date = current_date + 1
  and not exists (select 1 from public.recrut_evento
                  where candidato_id = c.id and tipo = 'reuniao_confirmada')

union all
-- 4. Prazo da matrícula vence hoje ou já venceu
select tenant_id, id, nome, telefone, 'prazo_matricula', prazo_matricula::timestamptz, 2
from public.recrut_candidato
where prazo_matricula <= current_date
  and ts_matricula is null and estagio not in ('perdido','onboard')

union all
-- 5. Marco de ativação vencido
select c.tenant_id, c.id, c.nome, c.telefone, 'marco_atrasado:' || m.marco, m.prazo::timestamptz, 3
from public.recrut_ativacao_marco m
join public.recrut_candidato c on c.id = m.candidato_id
where m.concluido_em is null and m.prazo < current_date;

revoke all on public.vw_recrut_fila_acao from anon;

-- Índice parcial para o bloco 5: sem ele é seq scan em recrut_ativacao_marco a
-- cada abertura da tela. A tabela é pequena hoje (5 marcos por aprovado), mas o
-- índice custa quase nada e a fila é a tela mais aberta do módulo.
create index if not exists idx_recrut_marco_pendente
  on public.recrut_ativacao_marco (prazo)
  where concluido_em is null;
