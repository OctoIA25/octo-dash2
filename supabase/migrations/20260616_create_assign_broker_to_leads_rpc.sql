-- RPC: atribuir corretor a leads (kenlo_leads) setando raw_data.attendedBy.
--
-- Motivo: o endpoint POST /api/v1/brokers/:id/assign usava
-- `supabase.raw(\`raw_data || '{"attendedBy":[...]}'::jsonb\`)`, que (a) não existe
-- no supabase-js v2 (sempre lançava TypeError -> HTTP 500) e (b) interpolava
-- id/broker_name num literal SQL (injeção). Esta função faz o mesmo efeito de forma
-- PARAMETRIZADA (sem injeção), ATÔMICA e em 1 statement (sem N+1).
--
-- Semântica preservada do antigo `raw_data || '{...}'::jsonb`:
--   merge na RAIZ do JSONB, substituindo apenas a chave `attendedBy`
--   (as demais chaves do payload Kenlo são mantidas).
--
-- PREMISSAS DE SCHEMA (a tabela base foi criada fora deste repo — confirme antes de aplicar):
--   - kenlo_leads.id é UUID
--       (inferido: o trigger tg_mirror_kenlo_leads_to_bolsao insere NEW.id em
--        bolsao.source_kenlo_id, que é UUID — ver 20260427_mirror_leads_and_kenlo_into_bolsao.sql).
--   - kenlo_leads.tenant_id é UUID e raw_data é JSONB.
--   Se algum tipo diferir, ajuste a assinatura/casts abaixo antes de aplicar.

create or replace function public.assign_broker_to_leads(
  p_tenant_id uuid,
  p_lead_ids uuid[],
  p_broker_id text,
  p_broker_name text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.kenlo_leads
     set raw_data = coalesce(raw_data, '{}'::jsonb)
                    || jsonb_build_object(
                         'attendedBy',
                         jsonb_build_array(
                           jsonb_build_object('id', p_broker_id, 'name', p_broker_name)
                         )
                       )
   where tenant_id = p_tenant_id
     and id = any(p_lead_ids);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Least-privilege: apenas o backend (service_role) chama. Nunca expor a anon/authenticated
-- via PostgREST (evita que um cliente atribua corretores arbitrariamente).
revoke execute on function public.assign_broker_to_leads(uuid, uuid[], text, text) from public;
grant  execute on function public.assign_broker_to_leads(uuid, uuid[], text, text) to service_role;

comment on function public.assign_broker_to_leads(uuid, uuid[], text, text) is
  'Seta raw_data.attendedBy=[{id,name}] nos kenlo_leads informados (merge na raiz, escopado por tenant). Retorna o nº de linhas atualizadas. Uso: backend/service_role (POST /api/v1/brokers/:id/assign).';
